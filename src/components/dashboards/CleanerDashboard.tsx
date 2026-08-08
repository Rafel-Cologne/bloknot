import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays, Banknote, FileText, Star, X, ChevronRight, ChevronLeft, Brush, LogOut,
  CheckCircle2, Wallet, Users, Plus, Minus, History, ClipboardList, Archive, User,
} from 'lucide-react'
import { format, parseISO, getDaysInMonth, addDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { APP_VERSION } from '@/lib/version'
import { type Apartment } from './OwnerDashboard'

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
  owner_id: string
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

// Русское склонение "день/дня/дней" — с учётом исключения 11-14 (всегда "дней").
function pluralDaysWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}
const daysUntilLabel = (n: number) => n === 0 ? 'сегодня' : `через ${n} ${pluralDaysWord(n)}`
const isoAddDays = (dateStr: string, n: number) => format(addDays(parseISO(dateStr), n), 'yyyy-MM-dd')

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

function TaskDetailModal({ task, cashBalance, onClose, onRefresh, readOnly }: {
  task: TaskRow; cashBalance: number; onClose: () => void; onRefresh: () => void; readOnly?: boolean
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [rentInput, setRentInput] = useState(String(task.bookings.total_amount ?? ''))

  const b = task.bookings
  const today = new Date().toISOString().slice(0, 10)
  const isCur = b.start_date <= today && b.end_date > today
  const isPast = b.end_date <= today
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

  // Задача уже отмечена "убрано" (например, старая запись до появления обязательной оценки),
  // но оценки чистоты так и не было — даём её добавить отдельно, не трогая статус уборки.
  const saveRatingOnly = useMutation({
    mutationFn: async () => {
      if (rating > 0) {
        const { error: bookingError } = await supabase.from('bookings').update({ guest_rating: rating }).eq('id', b.id)
        if (bookingError) throw bookingError
      }
      if (comment.trim()) {
        const { error: taskError } = await supabase.from('cleaning_tasks').update({ cleaner_comment: comment.trim() }).eq('id', task.id)
        if (taskError) throw taskError
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

        {readOnly && (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            👁 Режим предпросмотра администратора — изменения недоступны
          </p>
        )}

        {/* Client data */}
        <div className="flex flex-col gap-2.5 bg-secondary/50 rounded-2xl p-4">
          {b.guest_name && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Гость</span>
              <span className="font-semibold text-foreground">{b.guest_name}</span>
            </div>
          )}
          {b.guest_phone && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Телефон</span>
              <span className="font-semibold text-foreground text-right">
                <a href={`tel:${b.guest_phone}`} className="text-primary hover:underline">{b.guest_phone}</a>
                {country ? <span className="block text-[11px] text-muted-foreground font-normal">{country.name}</span> : null}
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
        {b.source === 'other' && !readOnly && (
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

        {/* Rating + comment — only once the guest has actually checked out, and only if not rated yet
            (covers both: not-yet-done tasks, and older "убрано" tasks that never got a rating) */}
        {isPast && !b.guest_rating && (
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
        {(b.guest_rating || task.cleaner_comment) && (
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
          {!isDone && isPast && (
            <button onClick={() => markDone.mutate()} disabled={markDone.isPending || rating === 0 || readOnly}
              title={readOnly ? 'Недоступно в режиме предпросмотра' : rating === 0 ? 'Сначала оцените чистоту' : undefined}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              <CheckCircle2 size={15} />
              {markDone.isPending ? 'Сохраняем…' : 'Уборка выполнена'}
            </button>
          )}
          {!isDone && !isPast && (
            <p className="text-xs text-muted-foreground italic text-center py-1">Отметить уборку можно после выезда гостя</p>
          )}
          {isDone && !b.guest_rating && (
            <button onClick={() => saveRatingOnly.mutate()} disabled={saveRatingOnly.isPending || rating === 0 || readOnly}
              title={readOnly ? 'Недоступно в режиме предпросмотра' : rating === 0 ? 'Сначала оцените чистоту' : undefined}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              <Star size={15} />
              {saveRatingOnly.isPending ? 'Сохраняем…' : 'Сохранить оценку'}
            </button>
          )}
          {/* Наличные/касса — только для частных заездов (гость платит напрямую).
              Для Airbnb/Booking оплату уборщице переводит хозяин отдельно —
              здесь ей нужны только оценка, комментарий и кнопка "убрано". */}
          {b.source === 'other' && !isPaid && !readOnly && (
            <button onClick={() => receivedFromClient.mutate()} disabled={receivedFromClient.isPending}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-purple-100 text-purple-800 text-sm font-semibold hover:bg-purple-200 transition-colors disabled:opacity-60">
              <Banknote size={15} /> Получила от клиента {fmtEur(task.cleaning_fee)}
            </button>
          )}
          {b.source === 'other' && isOwnerTransfer && !isPaid && canWithdraw && !readOnly && (
            <button onClick={() => withdrawFromTill.mutate()} disabled={withdrawFromTill.isPending}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-amber-100 text-amber-900 text-sm font-semibold hover:bg-amber-200 transition-colors disabled:opacity-60">
              <Wallet size={15} /> Списать {fmtEur(task.cleaning_fee)} из кассы
            </button>
          )}
          {b.source === 'other' && isOwnerTransfer && !isPaid && !canWithdraw && (
            <p className="text-xs text-muted-foreground italic text-center py-1">Ждём перевода от клиента</p>
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

function TaskCard({ task, onSelect, aptColor, ownerLabel, highlightCheckoutToday, compact, showDueBadge }: {
  task: TaskRow; onSelect: () => void; aptColor: (id: string) => string
  ownerLabel?: string; highlightCheckoutToday?: boolean; compact?: boolean; showDueBadge?: boolean
}) {
  const b = task.bookings
  const today = new Date().toISOString().slice(0, 10)
  const isCur = b.start_date <= today && b.end_date > today
  const isUp = b.start_date > today
  const isPaid = task.payment_status === 'paid'
  const isPartial = task.payment_status === 'partial'
  const checkoutToday = b.end_date === today && task.status !== 'done'
  const nights = Math.max(1, Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000))
  const color = aptColor(b.apartments.id)
  const country = b.guest_phone ? detectCountry(b.guest_phone) : null
  // На вкладке "Оплата" карточка входит в реальную задолженность "Ожидает оплаты" только
  // если выезд уже случился и уборка отмечена сделанной — так же, как считается dueOwed.
  // Подсвечиваем такие карточки красным, чтобы было видно, какие именно уборки составляют сумму.
  const dueNow = b.end_date <= today && task.status === 'done'
  const highlightDue = showDueBadge && dueNow && !isPaid && !isPartial

  const borderClass = checkoutToday && highlightCheckoutToday
    ? 'border-2 border-amber-400'
    : highlightDue
      ? 'border border-red-300 bg-red-50/60'
      : `border hover:border-primary/30 ${isCur ? 'ring-1 ring-primary/20' : 'border-border'}`
  const borderStyle = isCur && !(checkoutToday && highlightCheckoutToday) && !highlightDue ? { borderColor: color } : undefined

  // Компактная карточка — для узких колонок (сетка по объектам во вкладке "Уборка"),
  // где широкий горизонтальный ряд из обычной карточки переносился на несколько строк
  // и делал карточки квадратными/разной высоты. Вертикальная раскладка с фиксированным
  // числом строк держит карточки одинаковой высоты и по ширине колонки.
  // Все карточки в этой сетке — ожидающие уборки, поэтому рамка жёлтая по умолчанию;
  // если выезд был больше 2 дней назад и до сих пор не отмечен убранным — рамка красная.
  if (compact) {
    const daysOverdue = Math.round((new Date().setHours(0, 0, 0, 0) - parseISO(b.end_date).getTime()) / 86400000)
    const compactBorderClass = daysOverdue > 2 ? 'border-2 border-red-400' : 'border-2 border-amber-400'
    return (
      <button onClick={onSelect}
        className={`bg-card rounded-2xl shadow-sm transition-all text-left w-full hover:shadow-md p-4 flex flex-col gap-2 ${compactBorderClass}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-center rounded-lg px-2 py-1.5 w-[56px] text-white" style={{ backgroundColor: color }}>
            <div className="text-xs font-bold leading-tight whitespace-nowrap">
              {b.start_date.slice(8)}–{b.end_date.slice(8)}
            </div>
            <div className="text-[8px] uppercase font-semibold text-white/85 whitespace-nowrap">
              {format(parseISO(b.start_date), 'LLL', { locale: ru }).replace('.', '')}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {ownerLabel && <p className="text-[11px] text-muted-foreground leading-tight truncate">Клиент: {ownerLabel}</p>}
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{b.guest_name || '—'}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold text-white flex-shrink-0" style={{ backgroundColor: color }}>
                {b.apartments.title}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{nights} н. · {b.guests_count} чел.</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0 mt-1" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {checkoutToday && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold whitespace-nowrap">🧳 Сегодня</span>}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
            {SOURCE_LABELS[b.source] ?? b.source}
          </span>
          {task.status === 'done'
            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold whitespace-nowrap">✓ Убрано</span>
            : !isUp && !isCur && !checkoutToday
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold whitespace-nowrap">🧹 Нужна уборка</span>
              : null}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-border/60">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM yy', { locale: ru })}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-sm font-bold text-foreground whitespace-nowrap">{fmtEur(task.cleaning_fee)}</span>
            {isPaid && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold whitespace-nowrap">✓</span>}
            {isPartial && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold whitespace-nowrap">½</span>}
          </div>
        </div>
      </button>
    )
  }

  return (
    <button onClick={onSelect}
      className={`bg-card rounded-2xl shadow-sm transition-all text-left w-full hover:shadow-md ${borderClass}`}
      style={borderStyle}>
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
            {checkoutToday && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">🧳 Выезд сегодня</span>}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
              {SOURCE_LABELS[b.source] ?? b.source}
            </span>
            {task.status === 'done'
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">✓ Убрано</span>
              : !isUp && !isCur && !checkoutToday
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">🧹 Нужна уборка</span>
                : null}
          </div>
          {ownerLabel && (
            <p className="text-xs text-muted-foreground -mt-0.5">Клиент: {ownerLabel}</p>
          )}
          {b.guest_name && (
            <p className="text-sm font-semibold text-foreground/90 mt-0.5 truncate">{b.guest_name}</p>
          )}
          <p className="text-sm text-foreground/80 flex items-center gap-2.5 mt-0.5 flex-wrap">
            <span>{nights} н.</span>
            <span className="inline-flex items-center gap-0.5">
              <Users size={13} /> {b.guests_count}
            </span>
            {b.guest_phone && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {b.guest_phone}{country ? ` · ${country.name}` : ''}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            {format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM yyyy', { locale: ru })}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5 min-w-[80px] max-w-[110px]">
          <p className="text-lg font-bold text-foreground">{fmtEur(task.cleaning_fee)}</p>
          {isPaid && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Оплачено</span>}
          {isPartial && <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Частично</span>}
          {!isPaid && !isPartial && (!showDueBadge || dueNow) && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Не оплачено</span>}
          {!isPaid && !isPartial && showDueBadge && !dueNow && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">Предстоящее</span>}
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

// ─── Stat card detail modal ─────────────────────────────────────────────────────
// Общий попап для карточек-счётчиков ("Сейчас заселено", "Дней до заезда", "Ближайший
// выезд") — по клику показывает список конкретных броней, которые эта цифра считает,
// вместо того чтобы заставлять клинера искать их вручную во вкладках.

function StatListModal({ title, subtitle, items, aptColor, ownerName, onSelectTask, onClose }: {
  title: string; subtitle?: string; items: TaskRow[]; aptColor: (id: string) => string
  ownerName: (id: string) => string; onSelectTask: (t: TaskRow) => void; onClose: () => void
}) {
  return (
    <motion.div key="stat-modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div key="stat-modal-panel"
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-card rounded-3xl shadow-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors">
            <X size={15} />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Ничего нет</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(t => (
              <TaskCard key={t.id} task={t} onSelect={() => onSelectTask(t)} aptColor={aptColor}
                ownerLabel={ownerName(t.bookings.apartments.owner_id)} highlightCheckoutToday />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Client balance modal ────────────────────────────────────────────────────────
// Клик по клиенту в "Баланс по клиентам" — карточка со сводкой (должен/оплачено/
// предстоит) и вкладками, чтобы не вываливать все брони одним списком, а дать клинеру
// самому выбрать, что посмотреть: за что должен сейчас, что уже оплачено, что впереди.

type ClientBalanceInfo = {
  ownerId: string; name: string; owed: number; paid: number; future: number
  dueUnpaidTasks: TaskRow[]; paidTasks: TaskRow[]; futureUnpaidTasks: TaskRow[]
}

function ClientBalanceModal({ client, aptColor, onSelectTask, onClose }: {
  client: ClientBalanceInfo; aptColor: (id: string) => string
  onSelectTask: (t: TaskRow) => void; onClose: () => void
}) {
  const [clientTab, setClientTab] = useState<'due' | 'paid' | 'future'>('due')
  const items = clientTab === 'due' ? client.dueUnpaidTasks : clientTab === 'paid' ? client.paidTasks : client.futureUnpaidTasks

  return (
    <motion.div key="client-balance-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div key="client-balance-panel"
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-card rounded-3xl shadow-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0">
              {client.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-display font-bold text-foreground truncate">{client.name}</h2>
              <p className={`text-sm font-semibold mt-0.5 ${client.owed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {client.owed > 0 ? `Должен ${fmtEur(client.owed)}` : 'Долгов нет'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center gap-0.5 bg-muted rounded-xl p-0.5">
          <button onClick={() => setClientTab('due')}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${clientTab === 'due' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Должен ({client.dueUnpaidTasks.length})
          </button>
          <button onClick={() => setClientTab('paid')}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${clientTab === 'paid' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Оплачено ({client.paidTasks.length})
          </button>
          <button onClick={() => setClientTab('future')}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${clientTab === 'future' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Ожидается ({client.futureUnpaidTasks.length})
          </button>
        </div>

        {clientTab === 'future' && client.future > 0 && (
          <p className="text-[11px] text-muted-foreground -mt-2">
            Ещё не долг — заезд впереди или уборка ещё не сделана. Сумма: {fmtEur(client.future)}
          </p>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Ничего нет</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(t => (
              <TaskCard key={t.id} task={t} onSelect={() => onSelectTask(t)} aptColor={aptColor} highlightCheckoutToday showDueBadge />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Cash-till breakdown modal ──────────────────────────────────────────────────
// "Касса" — общая сумма наличных, но деньги в ней принадлежат разным хозяевам (гости
// разных объектов отдают наличные за аренду). Клинеру важно видеть не только общий
// баланс, а по каждому хозяину: сколько он внёс и сколько из этого уже списано
// (погашено) за уборки.

type CashOwnerGroup = {
  ownerId: string; name: string; deposited: number; withdrawn: number; balance: number; entries: CashEntry[]
}

function CashByOwnerModal({ groups, describeEntry, onClose }: {
  groups: CashOwnerGroup[]; describeEntry: (e: CashEntry) => { title: string; sub: string }; onClose: () => void
}) {
  return (
    <motion.div key="cash-modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div key="cash-modal-panel"
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-card rounded-3xl shadow-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">Касса по хозяевам</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Кто сколько внёс наличными и сколько уже погашено</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors">
            <X size={15} />
          </button>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Касса пуста</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map(g => (
              <div key={g.ownerId} className="rounded-2xl border border-border p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">{g.name}</p>
                  <p className={`text-sm font-bold whitespace-nowrap ${g.balance > 0 ? 'text-purple-700' : 'text-muted-foreground'}`}>
                    {fmtEur(g.balance)} <span className="font-normal text-[10px] text-muted-foreground">в кассе</span>
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Внесено: <span className="font-semibold text-emerald-700">{fmtEur(g.deposited)}</span></span>
                  <span>Погашено: <span className="font-semibold text-red-600">{fmtEur(g.withdrawn)}</span></span>
                </div>
                <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/60">
                  {g.entries.map(e => {
                    const info = describeEntry(e)
                    const isDeposit = e.type === 'deposit'
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground truncate">
                          {info.title} · {format(parseISO(e.created_at.slice(0, 10)), 'd MMM yyyy', { locale: ru })}
                        </span>
                        <span className={`font-semibold flex-shrink-0 ${isDeposit ? 'text-emerald-700' : 'text-red-600'}`}>
                          {isDeposit ? '+' : '−'}{fmtEur(e.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CleanerDashboard({ previewAsAdmin, onExitPreview }: { previewAsAdmin?: boolean; onExitPreview?: () => void } = {}) {
  const { user, signOut } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'today' | 'bookings' | 'clients' | 'payment' | 'calendar' | 'archive' | 'profile'>('bookings')
  // Какие карточки клиентов сейчас развёрнуты — открытие карточки считается тем самым
  // "зашла и посмотрела", поэтому одновременно снимает у её новых броней флаг "непросмотрено".
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [aptFilter, setAptFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  // Модалка-детализация для кликабельных карточек-счётчиков во вкладке "Заезды"
  // ("Сейчас заселено" / "Дней до заезда" / "Ближайший выезд").
  const [statModal, setStatModal] = useState<{ title: string; subtitle?: string; items: TaskRow[] } | null>(null)
  // Храним только id, а не снимок объекта — иначе после смены статуса оплаты изнутри этого
  // окна (открыть бронь → оплатить → закрыть) счётчики в самом окне баланса останутся
  // старыми, пока окно не закроют и не откроют заново.
  const [clientBalanceModalId, setClientBalanceModalId] = useState<string | null>(null)
  const [showCashBreakdown, setShowCashBreakdown] = useState(false)
  // Смена пароля — supabase.auth.updateUser не требует ввода старого пароля, достаточно
  // активной сессии (тот же вызов, что уже используется в Auth.tsx для восстановления пароля).
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')
  const changePassword = async () => {
    setPwError('')
    if (newPassword.length < 6) { setPwError('Пароль должен быть не короче 6 символов'); return }
    if (newPassword !== confirmPassword) { setPwError('Пароли не совпадают'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) { setPwError(error.message); return }
    setNewPassword('')
    setConfirmPassword('')
    setPwSaved(true)
    setTimeout(() => setPwSaved(false), 2500)
  }
  const [showCashForm, setShowCashForm] = useState(false)
  const [cashDirection, setCashDirection] = useState<'deposit' | 'withdrawal'>('deposit')
  const [cashAmount, setCashAmount] = useState('')
  const [cashNote, setCashNote] = useState('')
  const [seenTaskIds, setSeenTaskIds] = useState<Set<string>>(new Set())
  // Свёрнутые секции (Не оплачено / Оплачено на вкладке "Оплата", секции по квартирам в
  // "Архиве") — ключ произвольный, просто наличие в сете значит "свёрнуто".
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const toggleSection = (key: string) => setCollapsedSections(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // Full apartment rows for the calendar tab (same component/visualization as the owner's calendar)
  const { data: calApartments = [] } = useQuery({
    queryKey: ['cleaner-apartments', user?.id, previewAsAdmin],
    queryFn: async () => {
      // Админ в режиме предпросмотра видит объекты всех клинеров/хозяев (как в п.5
      // спецификации — "администратор видит полностью кабинет уборщицы"), обычная
      // уборщица — только те, к которым назначена.
      let q = supabase.from('apartments').select('*, apartment_images(*)')
      if (!previewAsAdmin) q = q.eq('cleaner_id', user!.id)
      const { data, error } = await q.order('title')
      if (error) throw error
      return data as Apartment[]
    },
    enabled: !!user,
  })

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['cleaner-tasks', user?.id, previewAsAdmin],
    queryFn: async () => {
      let q = supabase
        .from('cleaning_tasks')
        .select(
          '*, bookings(id, start_date, end_date, guest_name, guest_phone, guests_count, guest_rating, share_contact_with_cleaner, source, total_amount, apartments(id, title, address, owner_id))',
        )
      if (!previewAsAdmin) q = q.eq('cleaner_id', user!.id)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return data as TaskRow[]
    },
    enabled: !!user,
  })

  // Уборщица может быть назначена на квартиры разных хозяев (мы это уже поддерживаем —
  // задачи выбираются по cleaner_id, без привязки к одному владельцу) — подтягиваем имена
  // хозяев отдельным запросом, чтобы показать "чей объект" на карточках.
  const ownerIds = useMemo(() => {
    const set = new Set<string>()
    ;(tasks ?? []).forEach(t => { if (t.bookings?.apartments?.owner_id) set.add(t.bookings.apartments.owner_id) })
    return [...set]
  }, [tasks])

  const { data: ownerProfiles = [] } = useQuery({
    queryKey: ['cleaner-owner-profiles', ownerIds],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name, email').in('id', ownerIds)
      if (error) throw error
      return data as { id: string; name: string | null; email: string | null }[]
    },
    enabled: ownerIds.length > 0,
  })
  const ownerName = useMemo(() => {
    const m = new Map<string, string>()
    ownerProfiles.forEach(p => m.set(p.id, p.name || p.email || 'Клиент'))
    return (id: string) => m.get(id) ?? ''
  }, [ownerProfiles])

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

  // Разбивка кассы по хозяевам — общий баланс кассы это сумма чужих денег, и клинеру
  // важно видеть по каждому хозяину отдельно: сколько внёс наличными и сколько из этого
  // уже списано ("погашено") за уборки, а не только один общий итог.
  const cashByOwner: CashOwnerGroup[] = useMemo(() => {
    const map = new Map<string, CashEntry[]>()
    ;(ledger ?? []).forEach(e => {
      if (!map.has(e.owner_id)) map.set(e.owner_id, [])
      map.get(e.owner_id)!.push(e)
    })
    return [...map.entries()].map(([ownerId, entries]) => {
      const deposited = entries.filter(e => e.type === 'deposit').reduce((s, e) => s + e.amount, 0)
      const withdrawn = entries.filter(e => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0)
      return {
        ownerId, name: ownerName(ownerId) || 'Клиент', deposited, withdrawn, balance: deposited - withdrawn,
        entries: [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }
    }).sort((a, b) => b.balance - a.balance)
  }, [ledger, ownerName])

  const today = new Date().toISOString().slice(0, 10)
  const all = tasks ?? []

  // ── "Новая бронь" — красный индикатор ────────────────────────────────────────
  // Отмечаем, какие брони уборщица уже видела (per-браузер, localStorage). При первом
  // запуске (ключа ещё нет) считаем весь текущий список уже "виденным" — иначе при
  // первом открытии всё сразу помечается как "новое".
  useEffect(() => {
    if (!user || !tasks) return
    const key = `cleaner-seen-bookings-${user.id}`
    const raw = localStorage.getItem(key)
    if (raw === null) {
      const ids = tasks.map(t => t.id)
      try { localStorage.setItem(key, JSON.stringify(ids)) } catch { /* ignore */ }
      setSeenTaskIds(new Set(ids))
    } else {
      try { setSeenTaskIds(new Set(JSON.parse(raw))) } catch { setSeenTaskIds(new Set()) }
    }
  }, [user?.id, tasks])

  const markTasksSeen = (ids: string[]) => {
    if (!user) return
    setSeenTaskIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      try { localStorage.setItem(`cleaner-seen-bookings-${user.id}`, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  // `all` уже отсортирован по created_at убывающе (см. запрос выше) — значит и здесь первым будет самый новый
  const newTasks = all.filter(t => !seenTaskIds.has(t.id))

  const currentStays = all.filter(t => t.bookings.start_date <= today && t.bookings.end_date > today)
  const upcoming = all.filter(t => t.bookings.start_date > today && t.status !== 'done' && t.payment_status !== 'paid')
    .sort((a, b) => a.bookings.start_date.localeCompare(b.bookings.start_date))
  const overdue = all.filter(t => t.bookings.end_date <= today && t.status !== 'done' && t.payment_status !== 'paid')
    .sort((a, b) => a.bookings.end_date.localeCompare(b.bookings.end_date))
  const archive = all.filter(t => t.status === 'done' || t.payment_status === 'paid')
    .sort((a, b) => b.bookings.end_date.localeCompare(a.bookings.end_date))

  // Вкладка "Уборка" — все выезды, которые ещё не убраны, вплоть до сегодняшнего дня включительно
  // (не только ровно "сегодня" — иначе просроченный, но не отмеченный уборкой выезд молча
  // пропадал бы из списка на следующий день). Сортировка — сначала самые давние/срочные.
  const pendingCleaning = all.filter(t => t.bookings.end_date <= today && t.status !== 'done')
    .sort((a, b) => a.bookings.end_date.localeCompare(b.bookings.end_date))

  const getPaidAmt = (t: TaskRow) => t.payment_status === 'paid' ? t.cleaning_fee : 0
  const totalOwed = all.reduce((s, t) => s + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0)
  const totalPaid = all.reduce((s, t) => s + getPaidAmt(t), 0)
  const totalEarned = totalOwed + totalPaid
  const pct = totalEarned > 0 ? Math.round((totalPaid / totalEarned) * 100) : 0

  // "Ожидает оплаты" должно отражать только то, что хозяин реально должен перевести прямо
  // сейчас — то есть гость уже выехал И уборка отмечена сделанной. Пока бронь ещё не
  // случилась (или случилась, но уборки ещё не было), это будущая, а не текущая
  // задолженность — и не должно попадать в общую сумму "к оплате".
  const isDueNow = (t: TaskRow) => t.bookings.end_date <= today && t.status === 'done'
  const dueOwed = all.filter(isDueNow).reduce((s, t) => s + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0)
  const futureOwed = Math.max(0, totalOwed - dueOwed)

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

  // ── Вкладка "Клиенты" — один клинер обслуживает объекты нескольких хозяев (друзей),
  // поэтому вместо одного общего списка заездов удобнее видеть, у кого из хозяев прямо
  // сейчас что-то требует внимания: нужна уборка или появилась новая (ещё не просмотренная)
  // бронь. У имени хозяина загорается "!", пока это не разберут (открытие карточки клиента
  // снимает "новое", как и открытие общего баннера "Новая бронь").
  type ClientSummary = {
    ownerId: string; name: string
    pendingCleaning: TaskRow[]; newTasks: TaskRow[]; nearestUpcoming: TaskRow | null
    hasAlert: boolean
    owed: number; paid: number; future: number; unpaidCount: number
  }
  const clients: ClientSummary[] = useMemo(() => {
    return ownerIds.map(ownerId => {
      const theirPendingCleaning = pendingCleaning.filter(t => t.bookings.apartments.owner_id === ownerId)
      const theirNewTasks = newTasks.filter(t => t.bookings.apartments.owner_id === ownerId)
      const theirUpcoming = upcoming.filter(t => t.bookings.apartments.owner_id === ownerId)
      // Долг/оплата — так же, как считается на вкладке "Оплата": в "должен" попадают только
      // уже реально ожидающие перевода уборки (гость выехал и уборка отмечена сделанной),
      // а не всё, что ещё впереди — это отдельно показываем как "future".
      const theirTasks = all.filter(t => t.bookings.apartments.owner_id === ownerId)
      const dueTasks = theirTasks.filter(isDueNow)
      const dueUnpaid = dueTasks.filter(t => t.payment_status !== 'paid')
      const owed = dueUnpaid.reduce((s, t) => s + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0)
      const paid = theirTasks.reduce((s, t) => s + getPaidAmt(t), 0)
      const futureUnpaid = theirTasks.filter(t => !isDueNow(t) && t.payment_status !== 'paid')
      const future = futureUnpaid.reduce((s, t) => s + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0)
      return {
        ownerId, name: ownerName(ownerId) || 'Клиент',
        pendingCleaning: theirPendingCleaning, newTasks: theirNewTasks,
        nearestUpcoming: theirUpcoming[0] ?? null,
        hasAlert: theirPendingCleaning.length > 0 || theirNewTasks.length > 0,
        owed, paid, future, unpaidCount: dueUnpaid.length,
      }
    })
  }, [ownerIds, pendingCleaning, newTasks, upcoming, ownerName, all])
  const clientsWithAlert = clients.filter(c => c.hasAlert).length

  // Список клиентов всегда отсортирован по сумме долга — кто должен больше, тот выше
  // (чтобы уборщица сразу видела, с кого в первую очередь спрашивать оплату).
  const sortedClients = useMemo(() =>
    [...clients].sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, 'ru')),
  [clients])

  const toggleClient = (ownerId: string) => {
    const opening = expandedClientId !== ownerId
    setExpandedClientId(opening ? ownerId : null)
    if (opening) {
      const client = clients.find(c => c.ownerId === ownerId)
      if (client && client.newTasks.length > 0) markTasksSeen(client.newTasks.map(t => t.id))
    }
  }

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

  // Apartment photo lookup for the "actual/nearest check-in" summary card
  const calAptImage = (aptId: string) => calApartments.find(a => a.id === aptId)?.apartment_images?.[0]?.image_url ?? null

  const NAV = [
    { id: 'today' as const, label: 'Уборка', icon: <Brush size={16} />, count: pendingCleaning.length },
    { id: 'bookings' as const, label: 'Заезды', icon: <CalendarDays size={16} />, count: currentStays.length + upcoming.length + overdue.length },
    { id: 'clients' as const, label: 'Клиенты', icon: <Users size={16} />, count: clientsWithAlert },
    { id: 'payment' as const, label: 'Оплата', icon: <Banknote size={16} /> },
    { id: 'calendar' as const, label: 'Календарь', icon: <CalendarDays size={16} /> },
    { id: 'archive' as const, label: 'Архив', icon: <FileText size={16} />, count: archive.length },
  ]

  const MOBILE_NAV = [
    { id: 'today' as const, label: 'Уборка', icon: <Brush size={19} /> },
    { id: 'bookings' as const, label: 'Заезды', icon: <ClipboardList size={19} /> },
    { id: 'clients' as const, label: 'Клиенты', icon: <Users size={19} /> },
    { id: 'payment' as const, label: 'Оплата', icon: <Wallet size={19} /> },
    { id: 'calendar' as const, label: 'Календарь', icon: <CalendarDays size={19} /> },
    { id: 'archive' as const, label: 'Архив', icon: <Archive size={19} /> },
    { id: 'profile' as const, label: 'Профиль', icon: <User size={19} /> },
  ]

  if (!user) return null

  const byApartment = (t: TaskRow) => aptFilter === 'all' || t.bookings.apartments.id === aptFilter
  const paidList = all.filter(t => t.payment_status === 'paid' && byApartment(t))
    .sort((a, b) => a.bookings.end_date.localeCompare(b.bookings.end_date))
  const unpaidList = all.filter(t => t.payment_status !== 'paid' && byApartment(t))
    .sort((a, b) => a.bookings.end_date.localeCompare(b.bookings.end_date))
  const doneCount = all.filter(t => t.status === 'done').length

  // Группировка по хозяину для вкладки "Оплата" — уборщица может обслуживать объекты
  // нескольких хозяев (друзей), и ей важно видеть отдельно по каждому: сколько он уже
  // заплатил и сколько ещё должен, а не общий список без привязки к хозяину.
  const groupByOwner = (list: TaskRow[]) => {
    const map = new Map<string, TaskRow[]>()
    list.forEach(t => {
      const oid = t.bookings.apartments.owner_id
      if (!map.has(oid)) map.set(oid, [])
      map.get(oid)!.push(t)
    })
    return [...map.entries()]
      .map(([ownerId, items]) => ({ ownerId, name: ownerName(ownerId) || 'Клиент', items }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }
  const unpaidByOwner = groupByOwner(unpaidList)
  const paidByOwner = groupByOwner(paidList)
  // Баланс по хозяевам всегда считаем по ВСЕМ объектам хозяина, а не только по объекту,
  // выбранному в фильтре "Квартира" — иначе при переключении фильтра долг хозяина за
  // другие его квартиры пропадал бы из виду (он никуда не делся, просто скрыт фильтром
  // списка карточек ниже). Фильтр квартиры должен влиять только на список карточек.
  const ownerBalances = ownerIds.map(ownerId => {
    const theirTasks = all.filter(t => t.bookings.apartments.owner_id === ownerId)
    const dueTasks = theirTasks.filter(isDueNow)
    const dueUnpaidTasks = dueTasks.filter(t => t.payment_status !== 'paid')
    const owed = dueUnpaidTasks.reduce((s, t) => s + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0)
    const paid = theirTasks.reduce((s, t) => s + getPaidAmt(t), 0)
    const futureUnpaid = theirTasks.filter(t => !isDueNow(t) && t.payment_status !== 'paid')
    const future = futureUnpaid.reduce((s, t) => s + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0)
    const paidTasks = theirTasks.filter(t => t.payment_status === 'paid')
    return {
      ownerId, name: ownerName(ownerId) || 'Клиент', owed, paid, future,
      unpaidCount: dueUnpaidTasks.length,
      paidCount: paidTasks.length,
      dueUnpaidTasks, paidTasks, futureUnpaidTasks: futureUnpaid,
    }
  }).sort((a, b) => b.owed - a.owed)
  const multiOwner = ownerIds.length > 1
  const pluralUborka = (n: number) => n === 1 ? 'уборка' : n < 5 ? 'уборки' : 'уборок'
  const dueUnpaidCount = all.filter(t => isDueNow(t) && t.payment_status !== 'paid').length

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
          {previewAsAdmin && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">👁 Просмотр</span>
          )}
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`sidebar-nav-item flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative whitespace-nowrap ${tab === item.id ? 'active' : ''}`}>
              {item.icon}
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
                  item.id === 'today'
                    ? 'bg-amber-500 text-white'
                    : item.id === 'clients'
                      ? 'bg-red-500 text-white'
                      : tab === item.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted-foreground/15 text-muted-foreground'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        {cashBalance > 0 && (
          <button type="button" onClick={() => setShowCashBreakdown(true)}
            className="mt-3 mx-1 p-3 rounded-xl bg-purple-50 border border-purple-100 text-left hover:border-purple-300 transition-colors">
            <p className="text-[10px] text-purple-700 font-semibold mb-0.5 flex items-center gap-1"><Wallet size={11} /> Касса (наличные)</p>
            <p className="text-lg font-bold text-purple-800">{fmtEur(cashBalance)}</p>
          </button>
        )}
        {dueOwed > 0 ? (
          <div className="mt-3 mx-1 p-3 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[10px] text-red-600 font-semibold mb-0.5">Ожидает оплаты</p>
            <p className="text-lg font-bold text-red-700">{fmtEur(dueOwed)}</p>
            {futureOwed > 0 && <p className="text-[10px] text-red-600/60 mt-0.5">+{fmtEur(futureOwed)} за предстоящие</p>}
          </div>
        ) : totalEarned > 0 ? (
          <div className="mt-3 mx-1 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] text-emerald-700 font-semibold">✓ Всё выплачено</p>
            <p className="text-lg font-bold text-emerald-700">{fmtEur(totalPaid)}</p>
            {futureOwed > 0 && <p className="text-[10px] text-emerald-700/60 mt-0.5">+{fmtEur(futureOwed)} за предстоящие</p>}
          </div>
        ) : null}
        <button onClick={() => previewAsAdmin ? onExitPreview?.() : signOut()}
          className="mt-auto mx-1 flex items-center gap-2 px-2 py-2 rounded-xl text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <LogOut size={13} /> {previewAsAdmin ? 'Вернуться в админку' : 'Выйти'}
        </button>
        <p className="mx-1 mt-1 text-[10px] text-muted-foreground/50">v{APP_VERSION}</p>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className={`px-3 py-4 md:px-8 md:py-8 pb-20 md:pb-8 flex-1 ${tab === 'calendar' ? 'max-w-4xl' : 'max-w-3xl'} w-full`}>
          <div className="mb-4 md:mb-6">
            {previewAsAdmin && (
              <div className="flex items-center gap-2 mb-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-xl px-3 py-2">
                👁 Просмотр от лица клинера — видны объекты всех уборщиц/хозяев, изменения недоступны
                {onExitPreview && (
                  <button onClick={onExitPreview} className="ml-auto underline hover:no-underline flex-shrink-0">Вернуться</button>
                )}
              </div>
            )}
            <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
              {tab === 'today' ? 'Ожидание уборки' : tab === 'bookings' ? 'Заезды' : tab === 'clients' ? 'Клиенты' : tab === 'payment' ? 'Оплата' : tab === 'calendar' ? 'Календарь' : tab === 'profile' ? 'Профиль' : 'Архив заездов'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === 'today' ? (pendingCleaning.length > 0 ? `${pendingCleaning.length} ${pendingCleaning.length === 1 ? 'заезд ждёт' : 'заездов ждут'} уборки` : 'Уборка не требуется') :
               tab === 'bookings' ? `${currentStays.length} сейчас · ${upcoming.length + overdue.length} предстоящих` :
               tab === 'clients' ? (clientsWithAlert > 0 ? `Требуют внимания: ${clientsWithAlert}` : `${clients.length} ${clients.length === 1 ? 'клиент' : 'клиентов'} · всё спокойно`) :
               tab === 'payment' ? `Заработано ${fmtEur(totalEarned)} · получено ${fmtEur(totalPaid)}` :
               tab === 'calendar' ? 'Все заезды по всем квартирам' :
               tab === 'profile' ? (user?.email ?? '') :
               `${archive.length} завершённых заездов`}
            </p>
          </div>

          {newTasks.length > 0 && (
            <button
              onClick={() => { setSelectedTask(newTasks[0]); markTasksSeen(newTasks.map(t => t.id)) }}
              className="w-full flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-4 md:mb-6 text-left hover:bg-red-100 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
              <span className="text-sm font-semibold flex-1 min-w-0">
                {newTasks.length === 1
                  ? <>Новая бронь — {newTasks[0].bookings.apartments.title}{newTasks[0].bookings.guest_name ? `, ${newTasks[0].bookings.guest_name}` : ''}</>
                  : <>Новых броней: {newTasks.length}</>}
              </span>
              <ChevronRight size={16} className="flex-shrink-0" />
            </button>
          )}

          {isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl animate-pulse bg-muted" />)}
            </div>
          ) : tab === 'today' ? (
            pendingCleaning.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-10 text-center">
                <p className="text-3xl mb-2">✨</p>
                <p className="text-sm text-muted-foreground">Уборка не требуется ни в одном объекте</p>
              </div>
            ) : (
              <div className={`grid grid-cols-1 gap-4 ${apartments.length > 1 ? 'md:grid-cols-2' : ''}`}>
                {apartments.map(apt => {
                  const aptTasks = pendingCleaning.filter(t => t.bookings.apartments.id === apt.id)
                  return (
                    <div key={apt.id} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-1 pb-1">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: aptColor(apt.id) }} />
                        <h3 className="text-sm font-bold text-foreground">{apt.title}</h3>
                        {aptTasks.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{aptTasks.length}</span>
                        )}
                      </div>
                      {aptTasks.length === 0 ? (
                        <div className="bg-card border border-border rounded-2xl p-6 text-center">
                          <p className="text-sm text-muted-foreground">Уборка не требуется</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {aptTasks.map(t => (
                            <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor}
                              ownerLabel={ownerName(t.bookings.apartments.owner_id)} highlightCheckoutToday compact />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : tab === 'bookings' ? (() => {
            const byOwner = (t: TaskRow) => ownerFilter === 'all' || t.bookings.apartments.owner_id === ownerFilter
            const curF = currentStays.filter(byApartment).filter(byOwner)
            const overF = overdue.filter(byApartment).filter(byOwner)
            const upF = upcoming.filter(byApartment).filter(byOwner)
            const daysToNextF = upF.length > 0
              ? Math.max(0, Math.round((parseISO(upF[0].bookings.start_date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))
              : null
            // Клик по карточке "ближайший заезд" должен показывать только сам ближайший день
            // плюс следующий за ним — а не вообще все предстоящие заезды на месяцы вперёд.
            // Как только ближайшая дата проходит, эта же логика на следующий день сама
            // сдвигается на новую ближайшую дату (upF уже отфильтрован/отсортирован по "сегодня").
            const nearestCheckinDate = upF[0]?.bookings.start_date ?? null
            const upFNear = nearestCheckinDate
              ? upF.filter(t => t.bookings.start_date === nearestCheckinDate || t.bookings.start_date === isoAddDays(nearestCheckinDate, 1))
              : []
            // Ближайший выезд — учитываем и тех, кто заселён прямо сейчас (выезд ещё впереди),
            // и тех, у кого выезд ровно сегодня (они уже попадают в overF, т.к. end_date === today
            // не проходит условие curF "end_date > today" — без этого объединения выезды "сегодня"
            // молча пропадали из этой карточки, хотя фактически они есть и видны в "Нужна уборка сейчас").
            const checkoutCandidates = [...curF, ...overF.filter(t => t.bookings.end_date === today)]
              .sort((a, b) => a.bookings.end_date.localeCompare(b.bookings.end_date))
            const nearestCheckoutDate = checkoutCandidates[0]?.bookings.end_date ?? null
            const checkoutsOnNearestDay = nearestCheckoutDate
              ? checkoutCandidates.filter(t => t.bookings.end_date === nearestCheckoutDate)
              : []
            const daysToCheckoutF = nearestCheckoutDate
              ? Math.max(0, Math.round((parseISO(nearestCheckoutDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))
              : null
            return (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4 flex-wrap">
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
                {multiOwner && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Клиент:</span>
                    <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
                      className="text-xs rounded-xl border border-border bg-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="all">Все клиенты</option>
                      {ownerIds.map(id => <option key={id} value={id}>{ownerName(id) || 'Клиент'}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
                  <p className="text-2xl font-bold text-primary">{curF.length + upF.length + overF.length}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">заездов впереди</p>
                </div>
                <button type="button" disabled={curF.length === 0}
                  onClick={() => setStatModal({ title: 'Сейчас заселены', items: curF })}
                  className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center disabled:cursor-default enabled:hover:border-primary/40 enabled:hover:shadow-md transition-all">
                  <p className="text-2xl font-bold text-foreground">{curF.length}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">сейчас заселено</p>
                </button>
                <button type="button" disabled={daysToNextF === null}
                  onClick={() => setStatModal({ title: upFNear.length === 1 ? 'Ближайший заезд' : 'Ближайшие заезды', items: upFNear })}
                  className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center disabled:cursor-default enabled:hover:border-primary/40 enabled:hover:shadow-md transition-all">
                  {daysToNextF !== null ? (
                    <><p className="text-2xl font-bold text-foreground">{upFNear.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{upFNear.length === 1 ? 'Ближайший заезд' : 'Ближайшие заезды'}</p></>
                  ) : (
                    <><p className="text-2xl font-bold text-muted-foreground">—</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">нет заездов</p></>
                  )}
                </button>
                <button type="button" disabled={daysToCheckoutF === null}
                  onClick={() => setStatModal({ title: checkoutsOnNearestDay.length === 1 ? 'Ближайший выезд' : 'Ближайшие выезды', items: checkoutsOnNearestDay })}
                  className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center disabled:cursor-default enabled:hover:border-primary/40 enabled:hover:shadow-md transition-all">
                  {daysToCheckoutF !== null ? (
                    <><p className="text-2xl font-bold text-foreground">{checkoutsOnNearestDay.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{daysToCheckoutF === 0 ? 'выезд сегодня' : `${daysUntilLabel(daysToCheckoutF)} до выезда`}</p></>
                  ) : (
                    <><p className="text-2xl font-bold text-muted-foreground">—</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">нет выездов</p></>
                  )}
                </button>
              </div>

              {curF.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">Сейчас заселены</h3>
                  <div className="flex flex-col gap-2">{curF.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} ownerLabel={ownerName(t.bookings.apartments.owner_id)} highlightCheckoutToday />)}</div>
                </div>
              )}
              {overF.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-destructive uppercase tracking-widest mb-3">Нужна уборка сейчас — {overF.length}</h3>
                  <div className="flex flex-col gap-2">{overF.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} ownerLabel={ownerName(t.bookings.apartments.owner_id)} highlightCheckoutToday />)}</div>
                </div>
              )}
              {upF.length > 0 && (
                <div>
                  <button onClick={() => toggleSection('bookings-upcoming')}
                    className="w-full flex items-center gap-1.5 mb-3 text-left">
                    <ChevronRight size={13} className={`text-muted-foreground transition-transform ${collapsedSections.has('bookings-upcoming') ? '' : 'rotate-90'}`} />
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label">Предстоящие — {upF.length}</h3>
                  </button>
                  {!collapsedSections.has('bookings-upcoming') && (
                    <div className="flex flex-col gap-2">{upF.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} ownerLabel={ownerName(t.bookings.apartments.owner_id)} highlightCheckoutToday />)}</div>
                  )}
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
          })() : tab === 'clients' ? (
            clients.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-10 text-center">
                <p className="text-3xl mb-2">👥</p>
                <p className="text-sm text-muted-foreground">Пока нет клиентов</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sortedClients.map(c => {
                  const isOpen = expandedClientId === c.ownerId
                  return (
                    <div key={c.ownerId} className={`bg-card rounded-2xl shadow-sm transition-all ${c.hasAlert ? 'border-2 border-red-300' : 'border border-border'}`}>
                      <button onClick={() => toggleClient(c.ownerId)}
                        className="w-full flex items-center gap-3 px-5 py-4 text-left">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-sm">
                          {c.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold text-foreground truncate">{c.name}</p>
                            {c.hasAlert && (
                              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 animate-pulse">!</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.pendingCleaning.length > 0 && `🧹 Нужна уборка: ${c.pendingCleaning.length}`}
                            {c.pendingCleaning.length > 0 && c.newTasks.length > 0 && ' · '}
                            {c.newTasks.length > 0 && `🆕 Новых броней: ${c.newTasks.length}`}
                            {c.pendingCleaning.length === 0 && c.newTasks.length === 0 && (
                              c.nearestUpcoming
                                ? `Ближайший заезд — ${format(parseISO(c.nearestUpcoming.bookings.start_date), 'd MMM', { locale: ru })}, ${c.nearestUpcoming.bookings.apartments.title}`
                                : 'Нет предстоящих заездов'
                            )}
                          </p>
                        </div>
                        {/* Должен / оплачено — видно сразу, без разворачивания карточки */}
                        <div className="flex-shrink-0 text-right">
                          {c.owed > 0
                            ? <p className="text-sm font-bold text-red-600 whitespace-nowrap">−{fmtEur(c.owed)}</p>
                            : <p className="text-sm font-bold text-emerald-600 whitespace-nowrap">✓ 0,00 €</p>}
                          {c.paid > 0 && <p className="text-[10px] text-muted-foreground whitespace-nowrap">оплачено {fmtEur(c.paid)}</p>}
                        </div>
                        <ChevronRight size={16} className={`text-muted-foreground/40 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 flex flex-col gap-2 border-t border-border pt-3">
                          {c.pendingCleaning.length === 0 && c.newTasks.length === 0 && !c.nearestUpcoming && (
                            <p className="text-sm text-muted-foreground px-1">Сейчас ничего не требует внимания.</p>
                          )}
                          {c.pendingCleaning.length > 0 && (
                            <>
                              <p className="text-[11px] font-bold text-destructive uppercase tracking-widest px-1">Нужна уборка</p>
                              {c.pendingCleaning.map(t => (
                                <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} compact />
                              ))}
                            </>
                          )}
                          {c.newTasks.length > 0 && (
                            <>
                              <p className="text-[11px] font-bold text-foreground uppercase tracking-widest px-1 mt-1">Новые брони</p>
                              {c.newTasks.map(t => (
                                <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} compact />
                              ))}
                            </>
                          )}
                          {c.pendingCleaning.length === 0 && c.newTasks.length === 0 && c.nearestUpcoming && (
                            <TaskCard task={c.nearestUpcoming} onSelect={() => setSelectedTask(c.nearestUpcoming!)} aptColor={aptColor} compact />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : tab === 'calendar' ? (
            <div className="flex flex-col gap-4">
              <CleanerCalendar tasks={all} aptColor={aptColor} />

              {currentStays.length > 0 ? (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">
                    {currentStays.length === 1 ? 'Актуальный заезд' : 'Актуальные заезды'}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {currentStays.map(t => {
                      const b = t.bookings
                      const img = calAptImage(b.apartments.id)
                      const nights = Math.max(1, Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000))
                      const passed = Math.max(0, Math.round((new Date().getTime() - parseISO(b.start_date).getTime()) / 86400000))
                      const pct = nights > 0 ? Math.min(100, Math.round((passed / nights) * 100)) : 0
                      const left = Math.max(0, nights - passed)
                      return (
                        <div key={t.id} className="bg-card border border-border rounded-2xl shadow-sm flex gap-4 p-4">
                          <div className="w-24 rounded-xl overflow-hidden flex-shrink-0 bg-secondary self-stretch">
                            {img
                              ? <img src={img} alt={b.apartments.title} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-2xl opacity-20">🏠</div>}
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-foreground">{b.apartments.title}</p>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Сейчас заселена</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{b.guest_name}</p>
                            <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                              <div className="absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${pct}%`, background: 'hsl(var(--primary) / 0.85)' }} />
                              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">{pct}%</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}</span>
                              <span>{left} {left === 1 ? 'ночь' : left < 5 ? 'ночи' : 'ночей'} осталось</span>
                            </div>
                            <div className="flex gap-4 text-[10px] text-muted-foreground">
                              <span>📅 Заезд: {format(parseISO(b.start_date), 'd MMM. yyyy', { locale: ru })}</span>
                              <span>📅 Выезд: {format(parseISO(b.end_date), 'd MMM. yyyy', { locale: ru })}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : upcoming.length > 0 ? (() => {
                // Ближайший предстоящий заезд — отдельно по каждому объекту, а не только
                // самый ближайший среди всех: иначе при 2+ квартирах здесь всегда
                // показывалась только одна из них.
                const nextByApt = apartments
                  .map(apt => upcoming.find(t => t.bookings.apartments.id === apt.id))
                  .filter((t): t is TaskRow => !!t)
                return (
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">
                      {nextByApt.length === 1 ? 'Ближайший заезд' : 'Ближайшие заезды'}
                    </h3>
                    <div className="flex flex-col gap-3">
                      {nextByApt.map(t => {
                        const b = t.bookings
                        const img = calAptImage(b.apartments.id)
                        const daysUntil = Math.max(0, Math.round((parseISO(b.start_date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))
                        return (
                          <div key={t.id} className="bg-card border border-border rounded-2xl shadow-sm flex gap-4 p-4">
                            <div className="w-24 rounded-xl overflow-hidden flex-shrink-0 bg-secondary self-stretch">
                              {img
                                ? <img src={img} alt={b.apartments.title} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-2xl opacity-20">🏠</div>}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-foreground">{b.apartments.title}</p>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                                  {daysUntil === 0 ? 'Заезд сегодня' : `Через ${daysUntil} ${pluralDaysWord(daysUntil)}`}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">{b.guest_name}</p>
                              <div className="flex gap-4 text-[10px] text-muted-foreground">
                                <span>📅 Заезд: {format(parseISO(b.start_date), 'd MMM. yyyy', { locale: ru })}</span>
                                <span>📅 Выезд: {format(parseISO(b.end_date), 'd MMM. yyyy', { locale: ru })}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })() : (
                <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-sm">
                  Нет предстоящих заездов
                </div>
              )}
            </div>
          ) : tab === 'payment' ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center">
                  <p className="text-xs text-muted-foreground mb-2">Уборок выполнено</p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground whitespace-nowrap">{doneCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fmtEur(totalEarned)} за все заезды</p>
                </div>
                <div className={`bg-card border rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center ${dueOwed > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
                  <p className="text-xs text-muted-foreground mb-2">Ожидает оплаты</p>
                  <p className={`text-xl sm:text-2xl font-bold whitespace-nowrap ${dueOwed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {dueUnpaidCount > 0 ? `${dueUnpaidCount} ${pluralUborka(dueUnpaidCount)}` : '0 уборок'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{dueOwed > 0 ? fmtEur(dueOwed) : ''}</p>
                </div>
                <div className="bg-card border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center">
                  <p className="text-xs text-muted-foreground mb-2">Получено</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 whitespace-nowrap">{fmtEur(totalPaid)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{paidList.length} оплачено</p>
                </div>
                <div onClick={() => setShowCashBreakdown(true)}
                  className="bg-card border border-purple-200 rounded-2xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center cursor-pointer hover:border-purple-400 hover:shadow-md transition-all">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Wallet size={12} /> Касса (наличные)</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-700 whitespace-nowrap">{fmtEur(cashBalance)}</p>
                  {!previewAsAdmin && (
                    <button onClick={e => { e.stopPropagation(); setShowCashForm(p => !p) }}
                      className="text-[11px] text-primary font-semibold hover:underline mt-1">
                      Изменить кассу
                    </button>
                  )}
                </div>
              </div>

              {showCashForm && !previewAsAdmin && (
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

              {multiOwner && ownerBalances.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label mb-3">Баланс по клиентам</h3>
                  <div className="flex flex-col gap-2">
                    {ownerBalances.map(ob => (
                      <button key={ob.ownerId} onClick={() => setClientBalanceModalId(ob.ownerId)}
                        className={`bg-card border rounded-2xl px-4 py-3 flex items-center gap-3 text-left w-full transition-colors hover:bg-muted/50 ${ob.owed > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-xs">
                          {ob.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{ob.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ob.unpaidCount > 0 ? `${ob.unpaidCount} ${pluralUborka(ob.unpaidCount)} не оплачено` : 'всё оплачено'}
                            {ob.paidCount > 0 ? ` · ${ob.paidCount} оплачено` : ''}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {ob.owed > 0
                            ? <p className="text-sm font-bold text-red-600 whitespace-nowrap">−{fmtEur(ob.owed)}</p>
                            : <p className="text-sm font-bold text-emerald-600 whitespace-nowrap">✓ 0,00 €</p>}
                          {ob.paid > 0 && <p className="text-[10px] text-muted-foreground whitespace-nowrap">получено {fmtEur(ob.paid)}</p>}
                          {ob.future > 0 && <p className="text-[10px] text-muted-foreground/70 whitespace-nowrap">+{fmtEur(ob.future)} за предстоящие</p>}
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unpaidList.length > 0 && (
                <div>
                  <button onClick={() => toggleSection('unpaid')}
                    className="w-full flex items-center gap-1.5 mb-3 text-left">
                    <ChevronRight size={13} className={`text-muted-foreground transition-transform ${collapsedSections.has('unpaid') ? '' : 'rotate-90'}`} />
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label">Не оплачено — {unpaidList.length}</h3>
                  </button>
                  {!collapsedSections.has('unpaid') && (<>
                    {dueOwed > 0 && (
                      <div className="flex items-center gap-3 mb-2.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-100 border border-red-300 inline-block" /> входит в «Ожидает оплаты» ({fmtEur(dueOwed)})</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-muted border border-border inline-block" /> ещё предстоящее, не долг</span>
                      </div>
                    )}
                    {multiOwner ? (
                      <div className="flex flex-col gap-4">
                        {unpaidByOwner.map(group => {
                          const key = `unpaid-client-${group.ownerId}`
                          const open = !collapsedSections.has(key)
                          return (
                            <div key={group.ownerId}>
                              <button onClick={() => toggleSection(key)} className="flex items-center gap-1.5 mb-2 text-left">
                                <ChevronRight size={11} className={`text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{group.name} — {group.items.length}</p>
                              </button>
                              {open && (
                                <div className="flex flex-col gap-2">
                                  {group.items.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} highlightCheckoutToday showDueBadge />)}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">{unpaidList.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} highlightCheckoutToday showDueBadge />)}</div>
                    )}
                  </>)}
                </div>
              )}
              {paidList.length > 0 && (
                <div>
                  <button onClick={() => toggleSection('paid')}
                    className="w-full flex items-center gap-1.5 mb-3 text-left">
                    <ChevronRight size={13} className={`text-muted-foreground transition-transform ${collapsedSections.has('paid') ? '' : 'rotate-90'}`} />
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label">Оплачено — {paidList.length}</h3>
                  </button>
                  {!collapsedSections.has('paid') && (
                    multiOwner ? (
                      <div className="flex flex-col gap-4">
                        {paidByOwner.map(group => {
                          const key = `paid-client-${group.ownerId}`
                          const open = !collapsedSections.has(key)
                          return (
                            <div key={group.ownerId}>
                              <button onClick={() => toggleSection(key)} className="flex items-center gap-1.5 mb-2 text-left">
                                <ChevronRight size={11} className={`text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{group.name} — {group.items.length}</p>
                              </button>
                              {open && (
                                <div className="flex flex-col gap-2">
                                  {group.items.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} highlightCheckoutToday />)}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">{paidList.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} highlightCheckoutToday />)}</div>
                    )
                  )}
                </div>
              )}
              {unpaidList.length === 0 && paidList.length === 0 && (
                <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground text-sm">Нет данных об уборках</div>
              )}
            </div>
          ) : tab === 'archive' ? (
            <div className="flex flex-col gap-5">
              {archive.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground text-sm">Архив пуст</div>
              ) : (
                apartments.map(apt => {
                  const aptArchive = archive.filter(t => t.bookings.apartments.id === apt.id)
                  if (aptArchive.length === 0) return null
                  const key = `archive-${apt.id}`
                  return (
                    <div key={apt.id}>
                      <button onClick={() => toggleSection(key)}
                        className="w-full flex items-center gap-2 mb-3 text-left">
                        <ChevronRight size={13} className={`text-muted-foreground transition-transform flex-shrink-0 ${collapsedSections.has(key) ? '' : 'rotate-90'}`} />
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: aptColor(apt.id) }} />
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-widest font-label">{apt.title} — {aptArchive.length}</h3>
                      </button>
                      {!collapsedSections.has(key) && (
                        <div className="flex flex-col gap-2">{aptArchive.map(t => <TaskCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} aptColor={aptColor} ownerLabel={ownerName(t.bookings.apartments.owner_id)} highlightCheckoutToday />)}</div>
                      )}
                    </div>
                  )
                })
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
                <button type="button" onClick={() => setShowCashBreakdown(true)}
                  className="bg-card border border-purple-200 rounded-2xl p-4 shadow-sm text-center hover:border-purple-400 hover:shadow-md transition-all">
                  <p className="text-xl font-bold text-purple-700 flex items-center justify-center gap-1"><Wallet size={15} /> {fmtEur(cashBalance)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Касса (наличные)</p>
                </button>
              </div>

              {/* Временно скрыто по просьбе владельца — смена пароля у уборщицы. Форма и логика
                  остаются на месте, просто не рендерятся (false &&) — верните `!previewAsAdmin`,
                  когда решите снова показывать. */}
              {false && !previewAsAdmin && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <h3 className="font-semibold mb-1 text-sm">Смена пароля</h3>
                  <p className="text-xs text-muted-foreground mb-4">Новый пароль — минимум 6 символов</p>
                  <div className="flex flex-col gap-2.5">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setPwError(''); setPwSaved(false) }}
                      placeholder="Новый пароль"
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full"
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setPwError(''); setPwSaved(false) }}
                      onKeyDown={e => e.key === 'Enter' && changePassword()}
                      placeholder="Повторите пароль"
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full"
                    />
                    {pwError && <p className="text-xs text-destructive">{pwError}</p>}
                    <button
                      onClick={changePassword}
                      disabled={pwSaving || !newPassword || !confirmPassword}
                      className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {pwSaving ? 'Сохраняем…' : pwSaved ? '✓ Пароль изменён' : 'Сменить пароль'}
                    </button>
                  </div>
                </div>
              )}

              <button onClick={() => previewAsAdmin ? onExitPreview?.() : signOut()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                <LogOut size={16} /> {previewAsAdmin ? 'Вернуться в админку' : 'Выйти'}
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
              {item.id === 'payment' && dueOwed > 0 && (
                <span className="absolute top-0 right-4 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">€</span>
              )}
              {item.id === 'today' && pendingCleaning.length > 0 && (
                <span className="absolute top-0 right-4 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">{pendingCleaning.length}</span>
              )}
              {item.id === 'clients' && clientsWithAlert > 0 && (
                <span className="absolute top-0 right-4 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">!</span>
              )}
            </button>
          )
        })}
      </nav>

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal key={selectedTask.id} task={selectedTask} cashBalance={cashBalance}
            onClose={() => setSelectedTask(null)} onRefresh={invalidate} readOnly={previewAsAdmin} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {statModal && (
          <StatListModal title={statModal.title} subtitle={statModal.subtitle} items={statModal.items}
            aptColor={aptColor} ownerName={ownerName}
            onSelectTask={t => { setStatModal(null); setSelectedTask(t) }}
            onClose={() => setStatModal(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCashBreakdown && (
          <CashByOwnerModal groups={cashByOwner} describeEntry={describeCashEntry} onClose={() => setShowCashBreakdown(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {clientBalanceModalId && (() => {
          const client = ownerBalances.find(ob => ob.ownerId === clientBalanceModalId)
          if (!client) return null
          return (
            <ClientBalanceModal client={client} aptColor={aptColor}
              onSelectTask={t => { setClientBalanceModalId(null); setSelectedTask(t) }}
              onClose={() => setClientBalanceModalId(null)} />
          )
        })()}
      </AnimatePresence>
    </div>
  )
}
