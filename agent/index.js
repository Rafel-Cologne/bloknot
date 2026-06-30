/**
 * Bloknot Email Agent
 *
 * Запускается через GitHub Actions каждые 20 минут.
 * Читает письма в bloknot.app@gmail.com, классифицирует их через Claude API,
 * извлекает данные (брони, счета) и пишет в Supabase.
 *
 * Переменные окружения (GitHub Secrets):
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const PROCESSED_LABEL = 'bloknot-processed'
const ATTENTION_LABEL  = 'bloknot-needs-attention'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase  = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Gmail setup ───────────────────────────────────────────────────────────────

function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth })
}

// ── Helper: ensure Gmail label exists, return id ──────────────────────────────

async function ensureLabel(gmail, name) {
  const { data } = await gmail.users.labels.list({ userId: 'me' })
  const existing = data.labels.find(l => l.name === name)
  if (existing) return existing.id
  const { data: created } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  })
  return created.id
}

// ── Helper: extract plain text + attachments from message ────────────────────

function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
    }
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }
  return ''
}

function extractToHeader(payload) {
  return payload?.headers?.find(h => h.name.toLowerCase() === 'to')?.value ?? ''
}

function extractSubject(payload) {
  return payload?.headers?.find(h => h.name.toLowerCase() === 'subject')?.value ?? ''
}

function extractFromHeader(payload) {
  return payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value ?? ''
}

async function getAttachmentData(gmail, messageId, attachmentId) {
  try {
    const { data } = await gmail.users.messages.attachments.get({
      userId: 'me', messageId, id: attachmentId,
    })
    return data.data // base64url encoded
  } catch { return null }
}

function findPdfAttachments(payload) {
  const attachments = []
  const walk = (part) => {
    if (part.mimeType === 'application/pdf' && part.body?.attachmentId) {
      attachments.push({ name: part.filename, id: part.body.attachmentId })
    }
    if (part.parts) part.parts.forEach(walk)
  }
  walk(payload)
  return attachments
}

// ── Helper: parse alias from To field ────────────────────────────────────────

function parseAlias(toHeader) {
  // bloknot.app+rafael@gmail.com → "rafael"
  const match = toHeader.match(/bloknot\.app\+([a-z0-9._-]+)@gmail\.com/i)
  return match?.[1]?.toLowerCase() ?? null
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function getUserIdByAlias(alias) {
  const { data } = await supabase
    .from('user_email_aliases')
    .select('user_id')
    .eq('alias', alias)
    .single()
  return data?.user_id ?? null
}

async function getApartmentsForUser(userId) {
  const { data } = await supabase
    .from('apartments')
    .select('id, title, address, full_address')
    .eq('owner_id', userId)
  return data ?? []
}

// ── Claude: classify email ────────────────────────────────────────────────────

async function classifyEmail(subject, body, from) {
  const prompt = `Classify this email into one of these categories:
- "booking_airbnb": new/confirmed/modified/cancelled Airbnb booking
- "booking_booking": new/confirmed/modified/cancelled Booking.com booking
- "invoice": utility bill or invoice (electricity, water, gas, internet, insurance)
- "other": anything else

From: ${from}
Subject: ${subject}
Body (first 1500 chars): ${body.slice(0, 1500)}

Reply with ONLY the category name, nothing else.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 10,
    messages: [{ role: 'user', content: prompt }],
  })
  return msg.content[0].text.trim().toLowerCase()
}

// ── Claude: extract booking data ──────────────────────────────────────────────

async function extractBookingData(subject, body, source, apartments) {
  const aptList = apartments.map(a => `- id: ${a.id}, title: "${a.title}", address: "${a.full_address ?? a.address}"`).join('\n')

  const prompt = `Extract booking information from this ${source} email and return valid JSON.

Available apartments:
${aptList}

Email subject: ${subject}
Email body: ${body.slice(0, 3000)}

Return JSON with these exact fields (null if unknown):
{
  "guest_name": string,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "guests_count": number,
  "total_amount": number or null,
  "external_booking_id": string or null,
  "apartment_id": string (pick from the list above, or null if unclear),
  "action": "new" | "modified" | "cancelled",
  "confidence": "high" | "medium" | "low"
}
Only return the JSON object, no explanation.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  try {
    return JSON.parse(msg.content[0].text.trim())
  } catch {
    return null
  }
}

// ── Claude: extract invoice data ──────────────────────────────────────────────

async function extractInvoiceData(body, pdfText, apartments) {
  const aptList = apartments.map(a =>
    `- id: ${a.id}, title: "${a.title}", address: "${a.full_address ?? a.address}"`
  ).join('\n')

  const content = pdfText ? `PDF content: ${pdfText.slice(0, 2000)}` : `Email body: ${body.slice(0, 2000)}`

  const prompt = `Extract invoice/bill information and return valid JSON.

Available apartments (match by address in the bill):
${aptList}

${content}

Return JSON:
{
  "category": "electricity" | "water" | "gas" | "internet" | "insurance" | "ibi" | "other",
  "amount": number,
  "invoice_period_start": "YYYY-MM-DD" or null,
  "invoice_period_end": "YYYY-MM-DD" or null,
  "provider": string or null,
  "apartment_id": string (from list above, or null if unclear),
  "confidence": "high" | "medium" | "low"
}
Only return the JSON object.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  try {
    return JSON.parse(msg.content[0].text.trim())
  } catch {
    return null
  }
}

// ── Process one booking email ──────────────────────────────────────────────────

async function processBooking(data, userId, source) {
  if (!data || !data.apartment_id || !data.start_date || !data.end_date) return false
  const lowConf = data.confidence === 'low'

  if (data.action === 'new' || data.action === 'modified') {
    // Try to find existing by external_booking_id
    let existing = null
    if (data.external_booking_id) {
      const { data: found } = await supabase.from('bookings')
        .select('id').eq('external_booking_id', data.external_booking_id).is('deleted_at', null).single()
      existing = found
    }

    const payload = {
      apartment_id: data.apartment_id,
      guest_name: data.guest_name ?? 'Гость',
      guest_phone: '',
      start_date: data.start_date,
      end_date: data.end_date,
      guests_count: data.guests_count ?? 1,
      status: 'accepted',
      source,
      total_amount: data.total_amount,
      external_booking_id: data.external_booking_id,
      created_by_agent: true,
    }

    if (existing) {
      if (!DRY_RUN) {
        await supabase.from('bookings').update({
          ...payload, status: lowConf ? 'pending' : 'accepted',
        }).eq('id', existing.id)
      }
      return { action: 'updated', low_conf: lowConf }
    } else {
      if (!DRY_RUN) {
        await supabase.from('bookings').insert({
          ...payload, status: lowConf ? 'pending' : 'accepted',
        })
      }
      return { action: 'created', low_conf: lowConf }
    }
  }

  if (data.action === 'cancelled' && data.external_booking_id) {
    if (!DRY_RUN) {
      await supabase.from('bookings')
        .update({ status: 'cancelled' })
        .eq('external_booking_id', data.external_booking_id)
        .is('deleted_at', null)
    }
    return { action: 'cancelled' }
  }

  return false
}

// ── Process one invoice email ──────────────────────────────────────────────────

async function processInvoice(data, userId, expenseDate) {
  if (!data || !data.amount || !data.apartment_id) return false

  const status = data.confidence === 'low' ? 'pending_confirmation' : 'pending_confirmation'
  // All agent-created expenses go to pending_confirmation for user review

  if (!DRY_RUN) {
    await supabase.from('expenses').insert({
      apartment_id: data.apartment_id,
      owner_id: userId,
      category: data.category ?? 'other',
      amount: data.amount,
      invoice_period_start: data.invoice_period_start,
      invoice_period_end: data.invoice_period_end,
      expense_date: expenseDate,
      provider: data.provider,
      source: 'email_agent',
      status: 'pending_confirmation',
    })
  }
  return true
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[Bloknot Agent] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`)

  const gmail = getGmailClient()
  const processedLabelId = await ensureLabel(gmail, PROCESSED_LABEL)
  const attentionLabelId  = await ensureLabel(gmail, ATTENTION_LABEL)

  // Fetch unread, unlabeled messages
  const { data: msgList } = await gmail.users.messages.list({
    userId: 'me',
    q: `is:unread -label:${PROCESSED_LABEL}`,
    maxResults: 50,
  })

  const messages = msgList.messages ?? []
  console.log(`[Agent] Found ${messages.length} messages to process`)

  const stats = {
    emails_checked: messages.length,
    bookings_created: 0,
    bookings_updated: 0,
    expenses_created: 0,
    skipped: 0,
    errors: [],
  }

  for (const { id: msgId } of messages) {
    try {
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me', id: msgId, format: 'full',
      })

      const toHeader   = extractToHeader(msg.payload)
      const subject    = extractSubject(msg.payload)
      const from       = extractFromHeader(msg.payload)
      const body       = extractBody(msg.payload)
      const alias      = parseAlias(toHeader)

      if (!alias) {
        console.log(`[Agent] ${msgId}: no alias in To: header, skipping`)
        stats.skipped++
        await gmail.users.messages.modify({ userId: 'me', id: msgId, requestBody: {
          addLabelIds: [processedLabelId], removeLabelIds: ['UNREAD'],
        }})
        continue
      }

      const userId = await getUserIdByAlias(alias)
      if (!userId) {
        console.log(`[Agent] ${msgId}: unknown alias "${alias}", skipping`)
        stats.skipped++
        await gmail.users.messages.modify({ userId: 'me', id: msgId, requestBody: {
          addLabelIds: [processedLabelId], removeLabelIds: ['UNREAD'],
        }})
        continue
      }

      const apartments = await getApartmentsForUser(userId)
      const category   = await classifyEmail(subject, body, from)
      const today      = new Date().toISOString().slice(0, 10)

      console.log(`[Agent] ${msgId}: alias=${alias} category=${category} subject="${subject}"`)

      let needsAttention = false

      if (category === 'booking_airbnb' || category === 'booking_booking') {
        const source = category === 'booking_airbnb' ? 'airbnb' : 'booking'
        const data   = await extractBookingData(subject, body, source, apartments)
        const result = await processBooking(data, userId, source)

        if (!result) {
          needsAttention = true
          stats.skipped++
        } else if (result.action === 'created') {
          stats.bookings_created++
          if (result.low_conf) needsAttention = true
        } else if (result.action === 'updated') {
          stats.bookings_updated++
          if (result.low_conf) needsAttention = true
        }

      } else if (category === 'invoice') {
        // Try to get PDF text
        let pdfText = null
        const pdfAttachments = findPdfAttachments(msg.payload)
        if (pdfAttachments.length > 0) {
          // We have the raw base64 but parsing PDFs needs pdf-parse
          // For now pass null; Claude will use the email body
          pdfText = null
        }

        const data   = await extractInvoiceData(body, pdfText, apartments)
        const result = await processInvoice(data, userId, today)

        if (!result) {
          needsAttention = true
          stats.skipped++
        } else {
          stats.expenses_created++
          if (data?.confidence === 'low' || !data?.apartment_id) needsAttention = true
        }
      } else {
        stats.skipped++
      }

      // Mark message as processed
      if (!DRY_RUN) {
        const addLabels = [processedLabelId]
        if (needsAttention) addLabels.push(attentionLabelId)
        await gmail.users.messages.modify({
          userId: 'me', id: msgId,
          requestBody: { addLabelIds: addLabels, removeLabelIds: ['UNREAD'] },
        })
      }

    } catch (err) {
      console.error(`[Agent] Error processing ${msgId}:`, err.message)
      stats.errors.push({ email_id: msgId, error: err.message, stage: 'processing' })
    }
  }

  // Log to Supabase
  const runStatus = stats.errors.length === 0
    ? 'success'
    : stats.errors.length < messages.length
    ? 'partial'
    : 'failed'

  if (!DRY_RUN) {
    await supabase.from('agent_logs').insert({
      emails_checked:   stats.emails_checked,
      bookings_created: stats.bookings_created,
      bookings_updated: stats.bookings_updated,
      expenses_created: stats.expenses_created,
      skipped:          stats.skipped,
      errors:           stats.errors.length > 0 ? stats.errors : null,
      status:           runStatus,
    })
  }

  console.log('[Agent] Done:', JSON.stringify(stats, null, 2))
  process.exit(runStatus === 'failed' ? 1 : 0)
}

main().catch(err => {
  console.error('[Agent] Fatal:', err)
  process.exit(1)
})
