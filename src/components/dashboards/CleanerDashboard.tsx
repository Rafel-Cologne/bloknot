import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays, Banknote, FileText, Star, X, ChevronRight, ChevronLeft, Brush, LogOut,
  CheckCircle2, Wallet, Users, Plus, Minus, History, ClipboardList, Archive, User,
} from 'lucide-react'
import { format, parseISO, getDaysInMonth } from 'date-fns'
import { ru } from 'date-fns/locale'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskRow = {
  id: string
  status: string
  payment_method: string | null
  payment_status: string
  cleaning_fee: number
  completed_at: string | null
  notes: string | null
  cleaner_comment: string | null
  bookings: {
    id: string
    start_date: string
    end_date: string
    guest_name: string
    guest_phone: string
    guests_count: number
    guest_rating: number | null
    share_contact_with_cleaner: boolean
    source: string
    total_amount: number | null
    apartments: {
      id: string
      title: string
      address: string
      owner_id: string
    }
  }
}

type CashEntry = {
  id: string
  type: 'deposit' | 'withdrawal'
  amount: number
  booking_id: string | null
  cleaning_task_id: string | null
  note: string | null
  created_at: string
}

const SOURCE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb', booking: 'Booking.com', other: 'Частный', platform: 'Direct',
}
const SOURCE_COLOR: Record<string, string> = {
  airbnb: 'bg-rose-100 text-rose-700',
  booking: 'bg-blue-100 text-blue-700',
  other: 'bg-purple-100 text-purple-700',
  platform: 'bg-green-100 text-green-700',
}
const APT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#d946ef', '#84cc16']

const fmtEur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const pad = (n: number) => String(n).padStart(2, '0')

// Minimal phone → country lookup
const DIAL_CODES: [string, string, string][] = [
  ['+351','🇵🇹','Португалия'],['+352','🇱🇺','Люксембург'],['+353','🇮🇪','Ирландия'],
  ['+354','🇮🇸','Исландия'],['+355','🇦🇱','Албания'],['+356','🇲🇹','Мальта'],
  ['+357','🇨🇾','Кипр'],['+358','🇫🇮','Финляндия'],['+359','🇧🇬','Болгария'],
  ['+370','🇱🇹','Литва'],['+371','🇱🇻','Латвия'],['+372','🇪🇪','Эстония'],
  ['+373','🇲🇩','Молдова'],['+374','🇦🇲','Армения'],['+375','🇧🇾','Беларусь'],
  ['+380','🇺🇦','Украина'],['+381','🇷🇸','Сербия'],['+385','🇭🇷','Хорватия'],
  ['+386','🇸🇮','Словения'],['+387','🇧🇦','Босния'],['+389','🇲🇰','Македония'],
  ['+420','🇨🇿','Чехия'],['+421','🇸🇰','Словакия'],['+423','🇱🇮','Лихтенштейн'],
  ['+966','🇸🇦','Саудовская Аравия'],['+971','🇦🇪','ОАЭ'],['+972','🇮🇱','Израиль'],
  ['+994','🇦🇿','Азербайджан'],['+995','🇬🇪','Грузия'],['+996','🇰🇬','Кыргызстан'],
  ['+998','🇺🇿','Узбекистан'],['+992','🇹🇯','Таджикистан'],['+993','🇹🇲','Туркменистан'],
  ['+20','🇪🇬','Египет'],['+27','🇿🇦','ЮАР'],['+30','🇬🇷','Греция'],
  ['+31','🇳🇱','Нидерланды'],['+32','🇧🇪','Бельгия'],['+33','🇫🇷','Франция'],
  ['+34','🇪🇸','Испания'],['+36','🇭🇺','Венгрия'],['+39','🇮🇹','Италия'],
  ['+40','🇷🇴','Румыния'],['+41','🇨🇭','Швейцария'],['+43','🇦🇹','Австрия'],
  ['+44','🇬🇧','Великобритания'],['+45','🇩🇰','Дания'],['+46','🇸🇪','Швеция'],
  ['+47','🇳🇴','Норвегия'],['+48','🇵🇱','Польша'],['+49','🇩🇪','Германия'],
  ['+52','🇲🇽','Мексика'],['+54','🇦🇷','Аргентина'],['+55','🇧🇷','Бразилия'],
  ['+61','🇦🇺','Австралия'],['+62','🇮🇩','Индонезия'],['+63','🇵🇭','Филиппины'],
  ['+65','🇸🇬','Сингапур'],['+66','🇹🇭','Таиланд'],['+81','🇯🇵','Япония'],
  ['+82','🇰🇷','Южная Корея'],['+84','🇻🇳','Вьетнам'],['+86','🇨🇳','Китай'],
  ['+90','🇹🇷','Турция'],['+91','🇮🇳','Индия'],['+92','🇵🇰','Пакистан'],
  ['+98','🇮🇷','Иран'],
  ['+1','🇺🇸','США / Канада'],['+7','🇷🇺','Россия / Казахстан'],
]
function detectCountry(phone: string): { flag: string; name: string } | null {
  if (!phone) return null
  const normalized = phone.startsWith('+') ? phone : '+' + phone
  for (const [code, flag, name] of DIAL_CODES) {
    if (normalized.startsWith(code) && (normalized.length === code.length || /\d/.test(normalized[code.length]))) {
      return { flag, name }
    }
  }
  return null
}

