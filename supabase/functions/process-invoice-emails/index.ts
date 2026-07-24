import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const DEFAULT_ALIAS = "rafael";

const BOOKING_SENDER_DOMAINS = ["airbnb.com", "booking.com"];
const INVOICE_TEXT_KEYWORDS = ["factura", "importe", "consumo", "recibo", "contrato"];
const BOOKING_SUBJECT_KEYWORDS = [
  "bestätigt", "bestätigung", "auszahlung", "storniert", "stornierung",
  "änderung", "geändert", "buchung", "reservierung", "anfrage",
  "confirmed", "confirmation", "reservation", "booking", "payout",
  "cancelled", "canceled", "cancellation", "modified", "itinerary",
  "confirmada", "confirmación", "reserva", "cancelada", "pago",
];
// Признаки того, что письмо содержит банковскую выписку (движения по счёту), а не отдельный счёт.
// Ищем и в теле письма, и в теме — банки часто присылают выписку как PDF-вложение с сопроводительным
// текстом вроде "Abfrage von Kontobewegungen" (именно так подписан реальный экспорт BancSabadell).
const BANK_STATEMENT_KEYWORDS = [
  "kontobewegungen", "kontoauszug", "abfrage von kontobewegungen",
  "estado de cuenta", "movimientos de cuenta", "extracto de cuenta",
  "account statement", "bank statement", "consulta de movimientos",
];
// Ровно те категории, что понимает UI (EXP_CATEGORIES в OwnerDashboard.tsx) — Claude должен
// выбирать строго один из этих английских кодов, не переводить их.
const EXPENSE_CATEGORY_CODES = [
  "electricity", "water", "gas", "internet", "repair", "furniture",
  "appliances", "insurance", "ibi", "cleaning", "community_fee",
  "tax_non_resident", "loan_payment", "bank_fee", "other",
];

type RunLog = {
  emails_checked: number;
  expenses_created: number;
  bookings_created: number;
  bookings_updated: number;
  bookings_cancelled: number;
  bank_statements_queued: number;
  auto_applied: number;
  skipped: number;
  errors: unknown[];
  debug: unknown[];
};

type ApartmentRow = { id: string; owner_id: string; title: string; address: string; full_address: string | null; cleaner_id: string | null; cleaning_fee: number };

// deno-lint-ignore no-explicit-any
type SupabaseClientAny = any;

