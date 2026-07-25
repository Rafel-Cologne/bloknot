import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin,
  Users,
  Star,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { detectCountry } from '@/lib/phone'
import type { BlockedDateReason } from '@/integrations/supabase/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ApartmentImage = {
  id: string
  apartment_id: string
  image_url: string
  order_index: number
}

type BlockedDate = {
  id: string
  apartment_id: string
  date: string
  reason: BlockedDateReason
}

// Занятые диапазоны дат по РЕАЛЬНЫМ бронированиям (не blocked_dates — та таблица только для
// ручной блокировки хозяином и не отражает факт заезда гостя). Приходит из публичной
// SECURITY DEFINER функции get_public_booked_ranges — без имени/телефона гостя.
type BookedRange = { apartment_id: string; start_date: string; end_date: string; status: string }

// Разворачивает диапазон [start, end) в список дней ISO — end_date это день выезда,
// он свободен для нового заезда, поэтому не включается.
function expandRangeDays(start: string, end: string): string[] {
  const days: string[] = []
  let d = new Date(start + 'T00:00:00Z')
  const endD = new Date(end + 'T00:00:00Z')
  while (d < endD) {
    days.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86400000)
  }
  return days
}

type CustomPricing = {
  id: string
  apartment_id: string
  date: string
  price: number
}

type ApartmentFull = {
  id: string
  owner_id: string
  title: string
  description: string
  address: string
  amenities: string[]
  rules: string[]
  price_per_night: number
  cleaning_fee: number
  max_guests: number
  is_public: boolean
  apartment_images: ApartmentImage[]
  blocked_dates: BlockedDate[]
  custom_pricing: CustomPricing[]
}

type BookingFormData = {
  start_date: string
  end_date: string
  guests_count: number
  guest_name: string
  guest_phone: string
  guest_message: string
}

// ─── Image Gallery ─────────────────────────────────────────────────────────────