function StarPicker({ value, onChange, readOnly, size }: { value: number; onChange?: (v: number) => void; readOnly?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" disabled={readOnly} onClick={() => onChange?.(i)}
          className={readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'}>
          <Star size={size ?? (readOnly ? 13 : 20)} className={i <= value ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'} />
        </button>
      ))}
    </div>
  )
}

// ─── Task detail modal ──────────────────────────────────────────────────────────

function TaskDetailModal({ task, cashBalance, onClose, onRefresh }: {
  task: TaskRow; cashBalance: number; onClose: () => void; onRefresh: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [rentInput, setRentInput] = useState(String(task.bookings.total_amount ?? ''))

  const b = task.bookings
  const today = new Date().toISOString().slice(0, 10)
  const isCur = b.start_date <= today && b.end_date > today
  const isDone = task.status === 'done'
  const isPaid = task.payment_status === 'paid'
  const isOwnerTransfer = task.payment_method === 'owner_transfer'
  const nights = Math.max(1, Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000))
  const country = b.guest_phone ? detectCountry(b.guest_phone) : null
  const canWithdraw = isOwnerTransfer && !isPaid && cashBalance >= task.cleaning_fee

  const invalidateAll = () => {
    onRefresh()
    qc.invalidateQueries({ queryKey: ['cleaner-tasks'] })
    qc.invalidateQueries({ queryKey: ['cleaner-cash-ledger'] })
  }

  const markDone = useMutation({
    mutationFn: async () => {
      const { error: taskError } = await supabase
        .from('cleaning_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString(), cleaner_comment: comment.trim() || null })
        .eq('id', task.id)
      if (taskError) throw taskError
      if (rating > 0) {
        const { error: bookingError } = await supabase.from('bookings').update({ guest_rating: rating }).eq('id', b.id)
        if (bookingError) throw bookingError
      }
    },
    onSuccess: () => { invalidateAll(); onClose() },
  })

  // Guest handed the cleaner cash for the cleaning itself (e.g. right at check-in) —
  // settles the fee immediately regardless of the booking's usual payment method,
  // and it no longer counts as owed to the owner.
  const receivedFromClient = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cleaning_tasks')
        .update({ payment_status: 'paid', payment_method: 'guest_cash' }).eq('id', task.id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(),
  })

  // Guest handed over cash for the rent (private bookings) — grows the cash till
  const depositRent = useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.from('cash_ledger').insert({
        cleaner_id: user!.id, owner_id: b.apartments.owner_id, booking_id: b.id,
        type: 'deposit', amount, note: 'Наличными за аренду',
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(),
  })

  // Cover this owner_transfer cleaning fee from the cash till instead of waiting for a transfer
  const withdrawFromTill = useMutation({
    mutationFn: async () => {
      const { error: ledgerError } = await supabase.from('cash_ledger').insert({
        cleaner_id: user!.id, owner_id: b.apartments.owner_id, cleaning_task_id: task.id,
        type: 'withdrawal', amount: task.cleaning_fee, note: 'Списано из кассы за уборку',
      })
      if (ledgerError) throw ledgerError
      const { error: taskError } = await supabase.from('cleaning_tasks').update({ payment_status: 'paid' }).eq('id', task.id)
      if (taskError) throw taskError
    },
    onSuccess: () => invalidateAll(),
  })

  const rentVal = Number(rentInput)
  const rentValid = rentInput !== '' && !isNaN(rentVal) && rentVal > 0

  return (
    <motion.div key="cleaner-modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div key="cleaner-modal-panel"
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-card rounded-3xl shadow-2xl border border-border p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-display font-bold text-foreground">{b.apartments.title}</h2>
              {isCur && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">● Сейчас</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM yyyy', { locale: ru })} · {nights} н.
            </p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Client data */}
        <div className="flex flex-col gap-2.5 bg-secondary/50 rounded-2xl p-4">
          {b.share_contact_with_cleaner && b.guest_name && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Гость</span>
              <span className="font-semibold text-foreground">{b.guest_name}</span>
            </div>
          )}
          {b.share_contact_with_cleaner && b.guest_phone && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Телефон</span>
              <span className="font-semibold text-foreground text-right">
                <a href={`tel:${b.guest_phone}`} className="text-primary hover:underline">{b.guest_phone}</a>
                {country ? <span className="block text-[11px] text-muted-foreground font-normal">{country.flag} {country.name}</span> : null}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Гостей</span>
            <span className="font-semibold text-foreground">{b.guests_count}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Источник</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
              {SOURCE_LABELS[b.source] ?? b.source}
            </span>
          </div>
          <div className="border-t border-border/60 my-0.5" />
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Уборка</span>
            <span className="font-bold text-foreground">{fmtEur(task.cleaning_fee)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Оплата</span>
            <span>
              {isPaid ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Оплачено</span>
                : <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Не оплачено</span>}
            </span>
          </div>
          {task.payment_method && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Способ</span>
              <span className="text-foreground text-xs">{isOwnerTransfer ? '🏦 Перевод' : '💵 Наличные'}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Уборка выполнена</span>
            <span>
              {isDone ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">✓ Убрано</span>
                : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">🧹 Ещё нет</span>}
            </span>
          </div>
        </div>

        {/* Cash from guest for rent (private bookings) */}
        {b.source === 'other' && (
          <div className="bg-secondary/50 rounded-2xl p-4 flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">💰 Гость отдал наличными за аренду</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 border border-border bg-card rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/40">
                <input type="text" inputMode="decimal" value={rentInput} onChange={e => setRentInput(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm font-semibold min-w-0" />
                <span className="text-muted-foreground font-semibold text-sm flex-shrink-0">€</span>
              </div>
              <button onClick={() => rentValid && depositRent.mutate(rentVal)} disabled={!rentValid || depositRent.isPending}
                className="px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                {depositRent.isPending ? 'Сохранение…' : 'В кассу'}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Пойдёт в кассу — можно будет списывать за будущие уборки</p>
          </div>
        )}

        {/* Rating + comment — before marking done (guest already checked out) */}
        {!isDone && !isCur && (
          <div className="bg-secondary/50 rounded-2xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Насколько чисто оставил гость?</span>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Комментарий (необязательно): что-то сломали, на что обратить внимание…"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        )}

        {/* Already-submitted rating + comment */}
        {isDone && (b.guest_rating || task.cleaner_comment) && (
          <div className="bg-secondary/50 rounded-2xl p-4 flex flex-col gap-1.5">
            {b.guest_rating ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Чистота гостя:</span>
                <StarPicker value={b.guest_rating} readOnly />
              </div>
            ) : null}
            {task.cleaner_comment && <p className="text-xs text-foreground">📝 {task.cleaner_comment}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!isDone && !isCur && (
            <button onClick={() => markDone.mutate()} disabled={markDone.isPending || rating === 0}
              title={rating === 0 ? 'Сначала оцените чистоту' : undefined}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              <CheckCircle2 size={15} />
              {markDone.isPending ? 'Сохраняем…' : 'Уборка выполнена'}
            </button>
          )}
          {isCur && !isDone && (
            <p className="text-xs text-muted-foreground italic text-center py-1">Отметить уборку можно после выезда гостя</p>
          )}
          {!isPaid && (
            <button onClick={() => receivedFromClient.mutate()} disabled={receivedFromClient.isPending}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-purple-100 text-purple-800 text-sm font-semibold hover:bg-purple-200 transition-colors disabled:opacity-60">
              <Banknote size={15} /> Получила от клиента {fmtEur(task.cleaning_fee)}
            </button>
          )}
          {isOwnerTransfer && !isPaid && canWithdraw && (
            <button onClick={() => withdrawFromTill.mutate()} disabled={withdrawFromTill.isPending}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-amber-100 text-amber-900 text-sm font-semibold hover:bg-amber-200 transition-colors disabled:opacity-60">
              <Wallet size={15} /> Списать {fmtEur(task.cleaning_fee)} из кассы
            </button>
          )}
          {isOwnerTransfer && !isPaid && !canWithdraw && (
            <p className="text-xs text-muted-foreground italic text-center py-1">Ждём перевода от хозяина</p>
          )}
          <button onClick={onClose} className="w-full py-2.5 rounded-2xl bg-secondary text-sm font-medium text-foreground hover:bg-muted transition-colors">
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Card (list item) ───────────────────────────────────────────────────────────

function TaskCard({ task, onSelect, aptColor }: { task: TaskRow; onSelect: () => void; aptColor: (id: string) => string }) {
  const b = task.bookings
  const today = new Date().toISOString().slice(0, 10)
  const isCur = b.start_date <= today && b.end_date > today
  const isUp = b.start_date > today
  const isPaid = task.payment_status === 'paid'
  const isPartial = task.payment_status === 'partial'
  const nights = Math.max(1, Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000))
  const color = aptColor(b.apartments.id)

  return (
    <button onClick={onSelect}
      className={`bg-card border rounded-2xl shadow-sm transition-all text-left w-full hover:shadow-md hover:border-primary/30 ${isCur ? 'ring-1 ring-primary/20' : 'border-border'}`}
      style={isCur ? { borderColor: color } : undefined}>
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-shrink-0 text-center rounded-xl px-2 py-2 w-[80px] text-white" style={{ backgroundColor: color }}>
          <div className="text-sm font-bold leading-tight whitespace-nowrap">
            {b.start_date.slice(8)}–{b.end_date.slice(8)}
          </div>
          <div className="text-[9px] uppercase font-semibold text-white/85 whitespace-nowrap">
            {b.start_date.slice(0, 7) === b.end_date.slice(0, 7)
              ? format(parseISO(b.start_date), 'LLLL', { locale: ru })
              : `${format(parseISO(b.start_date), 'LLL', { locale: ru }).replace('.', '')}–${format(parseISO(b.end_date), 'LLL', { locale: ru }).replace('.', '')}`}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p className="text-base font-bold text-foreground">{b.apartments.title}</p>
            {isCur && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">● Сейчас</span>}
            {isUp && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Предстоящий</span>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
              {SOURCE_LABELS[b.source] ?? b.source}
            </span>
            {task.status === 'done'
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">✓ Убрано</span>
              : !isUp && !isCur
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">🧹 Нужна уборка</span>
                : null}
          </div>
          <p className="text-sm text-foreground/80 flex items-center gap-1.5 mt-0.5">
            {nights} н.
            <span className="inline-flex items-center gap-0.5 text-sm text-foreground/80">
              <Users size={13} /> {b.guests_count}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            {format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM yyyy', { locale: ru })}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5 min-w-[80px] max-w-[110px]">
          <p className="text-lg font-bold text-foreground">{fmtEur(task.cleaning_fee)}</p>
          {isPaid && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Оплачено</span>}
          {isPartial && <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Частично</span>}
          {!isPaid && !isPartial && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Не оплачено</span>}
          <p className="text-[10px] text-muted-foreground font-medium">{task.payment_method === 'owner_transfer' ? '🏦 Перевод' : task.payment_method === 'guest_cash' ? '💵 Наличные' : ''}</p>
        </div>
        <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />
      </div>
    </button>
  )
}

// ─── Calendar — full stay-range bars, one row per apartment ────────────────────

const ROW_H = 15

function CleanerCalendar({ tasks, aptColor }: { tasks: TaskRow[]; aptColor: (id: string) => string }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const todayStr = new Date().toISOString().slice(0, 10)

  const { aptOrder, byApt } = useMemo(() => {
    const order: { id: string; title: string }[] = []
    const map = new Map<string, TaskRow[]>()
    tasks.forEach(t => {
      const apt = t.bookings?.apartments
      if (!apt) return
      if (!map.has(apt.id)) { map.set(apt.id, []); order.push({ id: apt.id, title: apt.title }) }
      map.get(apt.id)!.push(t)
    })
    return { aptOrder: order, byApt: map }
  }, [tasks])

  const taskOnDay = (aptId: string, dateStr: string) =>
    (byApt.get(aptId) ?? []).find(t => t.bookings.start_date <= dateStr && dateStr <= t.bookings.end_date)

  const weeks = useMemo(() => {
    const year = month.getFullYear(), mo = month.getMonth()
    const firstDow = (new Date(year, mo, 1).getDay() + 6) % 7
    const daysInMonth = getDaysInMonth(month)
    const cells: (number | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    const wks: (number | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) wks.push(cells.slice(i, i + 7))
    return wks
  }, [month])

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={15} /></button>
        <p className="text-sm font-semibold capitalize">{format(month, 'LLLL yyyy', { locale: ru })}</p>
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 border-b border-border">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground uppercase py-1.5">{d}</div>
        ))}
      </div>
      <div className="divide-y divide-border">
        {weeks.map((week, wi) => {
          const cellMinH = 26 + Math.max(1, aptOrder.length) * (ROW_H + 2)
          return (
            <div key={wi} className="grid grid-cols-7 divide-x divide-border">
              {week.map((day, di) => {
                if (day === null) return <div key={di} className="bg-gray-50/60" style={{ minHeight: cellMinH }} />
                const dateStr = `${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(day)}`
                const isToday = dateStr === todayStr
                return (
                  <div key={di} className="p-1 flex flex-col gap-[2px] overflow-hidden" style={{ minHeight: cellMinH }}>
                    <span className={`text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 ${isToday ? 'bg-primary text-primary-foreground' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    {aptOrder.map(apt => {
                      const t = taskOnDay(apt.id, dateStr)
                      if (!t) return <div key={apt.id} style={{ height: ROW_H }} />
                      const isStart = t.bookings.start_date === dateStr
                      const isEnd = t.bookings.end_date === dateStr
                      const guests = t.bookings.guests_count
                      return (
                        <span key={apt.id}
                          title={`${apt.title} · ${guests ? `${guests} чел · ` : ''}€${t.cleaning_fee} · ${t.payment_status === 'paid' ? 'оплачено' : 'не оплачено'}`}
                          className={`flex items-center text-[8px] leading-none text-gray-800 overflow-hidden ${isStart ? 'rounded-l-full pl-1.5' : '-ml-1'} ${isEnd ? 'rounded-r-full pr-1' : '-mr-1'}`}
                          style={{ height: ROW_H, backgroundColor: aptColor(apt.id), opacity: t.payment_status === 'paid' ? 0.5 : 0.9 }}>
                          {isStart && <span className="truncate font-bold">{apt.title}{guests ? ` · ${guests}` : ''}</span>}
                        </span>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {aptOrder.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-t border-border">
          {aptOrder.map(apt => (
            <div key={apt.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: aptColor(apt.id) }} />
              <span className="text-[11px] text-muted-foreground font-medium">{apt.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CleanerDashboard() {
  const { user, signOut } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'bookings' | 'payment' | 'calendar' | 'archive' | 'profile'>('bookings')
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [aptFilter, setAptFilter] = useState<string>('all')
  const [showCashForm, setShowCashForm] = useState(false)
  const [cashDirection, setCashDirection] = useState<'deposit' | 'withdrawal'>('deposit')
  const [cashAmount, setCashAmount] = useState('')
  const [cashNote, setCashNote] = useState('')

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['cleaner-tasks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaning_tasks')
        .select(
          '*, bookings(id, start_date, end_date, guest_name, guest_phone, guests_count, guest_rating, share_contact_with_cleaner, source, total_amount, apartments(id, title, address, owner_id))',
        )
        .eq('cleaner_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TaskRow[]
    },
    enabled: !!user,
  })

  const { data: ledger } = useQuery({
    queryKey: ['cleaner-cash-ledger', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('cash_ledger').select('*').eq('cleaner_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CashEntry[]
    },
    enabled: !!user,
  })

  const manualCashEntry = useMutation({
    mutationFn: async ({ ownerId, type, amount, note }: { ownerId: string; type: 'deposit' | 'withdrawal'; amount: number; note: string | null }) => {
      const { error } = await supabase.from('cash_ledger').insert({
        cleaner_id: user!.id, owner_id: ownerId, type, amount, note,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setShowCashForm(false); setCashAmount(''); setCashNote('')
      qc.invalidateQueries({ queryKey: ['cleaner-cash-ledger'] })
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['cleaner-tasks'] })

  const cashBalance = (ledger ?? []).reduce((s, e) => s + (e.type === 'deposit' ? e.amount : -e.amount), 0)

  const today = new Date().toISOString().slice(0, 10)
  const all = tasks ?? []
  const currentStays = all.filter(t => t.bookings.start_date <= today && t.bookings.end_date > today)
  const upcoming = all.filter(t => t.bookings.start_date > today && t.status !== 'done' && t.payment_status !== 'paid')
    .sort((a, b) => a.bookings.start_date.localeCompare(b.bookings.start_date))
  const overdue = all.filter(t => t.bookings.end_date <= today && t.status !== 'done' && t.payment_status !== 'paid')
    .sort((a, b) => a.bookings.end_date.localeCompare(b.bookings.end_date))
  const archive = all.filter(t => t.status === 'done' || t.payment_status === 'paid')
    .sort((a, b) => b.bookings.end_date.localeCompare(a.bookings.end_date))

  const getPaidAmt = (t: TaskRow) => t.payment_status === 'paid' ? t.cleaning_fee : 0
  const totalOwed = all.reduce((s, t) => s + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0)
  const totalPaid = all.reduce((s, t) => s + getPaidAmt(t), 0)
  const totalEarned = totalOwed + totalPaid
  const pct = totalEarned > 0 ? Math.round((totalPaid / totalEarned) * 100) : 0

  // Stable apartment list + colors (for calendar + the payment filter)
  const apartments = useMemo(() => {
    const seen = new Set<string>()
    const list: { id: string; title: string }[] = []
    all.forEach(t => {
      const apt = t.bookings?.apartments
      if (apt && !seen.has(apt.id)) { seen.add(apt.id); list.push({ id: apt.id, title: apt.title }) }
    })
    return list
  }, [all])
  const aptColorMap = useMemo(() => {
    const map = new Map<string, string>()
    apartments.forEach((a, i) => map.set(a.id, APT_COLORS[i % APT_COLORS.length]))
    return map
  }, [apartments])
  const aptColor = (id: string) => aptColorMap.get(id) ?? '#6366f1'
  const primaryOwnerId = all[0]?.bookings.apartments.owner_id ?? null

  // Describe a ledger entry — which apartment/booking it relates to, or "manual"
  const describeCashEntry = (e: CashEntry) => {
    if (e.cleaning_task_id) {
      const t = all.find(x => x.id === e.cleaning_task_id)
      if (t) return { title: t.bookings.apartments.title, sub: e.note ?? 'Списано за уборку' }
    }
    if (e.booking_id) {
      const t = all.find(x => x.bookings.id === e.booking_id)
      if (t) return { title: t.bookings.apartments.title, sub: e.note ?? 'Наличными за аренду' }
    }
    return { title: e.type === 'deposit' ? 'Пополнение вручную' : 'Списание вручную', sub: e.note ?? '' }
  }

  const NAV = [
    { id: 'bookings' as const, label: 'Заезды', icon: <CalendarDays size={16} />, count: currentStays.length + upcoming.length + overdue.length },
    { id: 'payment' as const, label: 'Оплата', icon: <Banknote size={16} /> },
    { id: 'calendar' as const, label: 'Календарь', icon: <CalendarDays size={16} /> },
    { id: 'archive' as const, label: 'Архив', icon: <FileText size={16} />, count: archive.length },
  ]

  const MOBILE_NAV = [
    { id: 'bookings' as const, label: 'Заезды', icon: <ClipboardList size={19} /> },
    { id: 'payment' as const, label: 'Оплата', icon: <Wallet size={19} /> },
    { id: 'calendar' as const, label: 'Календарь', icon: <CalendarDays size={19} /> },
    { id: 'archive' as const, label: 'Архив', icon: <Archive size={19} /> },
    { id: 'profile' as const, label: 'Профиль', icon: <User size={19} /> },
  ]

  if (!user) return null

  const byApartment = (t: TaskRow) => aptFilter === 'all' || t.bookings.apartments.id === aptFilter
  const paidList = all.filter(t => t.payment_status === 'paid' && byApartment(t))
  const unpaidList = all.filter(t => t.payment_status !== 'paid' && byApartment(t))

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* ── Left sidebar (desktop only) ── */}
      <aside className="sidebar-root hidden md:flex w-52 flex-shrink-0 flex-col py-5 px-3">
        <div className="px-2 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Brush size={16} className="text-primary flex-shrink-0" />
            <span className="font-display font-bold text-sm leading-tight" style={{ color: 'hsl(var(--sidebar-logo-fg))' }}>
              Сервис по уборке
            </span>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`sidebar-nav-item flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative ${tab === item.id ? 'active' : ''}`}>
              {item.icon}
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === item.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted-foreground/15 text-muted-foreground'}`}>
                  {item.count}
                </span>
              )}
              {item.id === 'payment' && totalOwed > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-600">{fmtEur(totalOwed)}</span>
              )}
            </button>
          ))}
        </nav>
        {cashBalance > 0 && (
          <div className="mt-3 mx-1 p-3 rounded-xl bg-purple-50 border border-purple-100">
            <p className="text-[10px] text-purple-700 font-semibold mb-0.5 flex items-center gap-1"><Wallet size={11} /> Касса (наличные)</p>
            <p className="text-lg font-bold text-purple-800">{fmtEur(cashBalance)}</p>
          </div>
        )}
        {totalOwed > 0 ? (
          <div className="mt-3 mx-1 p-3 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[10px] text-red-600 font-semibold mb-0.5">Ожидает оплаты</p>
            <p className="text-lg font-bold text-red-700">{fmtEur(totalOwed)}</p>
          </div>
        ) : totalEarned > 0 ? (
          <div className="mt-3 mx-1 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] text-emerald-700 font-semibold">✓ Всё выплачено</p>
            <p className="text-lg font-bold text-emerald-700">{fmtEur(totalPaid)}</p>
          </div>
        ) : null}
        <button onClick={() => signOut()}
          className="mt-auto mx-1 flex items-center gap-2 px-2 py-2 rounded-xl text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <LogOut size={13} /> Выйти
        </button>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className={`px-3 py-4 md:px-8 md:py-8 pb-20 md:pb-8 flex-1 ${tab === 'calendar' ? 'max-w-4xl' : 'max-w-3xl'} w-full`}>
          <div className="mb-4 md:mb-6">
            <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
              {tab === 'bookings' ? 'Заезды' : tab === 'payment' ? 'Оплата' : tab === 'calendar' ? 'Календарь' : tab === 'profile' ? 'Профиль' : 'Архив заездов'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === 'bookings' ? `${currentStays.length} сейчас · ${upcoming.length + overdue.length} предстоящих` :
               tab === 'payment' ? `Заработано ${fmtEur(totalEarned)} · получено ${fmtEur(totalPaid)}` :
               tab === 'calendar' ? 'Все заезды по всем квартирам' :
               tab === 'profile' ? (user?.email ?? '') :
               `${archive.length} завершённых заездов`}
            </p>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl animate-pulse bg-muted" />)}
            </div>
          ) : tab === 'bookings' ? (() => {
            const curF = currentStays.filter(byApartment)
            const overF = overdue.filter(byApartment)
            const upF = upcoming.filter(byApartment)
            const daysToNextF = upF.length > 0
              ? Math.max(0, Math.round((parseISO(upF[0].bookings.start_date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))
              : null
            return (
            <div className="flex flex-col gap-5">
              {apartments.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Квартира:</span>
                  <select value={aptFilter} onChange={e => setAptFilter(e.target.value)}
                    className="text-xs rounded-xl border border-border bg-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="all">Все квартиры</option>
                    {apartments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
                  <p className="text-2xl font-bold text-primary">{curF.length + upF.length + overF.length}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">заездов впереди</p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
                  <p className="text-2xl font-bold text-foreground">{curF.length}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">сейчас заселено</p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
                  {daysToNextF !== null ? (
                    <><p className="text-2xl font-bold text-foreground">{daysToNextF}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{daysToNextF === 0 ? 'заезд сегодня!' : 'дней до заезда'}</p></>
                  ) : (
                    <><p className="text-2xl font-bold text-muted-foreground">—</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">нет заездов</p></>
                  )}
                </div>
              </div>

              {curF.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">Сейчас заселены</h3>
                  <div className="flex flex-col gap-2">{curF.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} />)}</div>
                </div>
              )}
              {overF.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-destructive uppercase tracking-widest mb-3">Нужна уборка сейчас — {overF.length}</h3>
                  <div className="flex flex-col gap-2">{overF.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} />)}</div>
                </div>
              )}
              {upF.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">Предстоящие — {upF.length}</h3>
                  <div className="flex flex-col gap-2">{upF.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} />)}</div>
                </div>
              )}
              {curF.length === 0 && overF.length === 0 && upF.length === 0 && (
                <div className="bg-card border border-border rounded-2xl p-10 text-center">
                  <p className="text-3xl mb-2">🧹</p>
                  <p className="text-sm text-muted-foreground">Нет предстоящих заездов</p>
                </div>
              )}
            </div>
            )
          })() : tab === 'calendar' ? (
            <CleanerCalendar tasks={all} aptColor={aptColor} />
          ) : tab === 'payment' ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center">
                  <p className="text-xs text-muted-foreground mb-2">Всего заработано</p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground whitespace-nowrap">{fmtEur(totalEarned)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{all.length} уборок</p>
                </div>
                <div className={`bg-card border rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center ${totalOwed > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
                  <p className="text-xs text-muted-foreground mb-2">Ожидает оплаты</p>
                  <p className={`text-xl sm:text-2xl font-bold whitespace-nowrap ${totalOwed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtEur(totalOwed)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{totalOwed > 0 ? 'ожидает перевода / наличных' : 'долгов нет 🎉'}</p>
                </div>
                <div className="bg-card border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center">
                  <p className="text-xs text-muted-foreground mb-2">Получено</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 whitespace-nowrap">{fmtEur(totalPaid)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{paidList.length} оплачено</p>
                </div>
                <div className="bg-card border border-purple-200 rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Wallet size={12} /> Касса (наличные)</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-700 whitespace-nowrap">{fmtEur(cashBalance)}</p>
                  <button onClick={() => setShowCashForm(p => !p)}
                    className="text-[11px] text-primary font-semibold hover:underline mt-1">
                    Изменить кассу
                  </button>
                </div>
              </div>

              {showCashForm && (
                <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col gap-3">
                  <p className="text-sm font-semibold text-foreground">Изменить сумму в кассе</p>
                  <div className="flex gap-2">
                    <button onClick={() => setCashDirection('deposit')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center justify-center gap-1 ${cashDirection === 'deposit' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      <Plus size={13} /> Пополнить
                    </button>
                    <button onClick={() => setCashDirection('withdrawal')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center justify-center gap-1 ${cashDirection === 'withdrawal' ? 'bg-red-600 text-white border-red-600' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      <Minus size={13} /> Списать
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 border border-border bg-background rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/40">
                    <input type="text" inputMode="decimal" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                      placeholder="Сумма" className="flex-1 bg-transparent outline-none text-sm font-semibold min-w-0" />
                    <span className="text-muted-foreground font-semibold text-sm flex-shrink-0">€</span>
                  </div>
                  <input type="text" value={cashNote} onChange={e => setCashNote(e.target.value)}
                    placeholder="Комментарий (необязательно)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                  <div className="flex gap-2">
                    <button onClick={() => setShowCashForm(false)}
                      className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                      Отмена
                    </button>
                    <button
                      onClick={() => {
                        const v = Number(cashAmount)
                        if (primaryOwnerId && cashAmount !== '' && !isNaN(v) && v > 0) {
                          manualCashEntry.mutate({ ownerId: primaryOwnerId, type: cashDirection, amount: v, note: cashNote.trim() || null })
                        }
                      }}
                      disabled={manualCashEntry.isPending || !primaryOwnerId || cashAmount === '' || isNaN(Number(cashAmount)) || Number(cashAmount) <= 0}
                      className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                      {manualCashEntry.isPending ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              )}

              {(ledger?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3 flex items-center gap-1.5">
                    <History size={13} /> История кассы — {ledger!.length}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {ledger!.map(e => {
                      const info = describeCashEntry(e)
                      const isDeposit = e.type === 'deposit'
                      return (
                        <div key={e.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDeposit ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {isDeposit ? <Plus size={15} /> : <Minus size={15} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{info.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{info.sub || (isDeposit ? 'Пополнение' : 'Списание')} · {format(parseISO(e.created_at.slice(0, 10)), 'd MMM yyyy', { locale: ru })}</p>
                          </div>
                          <p className={`text-sm font-bold flex-shrink-0 ${isDeposit ? 'text-emerald-700' : 'text-red-600'}`}>
                            {isDeposit ? '+' : '−'}{fmtEur(e.amount)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {totalEarned > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between text-sm mb-3">
                    <span className="text-muted-foreground">Получено {fmtEur(totalPaid)} из {fmtEur(totalEarned)}</span>
                    <span className="font-bold text-foreground">{pct}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}

              {apartments.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Квартира:</span>
                  <select value={aptFilter} onChange={e => setAptFilter(e.target.value)}
                    className="text-xs rounded-xl border border-border bg-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="all">Все квартиры</option>
                    {apartments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>
              )}

              {unpaidList.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">Не оплачено — {unpaidList.length}</h3>
                  <div className="flex flex-col gap-2">{unpaidList.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} />)}</div>
                </div>
              )}
              {paidList.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">Оплачено — {paidList.length}</h3>
                  <div className="flex flex-col gap-2">{paidList.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} />)}</div>
                </div>
              )}
              {unpaidList.length === 0 && paidList.length === 0 && (
                <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground text-sm">Нет данных об уборках</div>
              )}
            </div>
          ) : tab === 'archive' ? (
            <div>
              {archive.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground text-sm">Архив пуст</div>
              ) : (
                <div className="flex flex-col gap-2">{archive.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} />)}</div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                  {user?.email?.[0]?.toUpperCase() ?? 'У'}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{user?.email ?? 'Уборщица'}</p>
                  <p className="text-xs text-muted-foreground">Сервис по уборке</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
                  <p className="text-xl font-bold text-foreground">{fmtEur(totalEarned)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Всего заработано</p>
                </div>
                <div className="bg-card border border-purple-200 rounded-2xl p-4 shadow-sm text-center">
                  <p className="text-xl font-bold text-purple-700 flex items-center justify-center gap-1"><Wallet size={15} /> {fmtEur(cashBalance)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Касса (наличные)</p>
                </div>
              </div>
              <button onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                <LogOut size={16} /> Выйти
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch h-16 px-1"
        style={{ background: 'hsl(var(--sidebar))', borderTop: '1px solid hsl(var(--sidebar-border))', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {MOBILE_NAV.map(item => {
          const isActive = tab === item.id
          return (
            <button key={item.id} onClick={() => setTab(item.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
              style={{ color: isActive ? 'hsl(var(--sidebar-active-fg))' : 'hsl(var(--sidebar-fg))' }}>
              {isActive && (
                <span className="absolute top-1 inset-x-6 h-0.5 rounded-full" style={{ background: 'hsl(var(--sidebar-active-fg))' }} />
              )}
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.id === 'payment' && totalOwed > 0 && (
                <span className="absolute top-0 right-4 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">€</span>
              )}
            </button>
          )
        })}
      </nav>

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal key={selectedTask.id} task={selectedTask} cashBalance={cashBalance}
            onClose={() => setSelectedTask(null)} onRefresh={invalidate} />
        )}
      </AnimatePresence>
    </div>
  )
}