type RecurringExpenseRow = {
  id: string;
  owner_id: string;
  apartment_id: string;
  category: string;
  amount: number;
  provider: string | null;
  description: string | null;
  day_of_month: number;
  last_generated_month: string | null;
};

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function generateRecurringExpenses(supabase: SupabaseClientAny, log: RunLog) {
  const { data: recurring } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("active", true);

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const currentMonth = `${y}-${String(m).padStart(2, "0")}`;
  const todayDay = today.getDate();

  for (const r of (recurring ?? []) as RecurringExpenseRow[]) {
    if (r.last_generated_month === currentMonth) continue;
    if (todayDay < r.day_of_month) continue;

    const lastDay = new Date(y, m, 0).getDate();
    const day = Math.min(r.day_of_month, lastDay);
    const expenseDate = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const { error: insErr } = await supabase.from("expenses").insert({
      apartment_id: r.apartment_id,
      owner_id: r.owner_id,
      category: r.category,
      amount: r.amount,
      expense_date: expenseDate,
      provider: r.provider,
      description: r.description,
      source: "recurring",
      status: "confirmed",
      recurring_expense_id: r.id,
    });

    if (insErr) {
      log.errors.push({ recurringExpenseId: r.id, error: String(insErr) });
      continue;
    }

    await supabase.from("recurring_expenses").update({ last_generated_month: currentMonth }).eq("id", r.id);
    log.expenses_created++;
    log.debug.push({ recurringExpenseId: r.id, note: "auto-generated recurring expense", expenseDate, amount: r.amount });
  }
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function findExistingBooking(
  supabase: SupabaseClientAny,
  aptId: string,
  extraction: { external_booking_id?: string | null; guest_name?: string | null; start_date?: string | null },
): Promise<{ id: string; guest_name: string; start_date: string; end_date: string; total_amount: number | null } | null> {
  if (extraction.external_booking_id) {
    const { data } = await supabase
      .from("bookings")
      .select("id, guest_name, start_date, end_date, total_amount")
      .eq("apartment_id", aptId)
      .eq("external_booking_id", extraction.external_booking_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) return data;
  }

  if (!extraction.start_date) return null;
  const guestFirstName = (extraction.guest_name ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  const { data: candidates } = await supabase
    .from("bookings")
    .select("id, guest_name, start_date, end_date, total_amount")
    .eq("apartment_id", aptId)
    .is("deleted_at", null)
    .gte("start_date", addDaysStr(extraction.start_date, -3))
    .lte("start_date", addDaysStr(extraction.start_date, 3));
  return (candidates ?? []).find((c: { id: string; guest_name: string }) =>
    guestFirstName && (c.guest_name ?? "").toLowerCase().includes(guestFirstName)
  ) ?? null;
}

async function queueEvent(
  supabase: SupabaseClientAny,
  log: RunLog,
  autoApply: boolean,
  row: {
    owner_id: string;
    apartment_id: string | null;
    kind: "booking_new" | "booking_update" | "booking_cancel" | "expense" | "bank_statement";
    source_message_id: string;
    existing_booking_id?: string | null;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { data: inserted, error: evErr } = await supabase
    .from("agent_pending_events")
    .insert({
      owner_id: row.owner_id,
      apartment_id: row.apartment_id,
      kind: row.kind,
      source_message_id: row.source_message_id,
      existing_booking_id: row.existing_booking_id ?? null,
      payload: row.payload,
    })
    .select("id")
    .single();
  if (evErr) throw evErr;

  if (row.kind === "booking_new") log.bookings_created++;
  else if (row.kind === "booking_update") log.bookings_updated++;
  else if (row.kind === "booking_cancel") log.bookings_cancelled++;
  else if (row.kind === "bank_statement") log.bank_statements_queued++;
  else log.expenses_created++;

  if (autoApply) {
    const { error: applyErr } = await supabase.rpc("apply_pending_event", { p_event_id: inserted.id });
    if (applyErr) {
      log.debug.push({ note: "auto-apply failed, left as pending for manual review", eventId: inserted.id, error: String(applyErr) });
    } else {
      log.auto_applied++;
      log.debug.push({ note: "auto-applied", kind: row.kind, eventId: inserted.id, payload: row.payload });
    }
  } else {
    log.debug.push({ note: "queued for owner review (colokolchik)", kind: row.kind, payload: row.payload });
  }
}

// deno-lint-ignore no-explicit-any
async function getGmailProfile(accessToken: string): Promise<{ historyId: string | null }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { historyId: null };
  const json = await res.json();
  return { historyId: json.historyId != null ? String(json.historyId) : null };
}

// Gmail History API — возвращает ТОЛЬКО новые письма с момента startHistoryId,
// вместо того чтобы каждый раз перечитывать весь диапазон дат. Гораздо быстрее,
// особенно когда новых писем нет вообще. Если Gmail „забыл“ startHistoryId (обычно если
// агент не запускался >7 дней) — вернём expired:true, и вызывающий код сделает одноразовый
// полный скан по датам для восстановления.
async function listNewMessagesViaHistory(
  accessToken: string,
  startHistoryId: string,
): Promise<{ ids: string[]; newHistoryId: string | null; expired: boolean }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let newHistoryId: string | null = null;
  let expired = false;
  let pages = 0;

  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
    url.searchParams.set("startHistoryId", startHistoryId);
    url.searchParams.set("historyTypes", "messageAdded");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 404) { expired = true; break; }
    const json = await res.json();
    if (!res.ok) { expired = true; break; }

    for (const h of json.history ?? []) {
      for (const ma of h.messagesAdded ?? []) {
        if (ma.message?.id) ids.add(ma.message.id as string);
      }
    }
    if (json.historyId) newHistoryId = String(json.historyId);
    pageToken = json.nextPageToken;
    pages++;
  } while (pageToken && pages < 5);

  return { ids: Array.from(ids), newHistoryId, expired };
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const log: RunLog = {
    emails_checked: 0, expenses_created: 0, bookings_created: 0, bookings_updated: 0,
    bookings_cancelled: 0, bank_statements_queued: 0, auto_applied: 0, skipped: 0, errors: [], debug: [],
  };

  try {
    await generateRecurringExpenses(supabase, log);

    const accessToken = await getGmailAccessToken();

    // ── Открытие НОВЫХ писем: сначала пробуем инкрементальный Gmail History API (быстро, только
    // действительно новое), и только если нет сохранённой точки отсчёта или Gmail сказал, что
    // она устарела — откатываемся к старому полному скану по датам (как раньше), но это теперь
    // редкий аварийный случай, а не каждый запуск.
    const { data: syncState } = await supabase
      .from("agent_sync_state")
      .select("last_history_id")
      .eq("id", true)
      .maybeSingle();
    const storedHistoryId: string | null = syncState?.last_history_id ?? null;

    let messageIds: string[] = [];
    let nextHistoryId: string | null = null;
    let usedFallbackScan = false;

    if (storedHistoryId) {
      const { ids, newHistoryId, expired } = await listNewMessagesViaHistory(accessToken, storedHistoryId);
      if (expired) {
        usedFallbackScan = true;
        log.debug.push({ note: "gmail historyId expired (agent probably idle >7 days) — falling back to full date-range scan once" });
      } else {
        messageIds = ids;
        nextHistoryId = newHistoryId ?? storedHistoryId;
      }
    }

    if (!storedHistoryId || usedFallbackScan) {
      const { data: lastRun } = await supabase
        .from("agent_logs")
        .select("run_at")
        .eq("status", "success")
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const since = lastRun?.run_at ? new Date(lastRun.run_at) : new Date(Date.now() - 30 * 86400000);
      since.setDate(since.getDate() - 1);
      const gmailDate = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;
      const gmailQuery = `after:${gmailDate}`;

      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listJson = await listRes.json();
      messageIds = (listJson.messages ?? []).map((m: { id: string }) => m.id);

      const profile = await getGmailProfile(accessToken);
      nextHistoryId = profile.historyId;
    }

    const messages: { id: string }[] = messageIds.map((id) => ({ id }));
    log.emails_checked = messages.length;

    const { data: aliases } = await supabase.from("user_email_aliases").select("alias, user_id");
    const { data: apartmentsRaw } = await supabase
      .from("apartments")
      .select("id, owner_id, title, address, full_address, cleaner_id, cleaning_fee");
    const apartments = (apartmentsRaw ?? []) as ApartmentRow[];
    const { data: profilesRaw } = await supabase.from("profiles").select("id, agent_auto_apply");
    const autoApplyByOwner = new Map<string, boolean>(
      (profilesRaw ?? []).map((p: { id: string; agent_auto_apply: boolean | null }) => [p.id, !!p.agent_auto_apply]),
    );

    const [existingEventsRes, existingBookingsRes, existingExpensesRes] = messageIds.length
      ? await Promise.all([
          supabase.from("agent_pending_events").select("source_message_id").in("source_message_id", messageIds),
          supabase.from("bookings").select("source_message_id").in("source_message_id", messageIds),
          supabase.from("expenses").select("source_message_id").in("source_message_id", messageIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
    const alreadyQueuedIds = new Set((existingEventsRes.data ?? []).map((r: { source_message_id: string }) => r.source_message_id));
    const alreadyBookingIds = new Set((existingBookingsRes.data ?? []).map((r: { source_message_id: string }) => r.source_message_id));
    const alreadyExpenseIds = new Set((existingExpensesRes.data ?? []).map((r: { source_message_id: string }) => r.source_message_id));

    const fetchedMessages = await mapWithConcurrency(messages, 8, async (m) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        // deno-lint-ignore no-explicit-any
        const msg: any = await msgRes.json();
        return { id: m.id, msg, fetchError: null as unknown };
      } catch (e) {
        return { id: m.id, msg: null, fetchError: e };
      }
    });

    for (const { id: msgId, msg, fetchError } of fetchedMessages) {
      try {
        if (fetchError || !msg) {
          log.errors.push({ messageId: msgId, error: String(fetchError ?? "empty gmail response") });
          continue;
        }

        const headers = Object.fromEntries(
          (msg.payload?.headers ?? []).map((h: { name: string; value: string }) => [h.name.toLowerCase(), h.value]),
        );
        const toHeader: string = headers["delivered-to"] || headers["to"] || "";
        const fromHeader: string = (headers["from"] || "").toLowerCase();
        const subjectHeader: string = (headers["subject"] || "").toLowerCase();
        const aliasMatch = toHeader.match(/\+([a-z0-9._-]+)@/i);
        const alias = aliasMatch ? aliasMatch[1].toLowerCase() : DEFAULT_ALIAS;
        const ownerId: string | null = aliases?.find((a) => a.alias === alias)?.user_id ?? null;

        if (!ownerId) {
          log.skipped++;
          log.debug.push({ messageId: msgId, reason: "no owner for alias", alias, toHeader });
          continue;
        }

        const ownerApartments = apartments.filter((a) => a.owner_id === ownerId);
        if (ownerApartments.length === 0) {
          log.skipped++;
          log.debug.push({ messageId: msgId, reason: "owner has no apartments" });
          continue;
        }
        const autoApply = autoApplyByOwner.get(ownerId) ?? false;

        const parts = flattenParts(msg.payload);
        const pdfPart = parts.find((p) => p.mimeType === "application/pdf" && p.body?.attachmentId);
        const isBookingSender = BOOKING_SENDER_DOMAINS.some((d) => fromHeader.includes(d));
        const bodyText = extractPlainText(msg.payload) ?? msg.snippet ?? "";

        if (alreadyQueuedIds.has(msgId)) {
          log.debug.push({ messageId: msgId, note: "already queued/resolved in agent_pending_events" });
          continue;
        }

        if (isBookingSender) {
          if (alreadyBookingIds.has(msgId)) {
            log.debug.push({ messageId: msgId, note: "booking email already processed" });
            continue;
          }

          const looksLikeBookingSubject = BOOKING_SUBJECT_KEYWORDS.some((k) => subjectHeader.includes(k));
          if (!looksLikeBookingSubject) {
            log.skipped++;
            log.debug.push({
              messageId: msgId,
              reason: "airbnb/booking email, subject doesn't look transactional — skipped before calling Claude",
              subject: headers["subject"],
            });
            continue;
          }

          const { extraction, raw, apiError } = await extractBooking(bodyText, ownerApartments);
          if (apiError) log.debug.push({ messageId: msgId, apiError });
          if (raw) log.debug.push({ messageId: msgId, rawClaudeText: raw });

          if (!extraction || !extraction.apartment_id) {
            log.skipped++;
            log.debug.push({ messageId: msgId, reason: "no usable booking extraction", extraction });
            continue;
          }

          const apt = ownerApartments.find((a) => a.id === extraction.apartment_id);
          if (!apt) {
            log.skipped++;
            log.debug.push({ messageId: msgId, reason: "extracted apartment_id not found", extraction });
            continue;
          }

          if (extraction.is_cancellation) {
            const existingBooking = await findExistingBooking(supabase, apt.id, extraction);
            if (!existingBooking) {
              log.skipped++;
              log.debug.push({ messageId: msgId, reason: "cancellation email but no matching existing booking found", extraction });
              continue;
            }

            await queueEvent(supabase, log, autoApply, {
              owner_id: ownerId,
              apartment_id: apt.id,
              kind: "booking_cancel",
              source_message_id: msgId,
              existing_booking_id: existingBooking.id,
              payload: {
                apartment_title: apt.title,
                guest_name: existingBooking.guest_name,
                start_date: existingBooking.start_date,
                end_date: existingBooking.end_date,
                total_amount: existingBooking.total_amount,
              },
            });
            continue;
          }

          if (!extraction.start_date || !extraction.end_date) {
            log.skipped++;
            log.debug.push({ messageId: msgId, reason: "no usable booking extraction", extraction });
            continue;
          }

          const existingBooking = await findExistingBooking(supabase, apt.id, extraction);

          const bookingPayload = {
            apartment_title: apt.title,
            guest_name: extraction.guest_name ?? "",
            start_date: extraction.start_date,
            end_date: extraction.end_date,
            guests_count: extraction.guests_count ?? 1,
            source: extraction.source ?? "airbnb",
            total_amount: extraction.total_amount ?? null,
            cleaning_fee_amount: extraction.cleaning_fee ?? null,
            host_service_fee_amount: extraction.host_service_fee ?? null,
            external_booking_id: extraction.external_booking_id ?? null,
          };

          await queueEvent(supabase, log, autoApply, {
            owner_id: ownerId,
            apartment_id: apt.id,
            kind: existingBooking ? "booking_update" : "booking_new",
            source_message_id: msgId,
            existing_booking_id: existingBooking?.id ?? null,
            payload: bookingPayload,
          });
          continue;
        }

        // ── Банковская выписка: письмо не от Airbnb/Booking, а тема или текст письма
        // указывают на выгрузку движений по счёту (а не на отдельный счёт за услугу).
        // В этом случае извлекаем ВСЕ строки выписки одним запросом к Claude и кладём их
        // единым событием — хозяин разбирает их сам в приложении (галочки/правки/удаление),
        // поэтому НИКОГДА не auto-apply, даже если у владельца включено автообновление.
        const isBankStatementEmail = BANK_STATEMENT_KEYWORDS.some((k) => bodyText.toLowerCase().includes(k) || subjectHeader.includes(k));
        if (isBankStatementEmail) {
          if (!pdfPart) {
            log.skipped++;
            log.debug.push({ messageId: msgId, reason: "looks like a bank statement email but has no pdf attachment" });
            continue;
          }

          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${pdfPart.body.attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const attJson = await attRes.json();
          const pdfBase64 = attJson.data ? base64UrlToBase64(attJson.data as string) : null;
          if (!pdfBase64) {
            log.skipped++;
            log.debug.push({ messageId: msgId, reason: "bank statement pdf attachment fetch returned no data", attRes: attJson });
            continue;
          }

          const { extraction, raw, apiError } = await extractBankStatement(pdfBase64, ownerApartments);
          if (apiError) log.debug.push({ messageId: msgId, apiError });
          if (raw) log.debug.push({ messageId: msgId, rawClaudeText: raw });

          if (!extraction || !extraction.line_items || extraction.line_items.length === 0) {
            log.skipped++;
            log.debug.push({ messageId: msgId, reason: "no usable line items extracted from bank statement", extraction });
            continue;
          }

          await queueEvent(supabase, log, false, {
            owner_id: ownerId,
            apartment_id: null,
            kind: "bank_statement",
            source_message_id: msgId,
            payload: {
              filename: pdfPart.filename ?? "Банковская выписка",
              statement_date_range: extraction.statement_date_range ?? null,
              line_items: extraction.line_items,
            },
          });
          continue;
        }

        const looksLikeInvoiceText = INVOICE_TEXT_KEYWORDS.some((k) => bodyText.toLowerCase().includes(k));
        if (!pdfPart && !looksLikeInvoiceText) {
          log.skipped++;
          log.debug.push({ messageId: msgId, reason: "not a booking email, no pdf attachment, no invoice keywords", from: fromHeader });
          continue;
        }

        if (alreadyExpenseIds.has(msgId)) {
          log.debug.push({ messageId: msgId, note: "already processed" });
          continue;
        }

        const ownerApartmentsWithAddress = ownerApartments.filter((a) => a.full_address);
        if (ownerApartmentsWithAddress.length === 0) {
          log.skipped++;
          log.debug.push({ messageId: msgId, reason: "owner has no apartments with full_address" });
          continue;
        }

        let pdfBase64: string | null = null;
        if (pdfPart) {
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${pdfPart.body.attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const attJson = await attRes.json();
          if (attJson.data) pdfBase64 = base64UrlToBase64(attJson.data as string);
          else log.debug.push({ messageId: msgId, note: "attachment fetch returned no data", attRes: attJson });
        }

        const { extraction, raw, apiError } = await extractInvoice(bodyText, pdfBase64, ownerApartmentsWithAddress);
        if (apiError) log.debug.push({ messageId: msgId, apiError });
        if (raw) log.debug.push({ messageId: msgId, rawClaudeText: raw });

        if (!extraction || !extraction.amount || !extraction.category) {
          log.skipped++;
          log.debug.push({ messageId: msgId, reason: "no usable extraction", extraction });
          continue;
        }

        let apartmentId: string | null = extraction.confidence === "low" ? null : extraction.apartment_id;
        if (!apartmentId && ownerApartmentsWithAddress.length === 1) apartmentId = ownerApartmentsWithAddress[0].id;
        if (!apartmentId) {
          log.skipped++;
          log.debug.push({ messageId: msgId, reason: "could not match apartment", extraction });
          continue;
        }

        let dupQuery = supabase
          .from("expenses")
          .select("id")
          .eq("apartment_id", apartmentId)
          .eq("category", extraction.category)
          .eq("amount", extraction.amount)
          .is("deleted_at", null)
          .neq("status", "rejected");
        if (extraction.period_start && extraction.period_end) {
          dupQuery = dupQuery.eq("invoice_period_start", extraction.period_start).eq("invoice_period_end", extraction.period_end);
        } else if (extraction.invoice_date) {
          dupQuery = dupQuery.eq("expense_date", extraction.invoice_date);
        }
        const { data: dupRows } = await dupQuery.limit(1);
        if (dupRows && dupRows.length > 0) {
          log.skipped++;
          log.debug.push({ messageId: msgId, reason: "duplicate invoice content (same apartment/category/amount/period already exists)", extraction });
          continue;
        }

        const apartmentForExpense = ownerApartmentsWithAddress.find((a) => a.id === apartmentId);

        await queueEvent(supabase, log, autoApply, {
          owner_id: ownerId,
          apartment_id: apartmentId,
          kind: "expense",
          source_message_id: msgId,
          payload: {
            apartment_title: apartmentForExpense?.title ?? null,
            category: extraction.category,
            amount: extraction.amount,
            invoice_date: extraction.invoice_date,
            period_start: extraction.period_start,
            period_end: extraction.period_end,
            period_label: extraction.period_label,
            provider: extraction.provider,
            description: extraction.description,
          },
        });
      } catch (e) {
        log.errors.push({ messageId: msgId, error: String(e) });
      }
    }

    if (nextHistoryId) {
      await supabase.from("agent_sync_state").update({ last_history_id: nextHistoryId, updated_at: new Date().toISOString() }).eq("id", true);
    }

    await supabase.from("agent_logs").insert({
      emails_checked: log.emails_checked,
      expenses_created: log.expenses_created,
      bookings_created: log.bookings_created,
      bookings_updated: log.bookings_updated,
      skipped: log.skipped,
      errors: log.errors.length ? log.errors : null,
      status: log.errors.length ? "partial" : "success",
    });

    return new Response(JSON.stringify(log), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    await supabase.from("agent_logs").insert({
      emails_checked: log.emails_checked,
      expenses_created: log.expenses_created,
      bookings_created: log.bookings_created,
      bookings_updated: log.bookings_updated,
      skipped: log.skipped,
      errors: [{ fatal: String(e) }],
      status: "failed",
    });
    return new Response(JSON.stringify({ fatal: String(e), log }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

async function getGmailAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Gmail token refresh failed: " + JSON.stringify(json));
  return json.access_token as string;
}

// deno-lint-ignore no-explicit-any
function flattenParts(payload: any): any[] {
  if (!payload) return [];
  // deno-lint-ignore no-explicit-any
  const parts: any[] = [];
  // deno-lint-ignore no-explicit-any
  function walk(p: any) {
    if (p.parts) p.parts.forEach(walk);
    else parts.push(p);
  }
  walk(payload);
  return parts;
}

// deno-lint-ignore no-explicit-any
function extractPlainText(payload: any): string | null {
  const parts = flattenParts(payload);
  const textPart = parts.find((p) => p.mimeType === "text/plain") ?? parts.find((p) => p.mimeType === "text/html");
  if (!textPart?.body?.data) return null;
  return atob(base64UrlToBase64(textPart.body.data));
}

function base64UrlToBase64(s: string): string {
  return s.replace(/-/g, "+").replace(/_/g, "/");
}

type Extraction = {
  provider: string | null;
  category: string | null;
  amount: number | null;
  invoice_date: string | null;
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  description: string | null;
  apartment_id: string | null;
  confidence: "high" | "low";
};

type BookingExtraction = {
  apartment_id: string | null;
  guest_name: string | null;
  start_date: string | null;
  end_date: string | null;
  guests_count: number | null;
  total_amount: number | null;
  cleaning_fee: number | null;
  host_service_fee: number | null;
  external_booking_id: string | null;
  source: "airbnb" | "booking" | "other" | null;
  is_cancellation?: boolean;
};

type BankStatementLineItem = {
  date: string | null;
  description: string | null;
  amount: number | null;
  is_credit: boolean;
  provider: string | null;
  suggested_category: string | null;
  suggested_apartment_id: string | null;
  suggested_split: boolean;
  suggested_include: boolean;
};

type BankStatementExtraction = {
  statement_date_range: string | null;
  line_items: BankStatementLineItem[];
};

async function callClaude(content: unknown[]): Promise<{ text?: string; apiError?: unknown }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    }),
  });
  const json = await res.json();
  if (!res.ok) return { apiError: json };
  const blocks = Array.isArray(json?.content) ? json.content : [];
  // deno-lint-ignore no-explicit-any
  const textBlock = blocks.find((b: any) => b && b.type === "text" && typeof b.text === "string");
  const text = textBlock?.text;
  if (!text) return { apiError: json };
  return { text };
}

async function extractInvoice(
  bodyText: string,
  pdfBase64: string | null,
  apartments: ApartmentRow[],
): Promise<{ extraction: Extraction | null; raw?: string; apiError?: unknown }> {
  const aptList = apartments.map((a) => `- id: ${a.id}, адрес: ${a.full_address}`).join("\n");
  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  if (pdfBase64) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
  }
  content.push({
    type: "text",
    text: `Вот письмо со счётом за коммунальные услуги (текст письма ниже, плюс PDF-вложение, если есть).\n\nТекст письма:\n${bodyText.slice(0, 5000)}\n\nСписок квартир владельца (выбери apartment_id, если адрес счёта совпадает с одной из них, иначе null):\n${aptList}\n\nВерни СТРОГО JSON без markdown, полей:\n{"provider": string, "category": "electricity"|"water"|"gas"|"internet"|"other", "amount": number, "invoice_date": "YYYY-MM-DD"|null, "period_start": "YYYY-MM-DD"|null, "period_end": "YYYY-MM-DD"|null, "period_label": string|null, "description": string|null, "apartment_id": string|null, "confidence": "high"|"low"}\nПоле category строго одно из этих английских кодов (не русскими словами!). Если это не счёт за коммунальные услуги — верни {"amount": null}.`,
  });

  const { text, apiError } = await callClaude(content);
  if (apiError || !text) return { extraction: null, apiError };
  try {
    const cleaned = text.trim().replace(/^```json/, "").replace(/```$/, "").trim();
    return { extraction: JSON.parse(cleaned) as Extraction, raw: text };
  } catch {
    return { extraction: null, raw: text };
  }
}

