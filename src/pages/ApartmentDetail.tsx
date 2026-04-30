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

function AvailabilityCalendar({ blockedDates }: { blockedDates: BlockedDate[] }) {
  const [month, setMonth] = useState(new Date())

  const blockedMap = useMemo(() => {
    const map = new Map<string, BlockedDateReason>()
    for (const bd of blockedDates) {
      map.set(bd.date, bd.reason)
    }
    return map
  }, [blockedDates])

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

          let cellClass =
            'relative flex items-center justify-center h-8 w-full rounded-lg text-xs transition-colors'

          if (!inMonth) {
            cellClass += ' text-muted-foreground/30'
          } else if (reason === 'blocked') {
            cellClass += ' bg-destructive/20 text-destructive font-medium'
          } else if (reason === 'pending') {
            cellClass += ' bg-amber-100 text-amber-800 font-medium'
          } else if (isToday) {
            cellClass += ' bg-primary text-primary-foreground font-semibold'
          } else {
            cellClass += ' text-foreground hover:bg-muted'
          }

          return (
            <div key={iso} className={cellClass} title={reason ?? undefined}>
              {format(day, 'd')}
            </div>
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
}

function BookingForm({ apartmentId, pricePerNight, cleaningFee, maxGuests, prefillName }: BookingFormProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState<BookingFormData>({
    start_date: '',
    end_date: '',
    guests_count: 1,
    guest_name: prefillName ?? '',
    guest_phone: '',
    guest_message: '',
  })

  const nights = useMemo(() => {
    if (!form.start_date || !form.end_date) return 0
    const diff =
      (new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000
    return Math.max(0, Math.round(diff))
  }, [form.start_date, form.end_date])

  const total = nights * pricePerNight + cleaningFee

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('bookings').insert({
        apartment_id: apartmentId,
        guest_id: user!.id,
        guest_name: form.guest_name,
        guest_phone: form.guest_phone,
        guest_message: form.guest_message || null,
        start_date: form.start_date,
        end_date: form.end_date,
        guests_count: form.guests_count,
        status: 'pending',
        total_amount: total > 0 ? total : null,
      })
      if (error) throw error
    },
    onSuccess: () => setSuccess(true),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit.mutate()
  }

  const set = <K extends keyof BookingFormData>(key: K, value: BookingFormData[K]) =>
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
            value={form.start_date}
            min={format(new Date(), 'yyyy-MM-dd')}
            onChange={(e) => set('start_date', e.target.value)}
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
            value={form.end_date}
            min={form.start_date || format(new Date(), 'yyyy-MM-dd')}
            onChange={(e) => set('end_date', e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

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
        <input
          type="tel"
          required
          value={form.guest_phone}
          onChange={(e) => set('guest_phone', e.target.value)}
          placeholder="+7 (999) 000-00-00"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('booking.guestMessage', { defaultValue: 'Сообщение (необязательно)' })}
        </label>
        <textarea
          rows={3}
          value={form.guest_message}
          onChange={(e) => set('guest_message', e.target.value)}
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

      {submit.isError && (
        <p className="text-xs text-destructive">
          {(submit.error as Error)?.message ?? t('common.error', { defaultValue: 'Ошибка. Попробуйте снова.' })}
        </p>
      )}

      <button
        type="submit"
        disabled={submit.isPending}
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
            <AvailabilityCalendar blockedDates={apartment.blocked_dates} />
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
