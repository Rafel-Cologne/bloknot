import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const DEFAULT_ALIAS = "rafael";
// Домен для персональных email-адресов инвойсов на общем ящике (держим для обратной
// совместимости, хотя основной путь теперь — отдельный Gmail-аккаунт на каждого пользователя,
// см. email_accounts ниже).
const INVOICE_DOMAIN = (Deno.env.get("INVOICE_DOMAIN") ?? "").toLowerCase();

function resolveAliasFromHeader(toHeader: string): string {
  const plusMatch = toHeader.match(/\+([a-z0-9._-]+)@/i);
  if (plusMatch) return plusMatch[1].toLowerCase();
  if (INVOICE_DOMAIN) {
    const domainRe = new RegExp(`([a-z0-9._-]+)@${INVOICE_DOMAIN.replace(/\./g, "\\.")}`, "i");
    const domainMatch = toHeader.match(domainRe);
    if (domainMatch) return domainMatch[1].toLowerCase();
  }
  return DEFAULT_ALIAS;
}

const BOOKING_SENDER_DOMAINS = ["airbnb.com", "booking.com"];
const INVOICE_TEXT_KEYWORDS = ["factura", "importe", "consumo", "recibo", "contrato"];
const BOOKING_SUBJECT_KEYWORDS = [
  "bestätigt", "bestätigung", "auszahlung", "storniert", "stornierung",
  "änderung", "geändert", "buchung", "reservierung", "anfrage",
  "confirmed", "confirmation", "reservation", "booking", "payout",
  "cancelled", "canceled", "cancellation", "modified", "itinerary",
  "confirmada", "confirmación", "reserva", "cancelada", "pago",
];
const BANK_STATEMENT_KEYWORDS = [
  "kontobewegungen", "kontoauszug", "abfrage von kontobewegungen",
  "estado de cuenta", "movimientos de cuenta", "extracto de cuenta",
  "account statement", "bank statement", "consulta de movimientos",
];
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

// Разбивка результатов запуска агента ПО КАЖДОМУ ХОЗЯИНУ — чтобы в админке можно было быстро
// увидеть, у какого именно пользователя что произошло (сколько писем, что добавилось, что
// пропущено и почему, сколько токенов Claude потрачено на обработку его писем), не копаясь в
// общем логе всего запуска. Пишется в отдельную таблицу agent_run_owners, привязанную к
// agent_logs через run_id.
type OwnerRunItem = {
  kind: "booking_new" | "booking_update" | "booking_cancel" | "expense" | "bank_statement" | "skip" | "error";
  status: "success" | "skipped" | "error";
  label: string;
};

type OwnerStats = {
  owner_id: string;
  account_labels: Set<string>;
  emails_checked: number;
  bookings_created: number;
  bookings_updated: number;
  bookings_cancelled: number;
  expenses_created: number;
  skipped: number;
  tokens_input: number;
  tokens_output: number;
  had_error: boolean;
  items: OwnerRunItem[];
};

type OwnerStatsMap = Map<string, OwnerStats>;

function getOwnerStats(map: OwnerStatsMap, ownerId: string, accountLabel: string): OwnerStats {
  let s = map.get(ownerId);
  if (!s) {
    s = {
      owner_id: ownerId,
      account_labels: new Set<string>(),
      emails_checked: 0,
      bookings_created: 0,
      bookings_updated: 0,
      bookings_cancelled: 0,
      expenses_created: 0,
      skipped: 0,
      tokens_input: 0,
      tokens_output: 0,
      had_error: false,
      items: [],
    };
    map.set(ownerId, s);
  }
  s.account_labels.add(accountLabel);
  return s;
}

function addUsage(stats: OwnerStats | null, usage?: { input_tokens: number; output_tokens: number }) {
  if (!stats || !usage) return;
  stats.tokens_input += usage.input_tokens;
  stats.tokens_output += usage.output_tokens;
}

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

async function getGmailProfile(accessToken: string): Promise<{ historyId: string | null }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { historyId: null };
  const json = await res.json();
  return { historyId: json.historyId != null ? String(json.historyId) : null };
}

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

type WorldData = {
  apartments: ApartmentRow[];
  autoApplyByOwner: Map<string, boolean>;
};

type AccountCtx = {
  label: string;
  accessToken: string;
  historyId: string | null;
  resolveOwner: (toHeader: string) => string | null;
  saveHistoryId: (id: string) => Promise<void>;
};