async function extractBooking(
  bodyText: string,
  apartments: ApartmentRow[],
): Promise<{ extraction: BookingExtraction | null; raw?: string; apiError?: unknown }> {
  const aptList = apartments.map((a) => `- id: ${a.id}, название: "${a.title}", адрес: ${a.full_address ?? a.address}`).join("\n");
  const text = `Вот письмо от Airbnb или Booking.com (может быть подтверждение брони, уведомление о выплате/аузахтании, ЛИБО уведомление ОБ ОТМЕНЕ/СТОРНИРОВАНИИ брони гостём):\n\n${bodyText.slice(0, 7000)}\n\nСписок квартир владельца (выбери apartment_id по названию/адресу из письма, если не уверен — null):\n${aptList}\n\nВАЖНО про отмену: если это письмо о том, что ГОСТЬ ОТМЕНИЛ/СТОРНИРОВАЛ бронь (немецкие письма вроде „Buchung storniert" / „Stornierung bestätigt", английские „Reservation cancelled") — верни is_cancellation: true, и ОБЯЗАТЕЛЬНО заполни external_booking_id (если есть в письме) и guest_name/start_date, чтобы можно было найти отменяемую бронь в базе — остальные денежные поля можно оставить null. Это важно, потому что отменённая бронь будет удалена из календаря, а её сумма больше не учитывается в доходе — деньги всё равно не придут. Если это НЕ отмена — просто не включай поле is_cancellation вообще или верни false.\n\nВАЖНО про деньги (немецкие письма Airbnb, обычно двухколоночная таблица „Vom Gast bezahlt" / „Auszahlung an Gastgeber:in"):\n- Бери цифры ТОЛЬКО из колонки хозяина („Auszahlung an Gastgeber:in") — не из колонки гостя („Vom Gast bezahlt").\n- total_amount = итоговая строка в этой колонке (обычно подписана „Du verdienst" или просто „Gesamt (EUR)" рядом с этой колонкой) — это то, что хозяин реально получает, уже после вычета комиссии Airbnb.\n- cleaning_fee = строка „Reinigungsgebühr" из колонки хозяина (обычно = 60).\n- host_service_fee = модуль числа в строке „Servicegebühr für Gastgeber:innen" / „Servicegebühr für Gastgeber/innen" (она всегда отрицательная в письме, но в JSON верни положительное число).\n- Если это письмо типа „Auszahlung gesendet" (уведомление о выплате) без разбивки по комиссиям — возьми total_amount из „Gesamtbetrag der Auszahlung", а cleaning_fee и host_service_fee оставь null. Даты заезда/выезда ищи в строке вида „Unterkunft • MM/DD/YYYY - MM/DD/YYYY".\n- external_booking_id = код подтверждения брони (обычно короткий буквенно-цифровой код вроде „HMXZE5WRT2" или „HME3B2TFNC"), если есть в письме — очень важно его найти, он используется для связывания нескольких писем об одной и той же брони (включая письмо об отмене).\n\nВерни СТРОГО JSON без markdown, полей:\n{"apartment_id": string|null, "guest_name": string|null, "start_date": "YYYY-MM-DD"|null, "end_date": "YYYY-MM-DD"|null, "guests_count": number|null, "total_amount": number|null, "cleaning_fee": number|null, "host_service_fee": number|null, "external_booking_id": string|null, "source": "airbnb"|"booking"|"other", "is_cancellation": boolean}\nЕсли это не подтверждение новой брони, не выплата и не отмена — верни {"apartment_id": null, "start_date": null}.`;

  const { text: raw, apiError } = await callClaude([{ type: "text", text }]);
  if (apiError || !raw) return { extraction: null, apiError };
  try {
    const cleaned = raw.trim().replace(/^```json/, "").replace(/```$/, "").trim();
    return { extraction: JSON.parse(cleaned) as BookingExtraction, raw };
  } catch {
    return { extraction: null, raw };
  }
}