function ImageGallery({ images, title }: { images: ApartmentImage[]; title: string }) {
  const [current, setCurrent] = useState(0)
  const sorted = [...images].sort((a, b) => a.order_index - b.order_index)

  if (sorted.length === 0) {
    return (
      <div className="w-full h-64 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground text-sm">
        Нет фотографий
      </div>
    )
  }

  const prev = () => setCurrent((c) => (c === 0 ? sorted.length - 1 : c - 1))
  const next = () => setCurrent((c) => (c === sorted.length - 1 ? 0 : c + 1))

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-muted">
      {/* Main image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
        <AnimatePresence mode="wait">
          <motion.img
            key={sorted[current].id}
            src={sorted[current].image_url}
            alt={`${title} — фото ${current + 1}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </AnimatePresence>

        {sorted.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-card/80 backdrop-blur-sm flex items-center justify-center shadow text-foreground hover:bg-card transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-card/80 backdrop-blur-sm flex items-center justify-center shadow text-foreground hover:bg-card transition-colors"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {sorted.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === current ? 'bg-primary-foreground w-3' : 'bg-primary-foreground/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {sorted.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setCurrent(i)}
              className={cn(
                'flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all',
                i === current ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100',
              )}
            >
              <img src={img.image_url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Availability Calendar ─────────────────────────────────────────────────────

function AvailabilityCalendar({
  blockedDates, bookedRanges, selectedStart, selectedEnd, onDayClick,
}: {
  blockedDates: BlockedDate[]; bookedRanges: BookedRange[]
  selectedStart?: string; selectedEnd?: string; onDayClick?: (iso: string) => void
}) {
  const [month, setMonth] = useState(new Date())

  const blockedMap = useMemo(() => {
    const map = new Map<string, BlockedDateReason>()
    // Сначала реальные брони — принятая бронь всегда "занято", даже если это же число
    // почему-то помечено в blocked_dates как "pending".
    for (const br of bookedRanges) {
      const reason: BlockedDateReason = br.status === 'accepted' ? 'blocked' : 'pending'
      for (const day of expandRangeDays(br.start_date, br.end_date)) {
        if (reason === 'blocked' || map.get(day) !== 'blocked') map.set(day, reason)
      }
    }
    for (const bd of blockedDates) {
      if (bd.reason === 'blocked' || map.get(bd.date) !== 'blocked') map.set(bd.date, bd.reason)
    }
    return map
  }, [blockedDates, bookedRanges])

  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  })

  // Monday-first offset: Sun=0 → 6, Mon=1 → 0, ...
  const startOffset = (getDay(startOfMonth(month)) + 6) % 7

  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="p-1.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-foreground capitalize">
          {format(month, 'LLLL yyyy', { locale: ru })}
        </span>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="p-1.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map((day) => {
          const iso = format(day, 'yyyy-MM-dd')
          const reason = blockedMap.get(iso)
          const isToday = isSameDay(day, new Date())
          const inMonth = isSameMonth(day, month)
          const isPast = iso < format(new Date(), 'yyyy-MM-dd')
          const isBlocked = reason === 'blocked'
          const isSelectedBound = iso === selectedStart || iso === selectedEnd
          const isInRange = !!selectedStart && !!selectedEnd && iso > selectedStart && iso < selectedEnd
          const clickable = inMonth && !isPast && !isBlocked && !!onDayClick

          let cellClass =
            'relative flex items-center justify-center h-8 w-full rounded-lg text-xs transition-colors'

          if (!inMonth) {
            cellClass += ' text-muted-foreground/30'
          } else if (isSelectedBound) {
            cellClass += ' bg-primary text-primary-foreground font-semibold'
          } else if (isInRange) {
            cellClass += ' bg-primary/20 text-primary font-medium'
          } else if (isBlocked) {
            cellClass += ' bg-destructive/20 text-destructive font-medium'
          } else if (reason === 'pending') {
            cellClass += ' bg-amber-100 text-amber-800 font-medium'
          } else if (isToday) {
            cellClass += ' bg-primary/10 text-primary font-semibold'
          } else if (isPast) {
            cellClass += ' text-muted-foreground/40'
          } else {
            cellClass += ' text-foreground hover:bg-muted'
          }

          if (clickable) cellClass += ' cursor-pointer'
          else if (inMonth && isBlocked) cellClass += ' cursor-not-allowed'

          return (
            <button
              key={iso}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onDayClick?.(iso)}
              className={cellClass}
              title={isBlocked ? 'Занято' : reason === 'pending' ? 'Ожидает подтверждения' : undefined}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-destructive/20 border border-destructive/30" />
          Занято
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
          Ожидает
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-background border border-border" />
          Свободно
        </div>
      </div>
    </div>
  )
}

// ─── Booking Form ──────────────────────────────────────────────────────────────

interface BookingFormProps {
  apartmentId: string
  pricePerNight: number
  cleaningFee: number
  maxGuests: number
  prefillName?: string
  hardBlockedDays: Set<string>
  startDate: string
  endDate: string
  onChangeStart: (v: string) => void
  onChangeEnd: (v: string) => void
}

function BookingForm({
  apartmentId, pricePerNight, cleaningFee, maxGuests, prefillName, hardBlockedDays,
  startDate, endDate, onChangeStart, onChangeEnd,
}: BookingFormProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [success, setSuccess] = useState(false)
  const [showPhoneCountry, setShowPhoneCountry] = useState(false)
  const [form, setForm] = useState<Omit<BookingFormData, 'start_date' | 'end_date'>>({
    guests_count: 1,
    guest_name: prefillName ?? '',
    guest_phone: '',
    guest_message: '',
  })

  const nights = useMemo(() => {
    if (!startDate || !endDate) return 0
    const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
    return Math.max(0, Math.round(diff))
  }, [startDate, endDate])

  const total = nights * pricePerNight + cleaningFee

  // Пересекается ли выбранный диапазон с уже ЗАНЯТЫМИ (подтверждённая бронь или ручная
  // блокировка хозяином) датами — брони со статусом "ожидает" сюда намеренно не входят:
  // несколько гостей могут одновременно отправить запрос на одни и те же даты, выбирает хозяин.
  const hasOverlap = useMemo(() => {
    if (!startDate || !endDate || endDate <= startDate) return false
    return expandRangeDays(startDate, endDate).some((d) => hardBlockedDays.has(d))
  }, [startDate, endDate, hardBlockedDays])

  const submit = useMutation({
    mutationFn: async () => {
      if (hasOverlap) throw new Error(t('booking.datesUnavailable', { defaultValue: 'Эти даты уже заняты — выберите другой период' }))
      const { error } = await supabase.from('bookings').insert({
        apartment_id: apartmentId,
        guest_id: user!.id,
        guest_name: form.guest_name,
        guest_phone: form.guest_phone,
        guest_message: form.guest_message,
        start_date: startDate,
        end_date: endDate,
        guests_count: form.guests_count,
        status: 'pending',
        total_amount: total > 0 ? total : null,
        // Отдельно сохраняем уборку, чтобы хозяин в карточке брони видел разбивку
        // (аренда отдельно от уборки), а не только итоговую сумму.
        cleaning_fee_amount: cleaningFee > 0 ? cleaningFee : null,
      })
      if (error) throw error
    },
    onSuccess: () => setSuccess(true),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit.mutate()
  }

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-green-50 border border-green-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
      >
        <CheckCircle2 size={40} className="text-green-600" />
        <h3 className="font-display font-semibold text-foreground text-lg">
          {t('booking.successTitle', { defaultValue: 'Запрос отправлен!' })}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('booking.successMessage', { defaultValue: 'Владелец рассмотрит ваш запрос и свяжется с вами.' })}
        </p>
      </motion.div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-2xl p-5 shadow-[var(--shadow-card)] flex flex-col gap-4"
    >
      <h3 className="font-display font-semibold text-foreground text-base">
        {t('booking.title', { defaultValue: 'Забронировать' })}
      </h3>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('booking.startDate', { defaultValue: 'Заезд' })}
          </label>
          <input
            type="date"
            required
            value={startDate}
            min={format(new Date(), 'yyyy-MM-dd')}
            onChange={(e) => { onChangeStart(e.target.value); if (endDate && endDate <= e.target.value) onChangeEnd('') }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('booking.endDate', { defaultValue: 'Выезд' })}
          </label>
          <input
            type="date"
            required
            value={endDate}
            min={startDate || format(new Date(), 'yyyy-MM-dd')}
            onChange={(e) => onChangeEnd(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        {t('booking.pickHint', { defaultValue: 'Даты можно также выбрать на календаре ниже' })}
      </p>

      {/* Guests */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('booking.guestsCount', { defaultValue: 'Количество гостей' })}
        </label>
        <input
          type="number"
          required
          min={1}
          max={maxGuests}
          value={form.guests_count}
          onChange={(e) => set('guests_count', parseInt(e.target.value) || 1)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{t('booking.maxGuests', { defaultValue: 'Максимум:' })} {maxGuests}</p>
      </div>

      {/* Guest info */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('booking.guestName', { defaultValue: 'Ваше имя' })}
        </label>
        <input
          type="text"
          required
          value={form.guest_name}
          onChange={(e) => set('guest_name', e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('booking.guestPhone', { defaultValue: 'Телефон' })}
        </label>
        <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
          <button
            type="button"
            onClick={() => setShowPhoneCountry((v) => !v)}
            className="flex-shrink-0 px-2.5 py-2 text-base leading-none border-r border-border hover:bg-muted transition-colors"
            title={detectCountry(form.guest_phone)?.name}
          >
            {detectCountry(form.guest_phone)?.flag ?? '🌐'}
          </button>
          <span className="pl-2 text-sm text-muted-foreground select-none">+</span>
          <input
            type="tel"
            required
            value={form.guest_phone.replace(/^\+/, '')}
            onChange={(e) => set('guest_phone', '+' + e.target.value.replace(/^\+*/, ''))}
            placeholder="7 999 000-00-00"
            className="flex-1 bg-transparent outline-none px-1 py-2 text-sm text-foreground min-w-0"
          />
        </div>
        {showPhoneCountry && detectCountry(form.guest_phone) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {detectCountry(form.guest_phone)!.flag} {detectCountry(form.guest_phone)!.name}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {t('booking.phoneHint', { defaultValue: 'Код страны определяется автоматически' })}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('booking.guestMessage', { defaultValue: 'Сообщение хозяину' })}
        </label>
        <textarea
          rows={3}
          required
          minLength={3}
          value={form.guest_message}
          onChange={(e) => set('guest_message', e.target.value)}
          placeholder={t('booking.guestMessagePlaceholder', { defaultValue: 'Пара слов о поездке — так заявка не выглядит анонимной' }) as string}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Price summary */}
      {nights > 0 && (
        <div className="bg-muted rounded-xl p-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>€{pricePerNight} × {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}</span>
            <span>€{pricePerNight * nights}</span>
          </div>
          {cleaningFee > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t('apartment.cleaningFee', { defaultValue: 'Уборка' })}</span>
              <span>€{cleaningFee}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-foreground border-t border-border pt-2">
            <span>{t('booking.total', { defaultValue: 'Итого' })}</span>
            <span>€{total}</span>
          </div>
        </div>
      )}

      {hasOverlap && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">
          {t('booking.datesUnavailable', { defaultValue: 'Эти даты уже заняты — выберите другой период' })}
        </p>
      )}

      {submit.isError && (
        <p className="text-xs text-destructive">
          {(submit.error as Error)?.message ?? t('common.error', { defaultValue: 'Ошибка. Попробуйте снова.' })}
        </p>
      )}

      <button
        type="submit"
        disabled={submit.isPending || hasOverlap}
        className="btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 w-full"
      >
        {submit.isPending
          ? t('booking.submitting', { defaultValue: 'Отправляем…' })
          : t('booking.submit', { defaultValue: 'Отправить запрос' })}
      </button>
    </form>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ApartmentDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()

  // Fetch profile for prefill
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('name, email, phone')
        .eq('id', user.id)
        .single()
      return data
    },
    enabled: !!user,
  })

  const { data: bookedRanges = [] } = useQuery({
    queryKey: ['apartment-booked-ranges', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_booked_ranges', { p_apartment_ids: [id!] })
      if (error) throw error
      return (data ?? []) as BookedRange[]
    },
    enabled: !!id,
  })

  const { data: apartment, isLoading, isError } = useQuery({
    queryKey: ['apartment-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('apartments')
        .select('*, apartment_images(*), custom_pricing(*), blocked_dates(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as ApartmentFull
    },
    enabled: !!id,
  })

  // Даты заезда/выезда — общее состояние для календаря (клик по дню) и формы бронирования
  // (ручной ввод даты), чтобы оба способа выбора периода были синхронизированы.
  const [selStart, setSelStart] = useState('')
  const [selEnd, setSelEnd] = useState('')

  // По-настоящему занятые дни — подтверждённая бронь или ручная блокировка хозяином.
  // Заявки со статусом "ожидает" сюда не входят: несколько гостей могут отправить запрос
  // на одни и те же даты одновременно, выбирает хозяин при подтверждении.
  const hardBlockedDays = useMemo(() => {
    const set = new Set<string>()
    for (const br of bookedRanges) {
      if (br.status !== 'accepted') continue
      for (const d of expandRangeDays(br.start_date, br.end_date)) set.add(d)
    }
    for (const bd of apartment?.blocked_dates ?? []) {
      if (bd.reason === 'blocked') set.add(bd.date)
    }
    return set
  }, [bookedRanges, apartment?.blocked_dates])

  const handleDayClick = (iso: string) => {
    if (hardBlockedDays.has(iso)) return
    if (!selStart || selEnd) { setSelStart(iso); setSelEnd(''); return }
    if (iso <= selStart) { setSelStart(iso); setSelEnd(''); return }
    // Нельзя выбрать конец периода, если между заездом и этим днём есть занятая дата
    const blockedBetween = expandRangeDays(selStart, iso).some((d) => hardBlockedDays.has(d))
    if (blockedBetween) { setSelStart(iso); setSelEnd(''); return }
    setSelEnd(iso)
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 flex items-center justify-center text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }

  if (isError || !apartment) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">{t('common.notFound', { defaultValue: 'Объект не найден' })}</p>
        <Link to="/" className="btn-primary rounded-xl px-4 py-2 text-sm">
          {t('common.backHome', { defaultValue: 'На главную' })}
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={16} />
        {t('common.back', { defaultValue: 'Назад' })}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Gallery */}
          <ImageGallery images={apartment.apartment_images} title={apartment.title} />

          {/* Title + address */}
          <div>
            <h1 className="text-3xl font-display font-semibold text-foreground mb-2">
              {apartment.title}
            </h1>
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <MapPin size={15} />
              <span>{apartment.address}</span>
            </div>
          </div>

          {/* Key stats */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-2 text-sm">
              <Star size={15} className="text-accent" />
              <span className="font-medium text-foreground">€{apartment.price_per_night}</span>
              <span className="text-muted-foreground">/ночь</span>
            </div>
            <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-2 text-sm">
              <Users size={15} className="text-muted-foreground" />
              <span className="text-muted-foreground">до {apartment.max_guests} гостей</span>
            </div>
            {apartment.cleaning_fee > 0 && (
              <div className="flex items-center gap-1.5 bg-muted rounded-xl px-3 py-2 text-sm text-muted-foreground">
                {t('apartment.cleaningFee', { defaultValue: 'Уборка' })}: €{apartment.cleaning_fee}
              </div>
            )}
          </div>

          {/* Description */}
          {apartment.description && (
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground mb-2">
                {t('apartment.about', { defaultValue: 'Об объекте' })}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {apartment.description}
              </p>
            </div>
          )}

          {/* Amenities */}
          {apartment.amenities?.length > 0 && (
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground mb-3">
                {t('apartment.amenities', { defaultValue: 'Удобства' })}
              </h2>
              <div className="flex flex-wrap gap-2">
                {apartment.amenities.map((amenity) => (
                  <span
                    key={amenity}
                    className="px-3 py-1.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium"
                  >
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rules */}
          {apartment.rules?.length > 0 && (
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground mb-3">
                {t('apartment.rules', { defaultValue: 'Правила проживания' })}
              </h2>
              <ul className="flex flex-col gap-2">
                {apartment.rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Calendar */}
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-3 flex items-center gap-2">
              <Calendar size={18} />
              {t('apartment.availability', { defaultValue: 'Доступность' })}
            </h2>
            <AvailabilityCalendar
              blockedDates={apartment.blocked_dates}
              bookedRanges={bookedRanges}
              selectedStart={selStart}
              selectedEnd={selEnd}
              onDayClick={user ? handleDayClick : undefined}
            />
          </div>
        </div>

        {/* Right column — booking */}
        <div className="lg:sticky lg:top-6 h-fit">
          {user ? (
            <BookingForm
              apartmentId={apartment.id}
              pricePerNight={apartment.price_per_night}
              cleaningFee={apartment.cleaning_fee}
              maxGuests={apartment.max_guests}
              prefillName={profile?.name}
              hardBlockedDays={hardBlockedDays}
              startDate={selStart}
              endDate={selEnd}
              onChangeStart={setSelStart}
              onChangeEnd={setSelEnd}
            />
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)] text-center flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t('booking.loginRequired', { defaultValue: 'Войдите, чтобы забронировать этот объект' })}
              </p>
              <Link
                to="/auth"
                className="btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold block w-full"
              >
                {t('auth.login', { defaultValue: 'Войти' })}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