// Синхронизация ОДНОГО Gmail-ящика — вынесена в отдельную функцию, чтобы вызываться одинаково как для
// старого общего ящика (env-переменные + алиасы), так и для каждого персонального
// ящика из email_accounts (фиксированный owner_id, свой refresh_token, свой historyId).
async function syncAccount(
  supabase: SupabaseClientAny,
  log: RunLog,
  ownerStats: OwnerStatsMap,
  ctx: AccountCtx,
  world: WorldData,
): Promise<void> {
  const { accessToken } = ctx;
  let messageIds: string[] = [];
  let nextHistoryId: string | null = null;
  let usedFallbackScan = false;

  if (ctx.historyId) {
    const { ids, newHistoryId, expired } = await listNewMessagesViaHistory(accessToken, ctx.historyId);
    if (expired) {
      usedFallbackScan = true;
      log.debug.push({ account: ctx.label, note: "gmail historyId expired (agent probably idle >7 days) — falling back to full date-range scan once" });
    } else {
      messageIds = ids;
      nextHistoryId = newHistoryId ?? ctx.historyId;
    }
  }

  if (!ctx.historyId || usedFallbackScan) {
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
  log.emails_checked += messages.length;

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
    // Владелец этого письма — известен только после resolveOwner внутри try, но нужен и в catch,
    // чтобы прикрепить ошибку к статистике конкретного пользователя, а не потерять её в общем логе.
    let currentOwnerStats: OwnerStats | null = null;
    try {
      if (fetchError || !msg) {
        log.errors.push({ account: ctx.label, messageId: msgId, error: String(fetchError ?? "empty gmail response") });
        continue;
      }

      const headers = Object.fromEntries(
        (msg.payload?.headers ?? []).map((h: { name: string; value: string }) => [h.name.toLowerCase(), h.value]),
      );
      const toHeader: string = headers["delivered-to"] || headers["to"] || "";
      const fromHeader: string = (headers["from"] || "").toLowerCase();
      const subjectHeader: string = (headers["subject"] || "").toLowerCase();
      const subjectRaw: string = headers["subject"] || "(без темы)";
      const ownerId: string | null = ctx.resolveOwner(toHeader);

      if (!ownerId) {
        log.skipped++;
        log.debug.push({ account: ctx.label, messageId: msgId, reason: "no owner resolved", toHeader });
        continue;
      }

      const stats = getOwnerStats(ownerStats, ownerId, ctx.label);
      currentOwnerStats = stats;
      stats.emails_checked++;

      const ownerApartments = world.apartments.filter((a) => a.owner_id === ownerId);
      if (ownerApartments.length === 0) {
        log.skipped++;
        stats.skipped++;
        stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — у владельца нет ни одной квартиры` });
        log.debug.push({ account: ctx.label, messageId: msgId, reason: "owner has no apartments" });
        continue;
      }
      const autoApply = world.autoApplyByOwner.get(ownerId) ?? false;

      const parts = flattenParts(msg.payload);
      const pdfPart = parts.find((p) => p.mimeType === "application/pdf" && p.body?.attachmentId);
      const bodyText = extractPlainText(msg.payload) ?? msg.snippet ?? "";
      // Письмо может быть вручную ПЕРЕСЛАНО клиентом на свой личный ящик — тогда заголовок From
      // у самого сообщения это адрес клиента, а не airbnb.com/booking.com. Исходный отправитель в
      // этом случае виден только внутри текста письма (строка "From: ..." в блоке
      // "---------- Forwarded message ---------", плюс обычно есть ссылки/упоминания airbnb.com в
      // подвале письма), поэтому дополнительно ищем домен и там — иначе пересланные письма о
      // бронях никогда не пройдут проверку отправителя.
      const isBookingSender = BOOKING_SENDER_DOMAINS.some((d) => fromHeader.includes(d) || bodyText.toLowerCase().includes(d));

      if (alreadyQueuedIds.has(msgId)) {
        log.debug.push({ account: ctx.label, messageId: msgId, note: "already queued/resolved in agent_pending_events" });
        continue;
      }

      if (isBookingSender) {
        if (alreadyBookingIds.has(msgId)) {
          log.debug.push({ account: ctx.label, messageId: msgId, note: "booking email already processed" });
          continue;
        }

        const looksLikeBookingSubject = BOOKING_SUBJECT_KEYWORDS.some((k) => subjectHeader.includes(k));
        if (!looksLikeBookingSubject) {
          log.skipped++;
          stats.skipped++;
          stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — тема не похожа на бронь, пропущено до вызова ИИ` });
          log.debug.push({
            account: ctx.label,
            messageId: msgId,
            reason: "airbnb/booking email, subject doesn't look transactional — skipped before calling Claude",
            subject: headers["subject"],
          });
          continue;
        }

        const { extraction, raw, apiError, usage } = await extractBooking(bodyText, ownerApartments);
        addUsage(stats, usage);
        if (apiError) log.debug.push({ account: ctx.label, messageId: msgId, apiError });
        if (raw) log.debug.push({ account: ctx.label, messageId: msgId, rawClaudeText: raw });

        if (!extraction) {
          log.skipped++;
          stats.skipped++;
          stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — ИИ не смог распознать бронь` });
          log.debug.push({ account: ctx.label, messageId: msgId, reason: "no usable booking extraction", extraction });
          continue;
        }

        // Если у хозяина только одна квартира — письмо о брони почти наверняка про неё, даже
        // если Claude не смог однозначно сопоставить название/адрес объекта в письме (разное
        // написание адреса, письмо на непривычном языке и т.п.). Раньше в этом случае бронь
        // просто молча пропускалась. Как и со счетами: привязываем к единственной квартире, но
        // если Claude вообще не нашёл apartment_id — не автопримеряем, отдаём хозяину на проверку.
        let bookingApartmentId: string | null = extraction.apartment_id;
        let bookingNeedsConfirmation = false;
        if (!bookingApartmentId && ownerApartments.length === 1) {
          bookingApartmentId = ownerApartments[0].id;
          bookingNeedsConfirmation = true;
        }
        if (!bookingApartmentId) {
          log.skipped++;
          stats.skipped++;
          stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — ИИ не смог распознать бронь` });
          log.debug.push({ account: ctx.label, messageId: msgId, reason: "no usable booking extraction", extraction });
          continue;
        }

        const apt = ownerApartments.find((a) => a.id === bookingApartmentId);
        if (!apt) {
          log.skipped++;
          stats.skipped++;
          stats.had_error = true;
          stats.items.push({ kind: "error", status: "error", label: `«${subjectRaw}» — ИИ вернул несуществующий ID квартиры` });
          log.debug.push({ account: ctx.label, messageId: msgId, reason: "extracted apartment_id not found", extraction });
          continue;
        }

        if (extraction.is_cancellation) {
          const existingBooking = await findExistingBooking(supabase, apt.id, extraction);
          if (!existingBooking) {
            log.skipped++;
            stats.skipped++;
            stats.items.push({ kind: "skip", status: "skipped", label: `Отмена брони «${extraction.guest_name ?? "?"}» — подходящая бронь в базе не найдена` });
            log.debug.push({ account: ctx.label, messageId: msgId, reason: "cancellation email but no matching existing booking found", extraction });
            continue;
          }

          stats.bookings_cancelled++;
          stats.items.push({ kind: "booking_cancel", status: "success", label: `Бронь отменена: ${existingBooking.guest_name}, ${existingBooking.start_date}–${existingBooking.end_date} (${apt.title})` });
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
          stats.skipped++;
          stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — ИИ не смог распознать бронь` });
          log.debug.push({ account: ctx.label, messageId: msgId, reason: "no usable booking extraction", extraction });
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
          apartment_mismatch: bookingNeedsConfirmation,
        };

        if (existingBooking) {
          stats.bookings_updated++;
          stats.items.push({ kind: "booking_update", status: "success", label: `Бронь обновлена: ${bookingPayload.guest_name || "?"}, ${extraction.start_date}–${extraction.end_date} (${apt.title})${bookingNeedsConfirmation ? " ⚠️ объект не определён точно" : ""}` });
        } else {
          stats.bookings_created++;
          stats.items.push({ kind: "booking_new", status: "success", label: `Новая бронь: ${bookingPayload.guest_name || "?"}, ${extraction.start_date}–${extraction.end_date} (${apt.title})${bookingNeedsConfirmation ? " ⚠️ объект не определён точно" : ""}` });
        }

        await queueEvent(supabase, log, autoApply && !bookingNeedsConfirmation, {
          owner_id: ownerId,
          apartment_id: apt.id,
          kind: existingBooking ? "booking_update" : "booking_new",
          source_message_id: msgId,
          existing_booking_id: existingBooking?.id ?? null,
          payload: bookingPayload,
        });
        continue;
      }

      const isBankStatementEmail = BANK_STATEMENT_KEYWORDS.some((k) => bodyText.toLowerCase().includes(k) || subjectHeader.includes(k));
      if (isBankStatementEmail) {
        if (!pdfPart) {
          log.skipped++;
          stats.skipped++;
          stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — похоже на банковскую выписку, но нет PDF-вложения` });
          log.debug.push({ account: ctx.label, messageId: msgId, reason: "looks like a bank statement email but has no pdf attachment" });
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
          stats.skipped++;
          stats.had_error = true;
          stats.items.push({ kind: "error", status: "error", label: `«${subjectRaw}» — не удалось скачать PDF-вложение выписки` });
          log.debug.push({ account: ctx.label, messageId: msgId, reason: "bank statement pdf attachment fetch returned no data", attRes: attJson });
          continue;
        }

        const { extraction, raw, apiError, usage } = await extractBankStatement(pdfBase64, ownerApartments);
        addUsage(stats, usage);
        if (apiError) log.debug.push({ account: ctx.label, messageId: msgId, apiError });
        if (raw) log.debug.push({ account: ctx.label, messageId: msgId, rawClaudeText: raw });

        if (!extraction || !extraction.line_items || extraction.line_items.length === 0) {
          log.skipped++;
          stats.skipped++;
          stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — не удалось извлечь строки из выписки` });
          log.debug.push({ account: ctx.label, messageId: msgId, reason: "no usable line items extracted from bank statement", extraction });
          continue;
        }

        stats.items.push({ kind: "bank_statement", status: "success", label: `Банковская выписка: ${extraction.line_items.length} строк на проверку` });
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
        stats.skipped++;
        stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — не похоже ни на бронь, ни на счёт` });
        log.debug.push({ account: ctx.label, messageId: msgId, reason: "not a booking email, no pdf attachment, no invoice keywords", from: fromHeader });
        continue;
      }

      if (alreadyExpenseIds.has(msgId)) {
        log.debug.push({ account: ctx.label, messageId: msgId, note: "already processed" });
        continue;
      }

      // full_address — необязательное поле формы квартиры (хозяин может его не заполнить).
      // Раньше при пустом full_address квартира полностью выпадала из сопоставления счетов, и
      // агент молча пропускал ВСЕ письма со счетами для такого хозяина без единой понятной причины.
      // Теперь используем обычный address как запасной вариант — этого обычно достаточно для
      // сопоставления адреса в счёте с нужной квартирой.
      const ownerApartmentsWithAddress = ownerApartments.filter((a) => a.full_address || a.address);
      if (ownerApartmentsWithAddress.length === 0) {
        log.skipped++;
        stats.skipped++;
        stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — ни у одной квартиры не указан адрес` });
        log.debug.push({ account: ctx.label, messageId: msgId, reason: "owner has no apartments with an address" });
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
        else log.debug.push({ account: ctx.label, messageId: msgId, note: "attachment fetch returned no data", attRes: attJson });
      }

      const { extraction, raw, apiError, usage } = await extractInvoice(bodyText, pdfBase64, ownerApartmentsWithAddress);
      addUsage(stats, usage);
      if (apiError) log.debug.push({ account: ctx.label, messageId: msgId, apiError });
      if (raw) log.debug.push({ account: ctx.label, messageId: msgId, rawClaudeText: raw });

      if (!extraction || !extraction.amount || !extraction.category) {
        log.skipped++;
        stats.skipped++;
        stats.items.push({ kind: "skip", status: "skipped", label: `«${subjectRaw}» — не удалось извлечь сумму/категорию счёта` });
        log.debug.push({ account: ctx.label, messageId: msgId, reason: "no usable extraction", extraction });
        continue;
      }

      let apartmentId: string | null = extraction.confidence === "low" ? null : extraction.apartment_id;
      // Если у хозяина только одна квартира — счёт всегда относится к ней, даже если Claude не
      // смог однозначно сопоставить адрес (например, в счёте вообще нет адреса объекта, что для
      // многих коммунальных счетов нормально). НО если Claude явно увидел в счёте ДРУГОЙ адрес
      // (address_mismatch) — всё равно привязываем к единственной квартире, но помечаем событие,
      // чтобы хозяин подтвердил это вручную, а не полагаться на автопривязку молча.
      let needsAddressConfirmation = false;
      if (!apartmentId && ownerApartmentsWithAddress.length === 1) {
        apartmentId = ownerApartmentsWithAddress[0].id;
        needsAddressConfirmation = !!extraction.address_mismatch;
      }
      if (!apartmentId) {
        log.skipped++;
        stats.skipped++;
        stats.items.push({ kind: "skip", status: "skipped", label: `Счёт «${extraction.provider ?? "?"}» — не удалось определить квартиру` });
        log.debug.push({ account: ctx.label, messageId: msgId, reason: "could not match apartment", extraction });
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
        stats.skipped++;
        stats.items.push({ kind: "skip", status: "skipped", label: `Счёт «${extraction.provider ?? extraction.category}», ${extraction.amount}€ — дубликат, уже есть в базе` });
        log.debug.push({ account: ctx.label, messageId: msgId, reason: "duplicate invoice content (same apartment/category/amount/period already exists)", extraction });
        continue;
      }

      const apartmentForExpense = ownerApartmentsWithAddress.find((a) => a.id === apartmentId);

      stats.expenses_created++;
      stats.items.push({ kind: "expense", status: "success", label: `Счёт: ${extraction.category}, ${extraction.amount}€ (${apartmentForExpense?.title ?? "?"})${needsAddressConfirmation ? " ⚠️ адрес не совпадает" : ""}` });
      await queueEvent(supabase, log, autoApply && !needsAddressConfirmation, {
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
          address_mismatch: needsAddressConfirmation,
          invoice_address: extraction.invoice_address ?? null,
        },
      });
    } catch (e) {
      log.errors.push({ account: ctx.label, messageId: msgId, error: String(e) });
      if (currentOwnerStats) {
        currentOwnerStats.had_error = true;
        currentOwnerStats.items.push({ kind: "error", status: "error", label: `Внутренняя ошибка при обработке письма: ${String(e)}` });
      }
    }
  }

  if (nextHistoryId) {
    await ctx.saveHistoryId(nextHistoryId);
  }
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
  // Разбивка по хозяевам собирается на протяжении всего запуска (и легаси-ящик, и персональные
  // ящики пишут в одну и ту же карту), а в самом конце превращается в строки agent_run_owners.
  const ownerStats: OwnerStatsMap = new Map();
  // deno-lint-ignore no-explicit-any
  let profilesById = new Map<string, { name: string | null; email: string | null }>();

  async function persistOwnerBreakdown(runId: string) {
    if (ownerStats.size === 0) return;
    const rows = Array.from(ownerStats.values()).map((s) => {
      const profile = profilesById.get(s.owner_id);
      return {
        run_id: runId,
        owner_id: s.owner_id,
        owner_email: profile?.email ?? null,
        owner_name: profile?.name ?? null,
        account_label: Array.from(s.account_labels).join(", "),
        emails_checked: s.emails_checked,
        bookings_created: s.bookings_created,
        bookings_updated: s.bookings_updated,
        bookings_cancelled: s.bookings_cancelled,
        expenses_created: s.expenses_created,
        skipped: s.skipped,
        tokens_input: s.tokens_input,
        tokens_output: s.tokens_output,
        status: s.had_error ? "partial" : "success",
        items: s.items,
      };
    });
    const { error } = await supabase.from("agent_run_owners").insert(rows);
    if (error) log.errors.push({ note: "failed to insert agent_run_owners", error: String(error) });
  }

  try {
    await generateRecurringExpenses(supabase, log);

    const { data: aliases } = await supabase.from("user_email_aliases").select("alias, user_id");
    const { data: apartmentsRaw } = await supabase
      .from("apartments")
      .select("id, owner_id, title, address, full_address, cleaner_id, cleaning_fee");
    const apartments = (apartmentsRaw ?? []) as ApartmentRow[];
    const { data: profilesRaw } = await supabase.from("profiles").select("id, name, email, agent_auto_apply");
    const autoApplyByOwner = new Map<string, boolean>(
      (profilesRaw ?? []).map((p: { id: string; agent_auto_apply: boolean | null }) => [p.id, !!p.agent_auto_apply]),
    );
    profilesById = new Map(
      (profilesRaw ?? []).map((p: { id: string; name: string | null; email: string | null }) => [p.id, { name: p.name ?? null, email: p.email ?? null }]),
    );
    const world: WorldData = { apartments, autoApplyByOwner };

    // ── 1) Легаси: общий шаренный ящик (bloknot.app@gmail.com из env), владелец определяется по
    // алиасу/+tag в заголовке получателя (user_email_aliases). Оставлен для обратной совместимости.
    try {
      const legacyAccessToken = await getAccessToken(GMAIL_REFRESH_TOKEN);
      const { data: syncState } = await supabase
        .from("agent_sync_state")
        .select("last_history_id")
        .eq("id", true)
        .maybeSingle();

      await syncAccount(supabase, log, ownerStats, {
        label: "legacy:shared-inbox",
        accessToken: legacyAccessToken,
        historyId: syncState?.last_history_id ?? null,
        resolveOwner: (toHeader) => {
          const alias = resolveAliasFromHeader(toHeader);
          return aliases?.find((a) => a.alias === alias)?.user_id ?? null;
        },
        saveHistoryId: async (id) => {
          await supabase.from("agent_sync_state").update({ last_history_id: id, updated_at: new Date().toISOString() }).eq("id", true);
        },
      }, world);
    } catch (e) {
      log.errors.push({ account: "legacy:shared-inbox", error: String(e) });
    }

    // ── 2) Персональные ящики (faktura.imya@gmail.com и т.п.) — у каждого свой refresh_token и
    // фиксированный owner_id — алиасы не нужны, всё, что пришло в этот ящик, принадлежит этому
    // пользователю.
    const { data: dedicatedAccounts } = await supabase
      .from("email_accounts")
      .select("id, owner_id, email_address, gmail_refresh_token, last_history_id")
      .eq("is_active", true);

    for (const acc of (dedicatedAccounts ?? [])) {
      try {
        const accessToken = await getAccessToken(acc.gmail_refresh_token);
        await syncAccount(supabase, log, ownerStats, {
          label: acc.email_address,
          accessToken,
          historyId: acc.last_history_id,
          resolveOwner: () => acc.owner_id,
          saveHistoryId: async (id) => {
            await supabase.from("email_accounts").update({ last_history_id: id, last_synced_at: new Date().toISOString() }).eq("id", acc.id);
          },
        }, world);
      } catch (e) {
        log.errors.push({ account: acc.email_address, error: String(e) });
      }
    }

    const { data: insertedRun } = await supabase.from("agent_logs").insert({
      emails_checked: log.emails_checked,
      expenses_created: log.expenses_created,
      bookings_created: log.bookings_created,
      bookings_updated: log.bookings_updated,
      skipped: log.skipped,
      errors: log.errors.length ? log.errors : null,
      status: log.errors.length ? "partial" : "success",
    }).select("id").single();

    if (insertedRun?.id) await persistOwnerBreakdown(insertedRun.id);

    return new Response(JSON.stringify(log), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const { data: insertedRun } = await supabase.from("agent_logs").insert({
      emails_checked: log.emails_checked,
      expenses_created: log.expenses_created,
      bookings_created: log.bookings_created,
      bookings_updated: log.bookings_updated,
      skipped: log.skipped,
      errors: [{ fatal: String(e) }],
      status: "failed",
    }).select("id").single();

    if (insertedRun?.id) await persistOwnerBreakdown(insertedRun.id);

    return new Response(JSON.stringify({ fatal: String(e), log }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
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
  invoice_address: string | null;
  address_mismatch: boolean | null;
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

type ClaudeUsage = { input_tokens: number; output_tokens: number };

async function callClaude(content: unknown[]): Promise<{ text?: string; apiError?: unknown; usage?: ClaudeUsage }> {
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
  const usage: ClaudeUsage | undefined = json?.usage
    ? { input_tokens: Number(json.usage.input_tokens) || 0, output_tokens: Number(json.usage.output_tokens) || 0 }
    : undefined;
  if (!res.ok) return { apiError: json, usage };
  const blocks = Array.isArray(json?.content) ? json.content : [];
  // deno-lint-ignore no-explicit-any
  const textBlock = blocks.find((b: any) => b && b.type === "text" && typeof b.text === "string");
  const text = textBlock?.text;
  if (!text) return { apiError: json, usage };
  return { text, usage };
}

async function extractInvoice(
  bodyText: string,
  pdfBase64: string | null,
  apartments: ApartmentRow[],
): Promise<{ extraction: Extraction | null; raw?: string; apiError?: unknown; usage?: ClaudeUsage }> {
  const aptList = apartments.map((a) => `- id: ${a.id}, адрес: ${a.full_address ?? a.address}`).join("\n");
  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  if (pdfBase64) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
  }
  content.push({
    type: "text",
    text: `Вот письмо со счётом за коммунальные услуги (текст письма ниже, плюс PDF-вложение, если есть).\n\nТекст письма:\n${bodyText.slice(0, 5000)}\n\nСписок квартир владельца (выбери apartment_id, если адрес счёта совпадает с одной из них, иначе null):\n${aptList}\n\nВАЖНО про адрес: если в счёте есть адрес объекта/точки поставки услуги (адрес, куда поставляется электричество/вода/газ/интернет, а не юридический адрес поставщика или адрес для переписки) — обязательно верни его дословно в поле invoice_address. Затем сравни его с адресами квартир из списка выше: если invoice_address ЯВНО указывает на другой объект (другая улица/номер дома) — верни address_mismatch: true. Если адрес в счёте не найден, слишком общий (например только город) или совпадает с одной из квартир — верни address_mismatch: false. Не путай address_mismatch с обычным confidence: low ставь только когда вообще непонятно, что за счёт.\n\nВерни СТРОГО JSON без markdown, полей:\n{"provider": string, "category": "electricity"|"water"|"gas"|"internet"|"other", "amount": number, "invoice_date": "YYYY-MM-DD"|null, "period_start": "YYYY-MM-DD"|null, "period_end": "YYYY-MM-DD"|null, "period_label": string|null, "description": string|null, "apartment_id": string|null, "invoice_address": string|null, "address_mismatch": boolean, "confidence": "high"|"low"}\nПоле category строго одно из этих английских кодов (не русскими словами!). Если это не счёт за коммунальные услуги — верни {"amount": null}.`,
  });

  const { text, apiError, usage } = await callClaude(content);
  if (apiError || !text) return { extraction: null, apiError, usage };
  try {
    const cleaned = text.trim().replace(/^```json/, "").replace(/```$/, "").trim();
    return { extraction: JSON.parse(cleaned) as Extraction, raw: text, usage };
  } catch {
    return { extraction: null, raw: text, usage };
  }
}

async function extractBooking(
  bodyText: string,
  apartments: ApartmentRow[],
): Promise<{ extraction: BookingExtraction | null; raw?: string; apiError?: unknown; usage?: ClaudeUsage }> {
  const aptList = apartments.map((a) => `- id: ${a.id}, название: "${a.title}", адрес: ${a.full_address ?? a.address}`).join("\n");
  const text = `Вот письмо от Airbnb или Booking.com (может быть подтверждение брони, уведомление о выплате/аузахтании, ЛИБО уведомление ОБ ОТМЕНЕ/СТОРНИРОВАНИИ брони гостём):\n\n${bodyText.slice(0, 7000)}\n\nСписок квартир владельца (выбери apartment_id по названию/адресу из письма, если не уверен — null):\n${aptList}\n\nВАЖНО про отмену: если это письмо о том, что ГОСТЬ ОТМЕНИЛ/СТОРНИРОВАЛ бронь (немецкие письма вроде „Buchung storniert" / „Stornierung bestätigt", английские „Reservation cancelled") — верни is_cancellation: true, и ОБЯЗАТЕЛЬНО заполни external_booking_id (если есть в письме) и guest_name/start_date, чтобы можно было найти отменяемую бронь в базе — остальные денежные поля можно оставить null. Это важно, потому что отменённая бронь будет удалена из календаря, а её сумма больше не учитывается в доходе — деньги всё равно не придут. Если это НЕ отмена — просто не включай поле is_cancellation вообще или верни false.\n\nВАЖНО про деньги (немецкие письма Airbnb, обычно двухколоночная таблица „Vom Gast bezahlt" / „Auszahlung an Gastgeber:in"):\n- Бери цифры ТОЛЬКО из колонки хозяина („Auszahlung an Gastgeber:in") — не из колонки гостя („Vom Gast bezahlt").\n- total_amount = итоговая строка в этой колонке (обычно подписана „Du verdienst" или просто „Gesamt (EUR)" рядом с этой колонкой) — это то, что хозяин реально получает, уже после вычета комиссии Airbnb.\n- cleaning_fee = строка „Reinigungsgebühr" из колонки хозяина (обычно = 60).\n- host_service_fee = модуль числа в строке „Servicegebühr für Gastgeber:innen" / „Servicegebühr für Gastgeber/innen" (она всегда отрицательная в письме, но в JSON верни положительное число).\n- Если это письмо типа „Auszahlung gesendet" (уведомление о выплате) без разбивки по комиссиям — возьми total_amount из „Gesamtbetrag der Auszahlung", а cleaning_fee и host_service_fee оставь null. Даты заезда/выезда ищи в строке вида „Unterkunft • MM/DD/YYYY - MM/DD/YYYY".\n- external_booking_id = код подтверждения брони (обычно короткий буквенно-цифровой код вроде „HMXZE5WRT2" или „HME3B2TFNC"), если есть в письме — очень важно его найти, он используется для связывания нескольких писем об одной и той же брони (включая письмо об отмене).\n\nВерни СТРОГО JSON без markdown, полей:\n{"apartment_id": string|null, "guest_name": string|null, "start_date": "YYYY-MM-DD"|null, "end_date": "YYYY-MM-DD"|null, "guests_count": number|null, "total_amount": number|null, "cleaning_fee": number|null, "host_service_fee": number|null, "external_booking_id": string|null, "source": "airbnb"|"booking"|"other", "is_cancellation": boolean}\nЕсли это не подтверждение новой брони, не выплата и не отмена — верни {"apartment_id": null, "start_date": null}.`;

  const { text: raw, apiError, usage } = await callClaude([{ type: "text", text }]);
  if (apiError || !raw) return { extraction: null, apiError, usage };
  try {
    const cleaned = raw.trim().replace(/^```json/, "").replace(/```$/, "").trim();
    return { extraction: JSON.parse(cleaned) as BookingExtraction, raw, usage };
  } catch {
    return { extraction: null, raw, usage };
  }
}

async function extractBankStatement(
  pdfBase64: string,
  apartments: ApartmentRow[],
): Promise<{ extraction: BankStatementExtraction | null; raw?: string; apiError?: unknown; usage?: ClaudeUsage }> {
  const aptList = apartments.map((a) => `- id: ${a.id}, название: "${a.title}", адрес: ${a.full_address ?? a.address}`).join("\n");
  const categoryList = EXPENSE_CATEGORY_CODES.join("|");

  const text = `Вот PDF банковской выписки (движения по счёту). Извлеки КАЖДУЮ строку транзакции (без учёта строки баланса/сальдо).\n\nКвартиры владельца (используй адрес, чтобы понять, к какой квартире относится строка — например, если в назначении платежа есть часть адреса одной из квартир, это она):\n${aptList}\n\nДля каждой строки верни объект:\n{\n  "date": "YYYY-MM-DD" (дата транзакции/Datum Trans.),\n  "description": string (назначение платежа как в выписке, дословно),\n  "amount": number (АБСОЛЮТНОЕ значение, всегда положительное),\n  "is_credit": boolean (true если это поступление на счёт, false если списание),\n  "provider": string|null (короткое имя получателя/отправителя, если понятно из назначения),\n  "suggested_category": один из "${categoryList}" | null,\n  "suggested_apartment_id": string|null (id квартиры, если строка явно относится к одной конкретной квартире — например коммунальные платежи, комунидад, интернет с адресом квартиры),\n  "suggested_split": boolean (true если расход общий на обе квартиры — например банковская комиссия за общий счёт или налог на владельца, а не на объект — тогда suggested_apartment_id можно оставить null),\n  "suggested_include": boolean (true ТОЛЬКО для узнаваемых регулярных расходов по недвижимости — коммуналка, комунидад/ТСЖ, налоги, кредит на квартиру, банковские комиссии, страховка, ремонт, мебель, техника, уборка. false для личных покупок по карте — супермаркеты (Mercadona, Carrefour, Aldi...), рестораны, АЗС, магазины типа Leroy Merlin/Media Markt если явно личная покупка, переводы физлицам, а также для строк Airbnb/Booking.com выплат — они уже учтены отдельно через письма о бронях, их НЕ нужно включать сюда)\n}\n\nВерни СТРОГО JSON без markdown, объект вида:\n{"statement_date_range": string|null, "line_items": [...]}\nНе пропускай ни одной строки транзакции, даже если suggested_include будет false — хозяин сам решит финально, какие строки добавить.`;

  const { text: raw, apiError, usage } = await callClaude([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
    { type: "text", text },
  ]);
  if (apiError || !raw) return { extraction: null, apiError, usage };
  try {
    const cleaned = raw.trim().replace(/^```json/, "").replace(/```$/, "").trim();
    return { extraction: JSON.parse(cleaned) as BankStatementExtraction, raw, usage };
  } catch {
    return { extraction: null, raw, usage };
  }
}