async function extractBankStatement(
  pdfBase64: string,
  apartments: ApartmentRow[],
): Promise<{ extraction: BankStatementExtraction | null; raw?: string; apiError?: unknown }> {
  const aptList = apartments.map((a) => `- id: ${a.id}, название: "${a.title}", адрес: ${a.full_address ?? a.address}`).join("\n");
  const categoryList = EXPENSE_CATEGORY_CODES.join("|");

  const text = `Вот PDF банковской выписки (движения по счёту). Извлеки КАЖДУЮ строку транзакции (без учёта строки баланса/сальдо).\n\nКвартиры владельца (используй адрес, чтобы понять, к какой квартире относится строка — например, если в назначении платежа есть часть адреса одной из квартир, это она):\n${aptList}\n\nДля каждой строки верни объект:\n{\n  "date": "YYYY-MM-DD" (дата транзакции/Datum Trans.),\n  "description": string (назначение платежа как в выписке, дословно),\n  "amount": number (АБСОЛЮТНОЕ значение, всегда положительное),\n  "is_credit": boolean (true если это поступление на счёт, false если списание),\n  "provider": string|null (короткое имя получателя/отправителя, если понятно из назначения),\n  "suggested_category": один из "${categoryList}" | null,\n  "suggested_apartment_id": string|null (id квартиры, если строка явно относится к одной конкретной квартире — например коммунальные платежи, комунидад, интернет с адресом квартиры),\n  "suggested_split": boolean (true если расход общий на обе квартиры — например банковская комиссия за общий счёт или налог на владельца, а не на объект — тогда suggested_apartment_id можно оставить null),\n  "suggested_include": boolean (true ТОЛЬКО для узнаваемых регулярных расходов по недвижимости — коммуналка, комунидад/ТСЖ, налоги, кредит на квартиру, банковские комиссии, страховка, ремонт, мебель, техника, уборка. false для личных покупок по карте — супермаркеты (Mercadona, Carrefour, Aldi...), рестораны, АЗС, магазины типа Leroy Merlin/Media Markt если явно личная покупка, переводы физлицам, а также для строк Airbnb/Booking.com выплат — они уже учтены отдельно через письма о бронях, их НЕ нужно включать сюда)\n}\n\nВерни СТРОГО JSON без markdown, объект вида:\n{"statement_date_range": string|null, "line_items": [...]}\nНе пропускай ни одной строки транзакции, даже если suggested_include будет false — хозяин сам решит финально, какие строки добавить.`;

  const { text: raw, apiError } = await callClaude([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
    { type: "text", text },
  ]);
  if (apiError || !raw) return { extraction: null, apiError };
  try {
    const cleaned = raw.trim().replace(/^```json/, "").replace(/```$/, "").trim();
    return { extraction: JSON.parse(cleaned) as BankStatementExtraction, raw };
  } catch {
    return { extraction: null, raw };
  }
}
