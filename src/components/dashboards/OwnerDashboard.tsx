import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  CalendarCheck,
  Brush,
  Banknote,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Pencil,
  Eye,
  EyeOff,
  Trash2,
  Users,
  MapPin,
  Camera,
  TrendingUp,
  Euro,
  CalendarPlus,
  Lock,
  Settings,
  Search,
  LogOut,
  Bell,
  Home,
  ChevronDown,
  PlusCircle,
  FileText,
  BarChart2,
  ClipboardX,
  Menu,
  Zap,
  Droplets,
  Receipt,
} from 'lucide-react'
import {
  format,
  startOfMonth,
  getDaysInMonth,
  addMonths,
  subMonths,
  getDay,
  addDays,
  parseISO,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase } from '@/integrations/supabase/client'
import { useTheme, type AppTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = 'dashboard' | 'apartments' | 'bookings' | 'calendar' | 'cleaning' | 'expenses' | 'settings'
type BookingSourceLocal = 'airbnb' | 'booking' | 'other'

type ApartmentImage = { id: string; image_url: string; order_index: number }

type Apartment = {
  id: string; title: string; address: string; description: string
  cleaning_fee: number; price_per_night: number; max_guests: number
  is_public: boolean; owner_id: string; cleaner_id: string | null; amenities: string[]
  apartment_images?: ApartmentImage[]
}

type CustomPrice = { id: string; date: string; price: number }

type CleaningTask = {
  id: string; status: string; payment_method: string | null
  payment_status: string; cleaning_fee: number; completed_at: string | null
  notes: string | null
}

type BookingRow = {
  id: string; apartment_id: string; guest_name: string; guest_phone: string
  start_date: string; end_date: string; guests_count: number; status: string
  source: string; owner_notes: string | null; total_amount: number | null
  apartments: { title: string; address: string }
  cleaning_tasks: CleaningTask[]
}


// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb', booking: 'Booking.com', other: 'Частный', platform: 'Direct',
}
const SOURCE_COLOR: Record<string, string> = {
  airbnb: 'bg-rose-100 text-rose-700',
  booking: 'bg-blue-100 text-blue-700',
  other: 'bg-purple-100 text-purple-700',
  platform: 'bg-green-100 text-green-700',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  cancelled: 'bg-muted text-muted-foreground',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает', accepted: 'Подтверждено', declined: 'Отклонено', cancelled: 'Отменено',
}
const SOURCE_PAYMENT: Record<BookingSourceLocal, string> = {
  airbnb: 'owner_transfer', booking: 'owner_transfer', other: 'guest_cash',
}

const inputCls = 'rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full'

// ─── Persistent last-selected apartment ───────────────────────────────────────
const LAST_APT_KEY = 'bloknot_last_apt'
const getLastAptId = () => {
  try { return localStorage.getItem(LAST_APT_KEY) ?? '' } catch { return '' }
}
const saveLastAptId = (id: string) => {
  try { localStorage.setItem(LAST_APT_KEY, id) } catch { /* ignore */ }
}

// ─── European number formatter ─────────────────────────────────────────────────
const fmtEur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// ─── Phone country detection ──────────────────────────────────────────────────
// Sorted longest prefix first for greedy matching
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

// ─── Add Booking Modal ────────────────────────────────────────────────────────

type BookingForm = {
  apartment_id: string; guest_name: string; guest_phone: string
  start_date: string; end_date: string; guests_count: number
  source: BookingSourceLocal; cleaning_fee: number; total_amount: number; owner_notes: string
}

function AddBookingModal({
  apartments, onClose, onSaved, initialDates,
}: {
  apartments: Apartment[]; onClose: () => void; onSaved: () => void
  initialDates?: { start: string; end: string; apartmentId?: string }
}) {
  const [form, setForm] = useState<BookingForm>({
    apartment_id: initialDates?.apartmentId || getLastAptId() || apartments[0]?.id || '',
    guest_name: '', guest_phone: '',
    start_date: initialDates?.start ?? '',
    end_date: initialDates?.end ?? '',
    guests_count: 0, source: 'airbnb', cleaning_fee: 60, total_amount: 0, owner_notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPhoneCountry, setShowPhoneCountry] = useState(false)
  const set = <K extends keyof BookingForm>(k: K, v: BookingForm[K]) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.guest_name.trim() || !form.start_date || !form.end_date) {
      setError('Заполните гостя и даты'); return
    }
    if (form.end_date <= form.start_date) {
      setError('Выезд должен быть позже заезда'); return
    }
    setSaving(true); setError(null)

    const { data: bd, error: be } = await supabase
      .from('bookings')
      .insert({
        apartment_id: form.apartment_id, guest_name: form.guest_name.trim(),
        guest_phone: form.guest_phone.trim(), start_date: form.start_date,
        end_date: form.end_date, guests_count: form.guests_count || 1,
        status: 'accepted', source: form.source, owner_notes: form.owner_notes.trim() || null,
        total_amount: form.total_amount > 0 ? form.total_amount : null,
      })
      .select('id').single()

    if (be || !bd) { setError(be?.message ?? 'Ошибка'); setSaving(false); return }

    const apt = apartments.find(a => a.id === form.apartment_id)
    let cleanerId: string | null = apt?.cleaner_id ?? null
    if (!cleanerId) {
      const { data: rd } = await supabase.from('user_roles').select('user_id').eq('role', 'cleaner').limit(1).maybeSingle()
      cleanerId = rd?.user_id ?? null
    }

    await supabase.from('cleaning_tasks').insert({
      booking_id: bd.id, cleaner_id: cleanerId, cleaning_fee: form.cleaning_fee,
      payment_method: SOURCE_PAYMENT[form.source] as 'owner_transfer' | 'guest_cash',
      payment_status: 'pending', status: 'pending',
    })

    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm px-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card rounded-2xl shadow-[var(--shadow-card-hover)] w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold">Добавить бронирование</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Объект *</label>
            <select value={form.apartment_id}
              onChange={e => { set('apartment_id', e.target.value); saveLastAptId(e.target.value) }}
              className={inputCls}>
              {apartments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Источник</label>
            <div className="flex gap-2">
              {(['airbnb', 'booking', 'other'] as BookingSourceLocal[]).map(s => (
                <button key={s} type="button" onClick={() => set('source', s)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors border ${form.source === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40'}`}>
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {SOURCE_PAYMENT[form.source] === 'guest_cash' ? '💵 Гость платит за уборку наличными' : '🏦 Вы платите за уборку'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Guest name */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Гость *</label>
              <input type="text" value={form.guest_name}
                onChange={e => set('guest_name', e.target.value)}
                placeholder="Имя гостя" required className={inputCls} />
            </div>
            {/* Phone with country flag */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Телефон</label>
              <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <button type="button"
                  onClick={() => setShowPhoneCountry(v => !v)}
                  className="flex-shrink-0 px-2.5 py-2 text-base leading-none border-r border-border hover:bg-muted transition-colors"
                  title={detectCountry(form.guest_phone)?.name}
                >
                  {detectCountry(form.guest_phone)?.flag ?? '🌐'}
                </button>
                <span className="pl-2 text-sm text-muted-foreground select-none">+</span>
                <input type="tel"
                  value={form.guest_phone.replace(/^\+/, '')}
                  onChange={e => set('guest_phone', '+' + e.target.value.replace(/^\+*/, ''))}
                  placeholder=""
                  className="flex-1 bg-transparent outline-none px-1 py-2 text-sm text-foreground min-w-0" />
              </div>
              {showPhoneCountry && detectCountry(form.guest_phone) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detectCountry(form.guest_phone)!.flag} {detectCountry(form.guest_phone)!.name}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['Заезд *', 'start_date', ''], ['Выезд *', 'end_date', form.start_date || '']].map(([label, key, min]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
                <input type="date" value={form[key as keyof BookingForm] as string}
                  onChange={e => set(key as keyof BookingForm, e.target.value as never)}
                  required min={min || undefined} className={inputCls} />
              </div>
            ))}
          </div>
          {form.start_date && form.end_date && form.end_date > form.start_date && (() => {
            const nights = Math.round((parseISO(form.end_date).getTime() - parseISO(form.start_date).getTime()) / 86400000)
            return <p className="text-xs text-muted-foreground -mt-1">🌙 {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}</p>
          })()}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Гостей</label>
              <input type="text" inputMode="numeric"
                value={form.guests_count === 0 ? '' : String(form.guests_count)}
                onChange={e => set('guests_count', parseInt(e.target.value) || 0)}
                placeholder="1" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Аренда, €</label>
              <input type="text" inputMode="decimal"
                value={form.total_amount === 0 ? '' : String(form.total_amount)}
                onChange={e => set('total_amount', parseFloat(e.target.value.replace(',', '.')) || 0)}
                placeholder="0" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Уборка, €</label>
              <input type="text" inputMode="decimal"
                value={form.cleaning_fee === 0 ? '' : String(form.cleaning_fee)}
                onChange={e => set('cleaning_fee', parseFloat(e.target.value.replace(',', '.')) || 0)}
                placeholder="0" className={inputCls} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Заметки</label>
            <textarea rows={2} value={form.owner_notes} onChange={e => set('owner_notes', e.target.value)}
              placeholder="Особые пожелания..." className={`${inputCls} resize-none`} />
          </div>
          {error && <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm bg-muted text-muted-foreground hover:bg-muted/70">Отмена</button>
            <button type="submit" disabled={saving} className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-60">
              {saving ? 'Сохраняем…' : 'Добавить бронь'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Apartment Modal ──────────────────────────────────────────────────────────

type AptForm = {
  title: string; address: string; description: string
  price_per_night: number; cleaning_fee: number; max_guests: number; is_public: boolean
}

function ApartmentModal({ initial, ownerId, onClose, onSaved }: {
  initial?: Apartment | null; ownerId: string; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<AptForm>(initial
    ? { title: initial.title, address: initial.address, description: initial.description,
        price_per_night: initial.price_per_night, cleaning_fee: initial.cleaning_fee,
        max_guests: initial.max_guests, is_public: initial.is_public }
    : { title: '', address: '', description: '', price_per_night: 0, cleaning_fee: 60, max_guests: 2, is_public: true }
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    initial?.apartment_images?.[0]?.image_url ?? null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null)
    const payload = { ...form, owner_id: ownerId }

    let aptId = initial?.id ?? ''
    if (initial) {
      const { error: err } = await supabase.from('apartments').update(payload).eq('id', initial.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('apartments').insert(payload).select('id').single()
      if (err || !data) { setError(err?.message ?? 'Ошибка'); setSaving(false); return }
      aptId = data.id
    }

    // Upload photo if selected
    if (photoFile && aptId) {
      const ext = photoFile.name.split('.').pop() ?? 'jpg'
      const path = `${ownerId}/${aptId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('apartment-photos').upload(path, photoFile, { upsert: true })
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('apartment-photos').getPublicUrl(path)
        await supabase.from('apartment_images').delete().eq('apartment_id', aptId)
        await supabase.from('apartment_images').insert({ apartment_id: aptId, image_url: publicUrl, order_index: 0 })
      }
    }

    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm px-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card rounded-2xl shadow-[var(--shadow-card-hover)] w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold">{initial ? 'Редактировать объект' : 'Новый объект'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Photo upload */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Фото квартиры</label>
            <label className="cursor-pointer group">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              <div className={`relative h-40 rounded-xl border-2 border-dashed border-border overflow-hidden flex items-center justify-center bg-secondary transition-colors group-hover:border-primary/50 ${photoPreview ? 'border-solid border-transparent' : ''}`}>
                {photoPreview ? (
                  <>
                    <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-medium bg-black/50 px-3 py-1.5 rounded-lg transition-opacity">
                        Сменить фото
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Camera size={28} />
                    <span className="text-sm">Нажмите, чтобы выбрать фото</span>
                    <span className="text-xs opacity-60">JPG, PNG, WEBP</span>
                  </div>
                )}
              </div>
            </label>
          </div>

          {[['Название *', 'title'], ['Адрес', 'address']].map(([l, k]) => (
            <div key={k} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{l}</label>
              <input type="text" value={form[k as keyof AptForm] as string}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                required={k === 'title'} className={inputCls} />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Описание</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[['Цена/ночь', 'price_per_night'], ['Уборка €', 'cleaning_fee'], ['Макс. гостей', 'max_guests']].map(([l, k]) => (
              <div key={k} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{l}</label>
                <input type="number" min={0} value={form[k as keyof AptForm] as number}
                  onChange={e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))} className={inputCls} />
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
              className="w-4 h-4 rounded accent-primary" />
            <span className="text-sm">Опубликовать объект</span>
          </label>
          {error && <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm bg-muted text-muted-foreground hover:bg-muted/70">Отмена</button>
            <button type="submit" disabled={saving} className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-60">
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Pricing Modal ────────────────────────────────────────────────────────────

function PricingModal({ apartment, onClose }: { apartment: Apartment; onClose: () => void }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [price, setPrice] = useState(apartment.price_per_night || 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const { data: prices, refetch } = useQuery({
    queryKey: ['custom-pricing', apartment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_pricing')
        .select('*')
        .eq('apartment_id', apartment.id)
        .gte('date', today)
        .order('date')
      if (error) throw error
      return data as CustomPrice[]
    },
  })

  // Group consecutive dates with same price
  const priceRanges = useMemo(() => {
    if (!prices?.length) return []
    const ranges: { from: string; to: string; price: number }[] = []
    let cur = { from: prices[0].date, to: prices[0].date, price: prices[0].price }
    for (let i = 1; i < prices.length; i++) {
      const p = prices[i]
      const prevDate = addDays(parseISO(cur.to), 1)
      if (p.price === cur.price && format(prevDate, 'yyyy-MM-dd') === p.date) {
        cur.to = p.date
      } else {
        ranges.push(cur)
        cur = { from: p.date, to: p.date, price: p.price }
      }
    }
    ranges.push(cur)
    return ranges
  }, [prices])

  const handleSave = async () => {
    if (!from || !to || to < from) { setError('Укажите корректный период'); return }
    setSaving(true); setError(null)
    // Generate all dates in range
    const records: { apartment_id: string; date: string; price: number }[] = []
    let d = parseISO(from)
    const end = parseISO(to)
    while (d <= end) {
      records.push({ apartment_id: apartment.id, date: format(d, 'yyyy-MM-dd'), price })
      d = addDays(d, 1)
    }
    // Upsert (insert or update on conflict)
    const { error: err } = await supabase
      .from('custom_pricing')
      .upsert(records, { onConflict: 'apartment_id,date' })
    setSaving(false)
    if (err) { setError(err.message); return }
    refetch()
    qc.invalidateQueries({ queryKey: ['cal-bookings'] })
    setFrom(''); setTo('')
  }

  const deleteRange = async (dateFrom: string, dateTo: string) => {
    let d = parseISO(dateFrom)
    const end = parseISO(dateTo)
    const dates: string[] = []
    while (d <= end) { dates.push(format(d, 'yyyy-MM-dd')); d = addDays(d, 1) }
    await supabase.from('custom_pricing').delete()
      .eq('apartment_id', apartment.id).in('date', dates)
    refetch()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm px-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card rounded-2xl shadow-[var(--shadow-card-hover)] w-full max-w-lg p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold">Сезонные цены</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{apartment.title} · базовая цена: {fmtEur(apartment.price_per_night)}/ночь</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>

        {/* Add price range */}
        <div className="bg-secondary rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Установить цену на период</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">С даты</label>
              <input type="date" value={from} min={today} onChange={e => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">По дату</label>
              <input type="date" value={to} min={from || today} onChange={e => setTo(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-muted-foreground">Цена за ночь, €</label>
              <input type="number" min={0} value={price} onChange={e => setPrice(+e.target.value)} className={inputCls} />
            </div>
            <button onClick={handleSave} disabled={saving || !from || !to}
              className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50 whitespace-nowrap">
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Existing price rules */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Предстоящие цены {priceRanges.length > 0 ? `(${priceRanges.length} периодов)` : ''}
          </p>
          {!priceRanges.length ? (
            <p className="text-sm text-muted-foreground">Нет сезонных цен. Действует базовая {fmtEur(apartment.price_per_night)}/ночь.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {priceRanges.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-background border border-border rounded-xl px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {r.from === r.to ? r.from : `${r.from} → ${r.to}`}
                    </span>
                    <span className="ml-3 text-sm font-bold text-primary">{fmtEur(r.price)}/ночь</span>
                  </div>
                  <button onClick={() => deleteRange(r.from, r.to)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}



// ─── Calendar Section ─────────────────────────────────────────────────────────

type CalDayInfo = {
  status: 'accepted' | 'pending'
  bookingId: string
  guestName: string
  guestsCount: number
  isStart: boolean
  isEnd: boolean
  nights: number
  totalAmount: number | null
  cleaningFee: number
  source: string
}

function CalendarSection({ apartments, selectedApt, setSelectedApt }: { apartments: Apartment[]; selectedApt: string; setSelectedApt: (id: string) => void }) {
  const qc = useQueryClient()
  const { theme } = useTheme()
  const isDark = theme === 'business'

  // Responsive screen size
  const [screenW, setScreenW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440)
  useEffect(() => {
    const handler = () => setScreenW(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const isMobile = screenW < 768
  const isTablet = screenW >= 768 && screenW < 1200

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const apt = apartments.find(a => a.id === selectedApt)

  // Period price setter
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [periodForm, setPeriodForm] = useState({ dateFrom: '', dateTo: '', price: '' })
  const [periodSaving, setPeriodSaving] = useState(false)

  // Month picker (quick navigation)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())

  // How many months to display at once
  const [monthCount, setMonthCount] = useState(1)

  // Calendar booking detail popup
  const [calDetail, setCalDetail] = useState<string | null>(null) // bookingId

  // Selection mode: always on — click anchor → click end → action panel
  const [abkAnchor, setAbkAnchor] = useState<string | null>(null)
  const [abkHover, setAbkHover] = useState<string | null>(null)
  const [abkRange, setAbkRange] = useState<{ from: string; to: string } | null>(null)
  const [abkAction, setAbkAction] = useState<'booking' | null>(null)
  const [abkForm, setAbkForm] = useState({
    guestName: '', phone: '', guestsCount: 0,
    source: 'other' as BookingSourceLocal,
    cleaningFee: 60, totalAmount: '',
  })
  const [abkSaving, setAbkSaving] = useState(false)
  const [abkError, setAbkError] = useState<string | null>(null)
  const [showAbkPhoneCountry, setShowAbkPhoneCountry] = useState(false)

  // Effective month count — capped based on screen size
  const effectiveCount = isMobile ? 1 : isTablet ? Math.min(monthCount, 3) : monthCount

  // All months to display
  const monthsToShow = useMemo(
    () => Array.from({ length: effectiveCount }, (_, i) => addMonths(currentMonth, i)),
    [currentMonth, effectiveCount]
  )

  // Full date range covering all displayed months
  const rangeFrom = useMemo(() => format(startOfMonth(monthsToShow[0]), 'yyyy-MM-dd'), [monthsToShow])
  const rangeTo = useMemo(() => {
    const last = monthsToShow[monthsToShow.length - 1]
    return format(addDays(startOfMonth(last), getDaysInMonth(last) - 1), 'yyyy-MM-dd')
  }, [monthsToShow])

  const pad = (n: number) => String(n).padStart(2, '0')

  const { data: bookings } = useQuery({
    queryKey: ['cal-bookings', selectedApt, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, start_date, end_date, status, guest_name, guests_count, total_amount, cleaning_tasks(cleaning_fee)')
        .eq('apartment_id', selectedApt)
        .lte('start_date', rangeTo)
        .gte('end_date', rangeFrom)
        .neq('status', 'cancelled')
      if (error) throw error
      return data
    },
    enabled: !!selectedApt,
  })

  const { data: customPrices } = useQuery({
    queryKey: ['cal-prices', selectedApt, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_pricing')
        .select('date, price')
        .eq('apartment_id', selectedApt)
        .gte('date', rangeFrom)
        .lte('date', rangeTo)
      if (error) throw error
      return data
    },
    enabled: !!selectedApt,
  })

  const { data: blockedDates } = useQuery({
    queryKey: ['cal-blocked', selectedApt, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocked_dates').select('date')
        .eq('apartment_id', selectedApt).gte('date', rangeFrom).lte('date', rangeTo)
      if (error) throw error
      return data
    },
    enabled: !!selectedApt,
  })

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {}
    customPrices?.forEach(cp => { m[cp.date] = cp.price })
    return m
  }, [customPrices])

  const blockedMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    blockedDates?.forEach(bd => { m[bd.date] = true })
    return m
  }, [blockedDates])

  const dateMap = useMemo(() => {
    const m: Record<string, CalDayInfo> = {}
    bookings?.forEach(b => {
      const startD = parseISO(b.start_date)
      const endD = parseISO(b.end_date)
      const nights = Math.round((endD.getTime() - startD.getTime()) / 86400000)
      const cleaningFee = (b as any).cleaning_tasks?.reduce(
        (s: number, t: { cleaning_fee: number }) => s + (t.cleaning_fee ?? 0), 0
      ) ?? 0
      let d = startD
      let isFirst = true
      while (d <= endD) {
        const key = format(d, 'yyyy-MM-dd')
        const isLastDay = format(d, 'yyyy-MM-dd') === b.end_date
        m[key] = {
          status: 'accepted',
          bookingId: b.id,
          guestName: b.guest_name,
          guestsCount: b.guests_count,
          isStart: isFirst,
          isEnd: isLastDay,
          nights,
          totalAmount: (b as any).total_amount ?? null,
          cleaningFee,
          source: b.source ?? 'other',
        }
        d = addDays(d, 1)
        isFirst = false
      }
    })
    return m
  }, [bookings])

  // Live preview of the date range being selected
  const abkPreview = useMemo(() => {
    if (!abkAnchor) return null
    const end = abkHover ?? abkAnchor
    const [a, b] = abkAnchor <= end ? [abkAnchor, end] : [end, abkAnchor]
    return { from: a, to: b }
  }, [abkAnchor, abkHover])

  const exitAddMode = () => {
    setAbkAnchor(null); setAbkHover(null)
    setAbkRange(null); setAbkAction(null)
    setAbkForm({ guestName: '', phone: '', guestsCount: 0, source: 'other', cleaningFee: 60, totalAmount: '' })
    setAbkError(null)
  }

  const invalidateBlockedDates = () => qc.invalidateQueries({ queryKey: ['cal-blocked', selectedApt], exact: false })

  const invalidatePrices = () => {
    qc.invalidateQueries({ queryKey: ['cal-prices', selectedApt], exact: false })
    qc.invalidateQueries({ queryKey: ['custom-prices'] })
  }
  const invalidateBookings = () => {
    qc.invalidateQueries({ queryKey: ['cal-bookings', selectedApt], exact: false })
    qc.invalidateQueries({ queryKey: ['owner-bookings-full'] })
  }

  const handlePeriodSave = async () => {
    if (!periodForm.dateFrom || !periodForm.dateTo || !periodForm.price || !selectedApt) return
    const price = parseFloat(periodForm.price)
    if (isNaN(price) || price <= 0) return
    setPeriodSaving(true)
    const rows: { apartment_id: string; date: string; price: number }[] = []
    let d = parseISO(periodForm.dateFrom)
    const end = parseISO(periodForm.dateTo)
    while (d <= end) {
      rows.push({ apartment_id: selectedApt, date: format(d, 'yyyy-MM-dd'), price })
      d = addDays(d, 1)
    }
    await supabase.from('custom_pricing').upsert(rows, { onConflict: 'apartment_id,date' })
    setPeriodSaving(false)
    setShowPeriodModal(false)
    setPeriodForm({ dateFrom: '', dateTo: '', price: '' })
    invalidatePrices()
  }

  const handleAbkSave = async () => {
    if (!abkRange || !abkForm.guestName.trim() || !selectedApt) return
    setAbkSaving(true); setAbkError(null)
    const { data: bd, error: be } = await supabase
      .from('bookings')
      .insert({
        apartment_id: selectedApt, guest_name: abkForm.guestName.trim(),
        guest_phone: abkForm.phone.trim(), start_date: abkRange.from, end_date: abkRange.to,
        guests_count: abkForm.guestsCount || 1, status: 'accepted', source: abkForm.source,
        total_amount: abkForm.totalAmount ? parseFloat(abkForm.totalAmount) : null,
      })
      .select('id').single()
    if (be || !bd) { setAbkError(be?.message ?? 'Ошибка сохранения'); setAbkSaving(false); return }
    await supabase.from('cleaning_tasks').insert({
      booking_id: bd.id, cleaner_id: apt?.cleaner_id ?? null,
      cleaning_fee: abkForm.cleaningFee,
      payment_method: SOURCE_PAYMENT[abkForm.source] as 'owner_transfer' | 'guest_cash',
      payment_status: 'pending', status: 'pending',
    })
    setAbkSaving(false); exitAddMode(); invalidateBookings()
  }

  const handleBlock = async () => {
    if (!abkRange || !selectedApt) return
    setAbkSaving(true)
    const rows: { apartment_id: string; date: string; reason: string }[] = []
    let d = parseISO(abkRange.from)
    const endD = parseISO(abkRange.to)
    while (d <= endD) {
      rows.push({ apartment_id: selectedApt, date: format(d, 'yyyy-MM-dd'), reason: 'blocked' })
      d = addDays(d, 1)
    }
    await supabase.from('blocked_dates').upsert(rows, { onConflict: 'apartment_id,date' })
    setAbkSaving(false); exitAddMode(); invalidateBlockedDates()
  }

  const handleUnblock = async () => {
    if (!abkRange || !selectedApt) return
    setAbkSaving(true)
    const dates: string[] = []
    let d = parseISO(abkRange.from)
    const endD = parseISO(abkRange.to)
    while (d <= endD) {
      dates.push(format(d, 'yyyy-MM-dd'))
      d = addDays(d, 1)
    }
    await supabase.from('blocked_dates').delete()
      .eq('apartment_id', selectedApt).in('date', dates)
    setAbkSaving(false); exitAddMode(); invalidateBlockedDates()
  }

  // Check if range has any blocked dates (to show "Разблокировать" option)
  const hasBlockedInRange = useMemo(() => {
    if (!abkRange) return false
    let d = parseISO(abkRange.from)
    const endD = parseISO(abkRange.to)
    while (d <= endD) {
      if (blockedMap[format(d, 'yyyy-MM-dd')]) return true
      d = addDays(d, 1)
    }
    return false
  }, [abkRange, blockedMap])

  const handleDayClick = (dateStr: string, info?: CalDayInfo) => {
    // Booked cell → open booking detail
    if (info) {
      setCalDetail(info.bookingId)
      return
    }
    // If action panel is open — start a new selection
    if (abkRange) {
      setAbkRange(null); setAbkAction(null)
      setAbkAnchor(dateStr); setAbkHover(dateStr)
      return
    }
    if (!abkAnchor) {
      setAbkAnchor(dateStr); setAbkHover(dateStr)
    } else {
      const [a, b] = abkAnchor <= dateStr ? [abkAnchor, dateStr] : [dateStr, abkAnchor]
      setAbkRange({ from: a, to: b })
      setAbkAnchor(null); setAbkHover(null)
    }
  }

  const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  // Helper: compute exactly 6 week rows (padded with nulls) — ensures equal cell heights
  const computeWeeks = (monthDate: Date): (number | null)[][] => {
    const mStart = startOfMonth(monthDate)

    const dow = getDay(mStart) === 0 ? 6 : getDay(mStart) - 1
    const wks: (number | null)[][] = []
    let cur: (number | null)[] = Array(dow).fill(null)
    const mDays = getDaysInMonth(monthDate)
    for (let d = 1; d <= mDays; d++) {
      cur.push(d)
      if (cur.length === 7) { wks.push(cur); cur = [] }
    }
    if (cur.length > 0) { while (cur.length < 7) cur.push(null); wks.push(cur) }
    // Always pad to exactly 6 rows so all months have equal-height cells
    while (wks.length < 6) wks.push(Array(7).fill(null))
    return wks
  }

  // Grid rows class — for 6/год views, tells the grid to split rows evenly (flex-fill).
  const gridRowsCls = effectiveCount <= 3 ? 'grid-rows-1' : effectiveCount <= 6 ? 'grid-rows-2' : 'grid-rows-3'
  // useFlexFill: single-month and 6/год views let cells grow to fill viewport.
  // 2-3 months use fixed row heights so the card matches content (no empty space at bottom).
  const useFlexFill = effectiveCount === 1 || effectiveCount > 3
  // Fixed week-row height for 2-3 month compact view — smaller on tablet.
  const fixedRowH = effectiveCount === 2
    ? (isTablet ? 'h-[60px]' : 'h-[80px]')
    : effectiveCount === 3
      ? (isTablet ? 'h-[50px]' : 'h-[66px]')
      : ''
  // For the single-month flex-fill view, cap each row so cells stay square-ish.
  const flexMaxRowH = effectiveCount === 1 ? (isMobile ? 'max-h-[90px]' : 'max-h-[112px]') : ''

  // Month grid columns
  const gridCols = effectiveCount === 1 ? 'grid-cols-1'
    : effectiveCount === 2 ? 'grid-cols-2'
    : effectiveCount === 3 ? 'grid-cols-3'
    : effectiveCount === 6 ? 'grid-cols-3'
    : 'grid-cols-4'

  // Render a single month grid
  const renderMonthGrid = (monthDate: Date) => {
    const mYear = monthDate.getFullYear()
    const mMonth = monthDate.getMonth() + 1

    const weeks = computeWeeks(monthDate)
    const compact = effectiveCount > 1

    return (
      <div key={`${mYear}-${mMonth}`} className={`bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-card)] ${useFlexFill ? 'flex flex-col min-h-0' : ''}`}>
        {/* Month header */}
        <div className={`flex items-center justify-between border-b border-border flex-shrink-0 ${effectiveCount > 6 ? 'px-2 py-1' : compact ? 'px-3 py-1.5' : 'px-4 py-3'}`}>
          <h3
            className={`font-display font-bold capitalize ${effectiveCount > 6 ? 'text-[11px] cursor-pointer hover:text-primary transition-colors' : compact ? 'text-sm cursor-pointer hover:text-primary transition-colors' : 'text-lg'}`}
            onClick={compact ? () => { setCurrentMonth(monthDate); setMonthCount(1); setShowMonthPicker(false) } : undefined}
            title={compact ? 'Открыть этот месяц' : undefined}
          >
            {format(monthDate, 'LLLL yyyy', { locale: ru })}
          </h3>
          {compact && (
            <button
              onClick={() => { setCurrentMonth(monthDate); setMonthCount(1); setShowMonthPicker(false) }}
              className="text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-muted"
              title="Открыть этот месяц"
            >
              ↗
            </button>
          )}
          {!compact && (
            <button
              onClick={() => { setShowMonthPicker(p => !p); setPickerYear(mYear) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${showMonthPicker ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              {showMonthPicker ? 'Закрыть' : 'Выбрать месяц'}
            </button>
          )}
        </div>

        {/* Month picker (single-month mode only) */}
        {!compact && showMonthPicker && (
          <div className="px-4 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={14} /></button>
              <span className="text-sm font-bold">{pickerYear}</span>
              <button onClick={() => setPickerYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><ChevronRight size={14} /></button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'].map((m, i) => {
                const isActive = pickerYear === currentMonth.getFullYear() && i === currentMonth.getMonth()
                return (
                  <button key={i} onClick={() => { setCurrentMonth(new Date(pickerYear, i, 1)); setShowMonthPicker(false) }}
                    className={`py-2.5 rounded-xl text-xs font-semibold transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}>
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Selection hint */}
        {abkAnchor && !abkRange && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
            <p className="text-xs font-medium text-amber-800">
              ✓ Начало: <strong>{format(parseISO(abkAnchor), 'd MMMM', { locale: ru })}</strong> — нажмите конечную дату
            </p>
          </div>
        )}

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
          {WEEK_DAYS.map(d => (
            <div key={d} className={`text-center font-bold text-muted-foreground tracking-widest uppercase ${effectiveCount > 6 ? 'text-[8px] py-0.5' : compact ? 'text-[9px] py-1' : 'text-[11px] py-2'}`}>{d}</div>
          ))}
        </div>

        {/* Week rows — flex-fill for single/multi-row views; fixed height for 2-3 month compact view */}
        <div className={`divide-y divide-border ${useFlexFill ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          {weeks.map((weekDays, wi) => (
            <div key={wi} className={`grid grid-cols-7 divide-x divide-border ${useFlexFill ? `flex-1 min-h-0 ${flexMaxRowH}` : fixedRowH}`}>
              {weekDays.map((day, di) => {
                if (day === null) return <div key={di} className={`overflow-hidden min-h-0 ${isDark ? 'bg-slate-800/30' : 'bg-gray-50/60'}`} />

                const dateStr = `${mYear}-${pad(mMonth)}-${pad(day)}`
                const info = dateMap[dateStr]
                const isBooked = !!info
                const hasCustomPrice = dateStr in priceMap
                const price = priceMap[dateStr] ?? apt?.price_per_night
                const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
                const isBlocked = blockedMap[dateStr] === true

                // Connect bars across days (using date arithmetic for month-boundary safety)
                const prevDate = addDays(parseISO(dateStr), -1)
                const nextDate = addDays(parseISO(dateStr), 1)
                const prevStr = format(prevDate, 'yyyy-MM-dd')
                const nextStr = format(nextDate, 'yyyy-MM-dd')
                const connectLeft = isBooked && di > 0 && dateMap[prevStr]?.bookingId === info?.bookingId
                const _connectRight = isBooked && di < 6 && dateMap[nextStr]?.bookingId === info?.bookingId; void _connectRight
                const showName = isBooked && info && info.isStart

                const inPreview = !!abkPreview && dateStr >= abkPreview.from && dateStr <= abkPreview.to
                const isAnchor = abkAnchor === dateStr
                const inCommitted = !!abkRange && dateStr >= abkRange.from && dateStr <= abkRange.to
                const isSelected = inPreview || inCommitted

                let cellBg: string
                if (isDark) {
                  if (isAnchor) { cellBg = 'bg-amber-500 hover:bg-amber-400'
                  } else if (isSelected) { cellBg = 'bg-amber-800/60 hover:bg-amber-700/60'
                  } else if (isBlocked && !isBooked) { cellBg = 'bg-slate-600/50 hover:bg-slate-500/50'
                  } else if (isBooked) { cellBg = 'bg-slate-800/40 hover:bg-slate-700/50'
                  } else { cellBg = 'bg-slate-700/70 hover:bg-slate-600/70' }
                } else {
                  if (isAnchor) { cellBg = 'bg-amber-400 hover:bg-amber-500'
                  } else if (isSelected) { cellBg = 'bg-amber-100 hover:bg-amber-200'
                  } else if (isBlocked && !isBooked) { cellBg = 'bg-slate-100 hover:bg-slate-200'
                  } else if (isBooked) { cellBg = 'bg-white hover:bg-rose-50/60'
                  } else { cellBg = 'bg-white hover:bg-gray-50' }
                }

                const isYear = effectiveCount > 6

                return (
                  <div
                    key={di}
                    onClick={() => handleDayClick(dateStr, info)}
                    onMouseEnter={() => { if (!info && abkAnchor && !abkRange) setAbkHover(dateStr) }}
                    className={`flex flex-col min-h-0 relative select-none overflow-hidden cursor-pointer transition-colors ${isYear ? 'p-0.5' : compact ? 'px-1 pt-1 pb-0.5' : 'px-2 pt-2 pb-1'} ${cellBg}`}
                  >

                    {/* Booking stripe — solid bg with rounded ends on first/last day */}
                    {isBooked && !isSelected && (
                      <div className={`absolute inset-y-0 pointer-events-none ${
                        info!.isStart && info!.isEnd
                          ? 'left-1 right-1 rounded-xl'
                          : info!.isStart
                            ? 'left-1 right-0 rounded-l-xl'
                            : info!.isEnd
                              ? 'left-0 right-1 rounded-r-xl'
                              : 'left-0 right-0'
                      } ${isDark ? 'bg-rose-900/65' : 'bg-rose-200/70'}`} />
                    )}

                    <div className="relative flex flex-col min-h-0 flex-1">
                    {/* Day number — top left */}
                    <div className={`rounded-full flex items-center justify-center flex-shrink-0 ${isYear ? 'w-3.5 h-3.5' : compact ? 'w-5 h-5' : 'w-6 h-6'} ${isToday ? 'bg-primary' : ''}`}>
                      <span className={`font-bold leading-none ${isYear ? 'text-[8px]' : compact ? 'text-[10px]' : 'text-xs'} ${isToday ? 'text-white' : isSelected ? (isDark ? 'text-amber-300' : 'text-amber-900') : isBooked ? (isDark ? 'text-rose-300' : 'text-rose-700') : isBlocked ? (isDark ? 'text-slate-400' : 'text-slate-400') : (isDark ? 'text-slate-100' : 'text-foreground')}`}>
                        {day}
                      </span>
                    </div>

                    {/* Check-in: guest name + guests count + nights */}
                    {showName && !isSelected && !isYear && effectiveCount <= 3 && (
                      <div className="flex flex-col gap-0.5 mt-0.5 flex-shrink-0">
                        <span className={`${compact ? 'text-[9px]' : 'text-xs'} font-bold leading-tight truncate ${isDark ? 'text-rose-400' : 'text-rose-800'}`}>{info!.guestName}</span>
                        <span className={`text-[9px] leading-tight ${isDark ? 'text-rose-500' : 'text-rose-600'}`}>
                          {info!.guestsCount} чел · {info!.nights} н.
                        </span>
                      </div>
                    )}

                    {/* Check-out: rent amount + cleaning fee separately */}
                    {isBooked && info!.isEnd && !isSelected && !compact && (() => {
                      const rent = info!.totalAmount
                      const fee = info!.cleaningFee
                      return (
                        <div className="flex flex-col gap-0.5 mt-1 flex-shrink-0">
                          {rent != null && <span className={`text-[10px] font-bold leading-tight ${isDark ? 'text-rose-400' : 'text-rose-700'}`}>{fmtEur(rent)}</span>}
                          {fee > 0 && <span className={`text-[9px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>уборка {fmtEur(fee)}</span>}
                        </div>
                      )
                    })()}

                    {/* Lock icon */}
                    {isBlocked && !isBooked && !isSelected && (
                      <Lock size={isYear ? 7 : compact ? 8 : 10} className={`mt-0.5 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    )}

                    {/* Price — bottom right */}
                    {price !== undefined && !isSelected && !(isBooked && info?.source !== 'airbnb' && info?.source !== 'booking' && info?.totalAmount != null) && (
                      <span className={`mt-auto self-end leading-none ${isYear ? 'text-[8px]' : compact ? 'text-[10px]' : 'text-xs'} font-bold ${isBooked ? (hasCustomPrice ? (isDark ? 'text-rose-300' : 'text-rose-500') : (isDark ? 'text-rose-400' : 'text-rose-300')) : isBlocked ? (isDark ? 'text-slate-400' : 'text-slate-400') : (hasCustomPrice ? (isDark ? 'text-emerald-300' : 'text-emerald-600') : (isDark ? 'text-slate-300' : 'text-gray-400'))}`}>
                        {price} €
                      </span>
                    )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 xl:min-h-0 flex flex-col overflow-y-auto xl:overflow-hidden">
      {/* Header */}
      <div className="mb-2 flex-shrink-0">
        {/* Title centered */}
        <h2 className="text-2xl font-display font-bold tracking-tight text-center mb-2">
          {apt?.title ?? 'Календарь'}
        </h2>

        {/* ── Action panel — appears between title and controls when range selected ── */}
        <AnimatePresence>
          {abkRange && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="overflow-hidden mb-2"
            >
              <div className="bg-card border border-indigo-200 rounded-2xl px-4 py-2.5 flex flex-col gap-2 shadow-sm">
                {/* Range header row */}
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5 flex items-center gap-2 flex-1 min-w-0">
                    <CalendarPlus size={13} className="text-indigo-500 flex-shrink-0" />
                    <span className="text-sm text-indigo-800 font-semibold truncate">
                      {format(parseISO(abkRange.from), 'd MMM', { locale: ru })} — {format(parseISO(abkRange.to), 'd MMM yyyy', { locale: ru })}
                    </span>
                    <span className="text-xs text-indigo-400 ml-auto flex-shrink-0">
                      {(() => {
                        const nights = Math.round((parseISO(abkRange.to).getTime() - parseISO(abkRange.from).getTime()) / 86400000)
                        return `${nights} н. · ${nights + 1} д.`
                      })()}
                    </span>
                  </div>
                  <button onClick={exitAddMode} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0"><X size={15} /></button>
                </div>

                {/* 4 action buttons — horizontal */}
                {!abkAction && (
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => { setPeriodForm(f => ({ ...f, dateFrom: abkRange.from, dateTo: abkRange.to })); setShowPeriodModal(true); setAbkRange(null); setAbkAction(null) }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-emerald-50 hover:border-emerald-300 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors flex-shrink-0">
                        <Euro size={13} className="text-emerald-700" />
                      </div>
                      <div className="text-left leading-tight">
                        <div className="text-xs font-semibold text-foreground">Задать цены</div>
                        <div className="text-[10px] text-muted-foreground">€ за ночь</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setAbkAction('booking')}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-indigo-50 hover:border-indigo-300 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors flex-shrink-0">
                        <CalendarPlus size={13} className="text-indigo-700" />
                      </div>
                      <div className="text-left leading-tight">
                        <div className="text-xs font-semibold text-foreground">Добавить бронь</div>
                        <div className="text-[10px] text-muted-foreground">Заезд гостя</div>
                      </div>
                    </button>
                    <button
                      onClick={handleBlock} disabled={abkSaving}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-slate-50 hover:border-slate-300 transition-colors group disabled:opacity-60"
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors flex-shrink-0">
                        <Lock size={13} className="text-slate-500" />
                      </div>
                      <div className="text-left leading-tight">
                        <div className="text-xs font-semibold text-foreground">{abkSaving ? 'Сохраняем…' : 'Заблокировать'}</div>
                        <div className="text-[10px] text-muted-foreground">Недоступно</div>
                      </div>
                    </button>
                    <button
                      onClick={handleUnblock} disabled={abkSaving || !hasBlockedInRange}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors group ${hasBlockedInRange ? 'border-border hover:bg-rose-50 hover:border-rose-300' : 'border-dashed border-border opacity-40 cursor-not-allowed'}`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${hasBlockedInRange ? 'bg-rose-100 group-hover:bg-rose-200' : 'bg-muted'}`}>
                        <CheckCircle2 size={13} className={hasBlockedInRange ? 'text-rose-600' : 'text-muted-foreground'} />
                      </div>
                      <div className="text-left leading-tight">
                        <div className="text-xs font-semibold text-foreground">{abkSaving ? 'Сохраняем…' : 'Разблокировать'}</div>
                        <div className="text-[10px] text-muted-foreground">{hasBlockedInRange ? 'Сделать доступным' : 'Нет блоков'}</div>
                      </div>
                    </button>
                  </div>
                )}

                {/* Booking form */}
                {abkAction === 'booking' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      {(['airbnb', 'booking', 'other'] as BookingSourceLocal[]).map(s => (
                        <button key={s} type="button" onClick={() => setAbkForm(f => ({ ...f, source: s }))}
                          className={`flex-1 py-1 rounded-xl text-xs font-medium transition-colors border ${abkForm.source === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40'}`}>
                          {SOURCE_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="flex flex-col gap-0.5 col-span-2">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Гость *</label>
                        <input type="text" value={abkForm.guestName} onChange={e => setAbkForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Имя гостя" autoFocus className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Телефон</label>
                        <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                          <button type="button"
                            onClick={() => setShowAbkPhoneCountry(v => !v)}
                            className="flex-shrink-0 px-2 py-2 text-sm leading-none border-r border-border hover:bg-muted transition-colors"
                            title={detectCountry(abkForm.phone)?.name}
                          >
                            {detectCountry(abkForm.phone)?.flag ?? '🌐'}
                          </button>
                          <span className="pl-1.5 text-xs text-muted-foreground select-none">+</span>
                          <input type="tel"
                            value={abkForm.phone.replace(/^\+/, '')}
                            onChange={e => setAbkForm(f => ({ ...f, phone: '+' + e.target.value.replace(/^\+*/, '') }))}
                            placeholder=""
                            className="flex-1 bg-transparent outline-none px-1 py-2 text-sm text-foreground min-w-0" />
                        </div>
                        {showAbkPhoneCountry && detectCountry(abkForm.phone) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{detectCountry(abkForm.phone)!.flag} {detectCountry(abkForm.phone)!.name}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Гостей</label>
                        <input type="text" inputMode="numeric"
                          value={abkForm.guestsCount === 0 ? '' : String(abkForm.guestsCount)}
                          onChange={e => setAbkForm(f => ({ ...f, guestsCount: parseInt(e.target.value) || 0 }))}
                          placeholder="1" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Аренда, €</label>
                        <input type="number" min={0} step="0.01" value={abkForm.totalAmount} onChange={e => setAbkForm(f => ({ ...f, totalAmount: e.target.value }))} placeholder="0" className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Уборка, €</label>
                        <input type="number" min={0} value={abkForm.cleaningFee} onChange={e => setAbkForm(f => ({ ...f, cleaningFee: +e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    {abkError && <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-1.5">{abkError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setAbkAction(null)} className="px-3 py-1.5 rounded-xl text-sm bg-muted text-muted-foreground hover:bg-muted/70">← Назад</button>
                      <button onClick={handleAbkSave} disabled={abkSaving || !abkForm.guestName.trim()}
                        className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity">
                        {abkSaving ? 'Сохраняем…' : 'Добавить бронь →'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls row — on mobile: no spacers, stack selector + month picker vertically */}
        <div className="flex items-center gap-2">
          <div className="hidden md:block w-[72px] flex-shrink-0" />
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {/* Apartment selector */}
            {apartments.length > 1 ? (
              <select value={selectedApt} onChange={e => setSelectedApt(e.target.value)}
                className="w-full sm:w-auto sm:min-w-[180px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring">
                {apartments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            ) : <div />}
            {/* Month count picker — hidden on mobile since effectiveCount is always 1 */}
            <div className="hidden sm:flex items-center gap-1 bg-card border border-border rounded-xl p-1 self-start sm:self-auto">
              {([1, 2, 3, 6, 12] as const).map(n => (
                <button
                  key={n}
                  onClick={() => { setMonthCount(n); setShowMonthPicker(false) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${monthCount === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {n === 12 ? 'Год' : `${n}м`}
                </button>
              ))}
            </div>
          </div>
          <div className="hidden md:block w-[72px] flex-shrink-0" />
        </div>
      </div>

      {/* Legend — no spacers on mobile */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="hidden md:block w-[72px] flex-shrink-0" />
        <div className="flex-1 flex gap-3 text-[11px] font-medium text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white border border-gray-200" />Свободно</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-200" />Занято</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200" />Заблокировано</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300" />Выбрано</span>
        </div>
        <div className="hidden md:block w-[72px] flex-shrink-0" />
      </div>

      {/* Navigation + grids */}
      <div className="flex items-start gap-2 flex-1 min-h-0 overflow-hidden">
        {/* Left arrow — narrower on mobile */}
        <button
          onClick={() => { setCurrentMonth(subMonths(currentMonth, monthCount)); setShowMonthPicker(false) }}
          className="flex-shrink-0 w-8 md:w-[72px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors pt-4"
        >
          <ChevronLeft size={22} />
        </button>

        {/* Month grids — flex-fill modes: self-stretch + grid-rows; compact modes: items-start (no stretch) */}
        <div className={`flex-1 min-h-0 grid gap-3 ${gridCols} ${gridRowsCls} ${useFlexFill ? 'self-stretch' : 'items-start'}`}>
          {monthsToShow.map(m => renderMonthGrid(m))}
        </div>

        {/* Right arrow — narrower on mobile */}
        <button
          onClick={() => { setCurrentMonth(addMonths(currentMonth, monthCount)); setShowMonthPicker(false) }}
          className="flex-shrink-0 w-8 md:w-[72px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors pt-4"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Period price setter */}
      <AnimatePresence>
        {showPeriodModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
            onClick={e => { if (e.target === e.currentTarget) setShowPeriodModal(false) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Задать цены на период</h3>
                <button onClick={() => setShowPeriodModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Квартира: <strong>{apt?.title}</strong>
              </p>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">С даты</label>
                  <input type="date" value={periodForm.dateFrom}
                    onChange={e => {
                      const newFrom = e.target.value
                      setPeriodForm(f => ({
                        ...f,
                        dateFrom: newFrom,
                        // Keep dateTo or reset to dateFrom if it's before
                        dateTo: f.dateTo && f.dateTo >= newFrom ? f.dateTo : newFrom,
                      }))
                    }}
                    className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">По дату</label>
                  <input type="date" value={periodForm.dateTo} min={periodForm.dateFrom}
                    onChange={e => setPeriodForm(f => ({ ...f, dateTo: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              {periodForm.dateFrom && periodForm.dateTo && periodForm.dateTo > periodForm.dateFrom && (() => {
                const n = Math.round((parseISO(periodForm.dateTo).getTime() - parseISO(periodForm.dateFrom).getTime()) / 86400000)
                return <p className="text-xs text-muted-foreground -mt-1">🌙 {n} {n === 1 ? 'ночь' : n < 5 ? 'ночи' : 'ночей'} · {n + 1} дней</p>
              })()}

              {/* Price input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Цена за ночь, €</label>
                <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                  <Euro size={14} className="text-muted-foreground flex-shrink-0" />
                  <input type="number" min="1" value={periodForm.price}
                    onChange={e => setPeriodForm(f => ({ ...f, price: e.target.value }))}
                    className="flex-1 bg-transparent outline-none text-sm font-semibold"
                    placeholder="Например: 85"
                    autoFocus={!periodForm.price} />
                </div>
              </div>

              {/* Summary */}
              {periodForm.dateFrom && periodForm.dateTo && periodForm.price && (() => {
                const days = Math.round((parseISO(periodForm.dateTo).getTime() - parseISO(periodForm.dateFrom).getTime()) / 86400000) + 1
                const total = Math.round(days * parseFloat(periodForm.price || '0'))
                return (
                  <div className="bg-emerald-50 rounded-xl px-4 py-3 flex justify-between items-center">
                    <span className="text-xs text-emerald-800">{days} дней × {periodForm.price} €</span>
                    <span className="font-bold text-emerald-700">= {total} €</span>
                  </div>
                )
              })()}

              <button onClick={handlePeriodSave} disabled={periodSaving || !periodForm.dateFrom || !periodForm.dateTo || !periodForm.price}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                {periodSaving ? 'Сохраняем…' : 'Сохранить цены'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Calendar booking detail modal */}
      <AnimatePresence>
        {calDetail && (() => {
          const bk = bookings?.find(b => b.id === calDetail)
          if (!bk) return null
          const nights = Math.round((new Date(bk.end_date).getTime() - new Date(bk.start_date).getTime()) / 86400000)
          const cleaningFee = (bk as any).cleaning_tasks?.reduce(
            (s: number, t: { cleaning_fee: number }) => s + (t.cleaning_fee ?? 0), 0
          ) ?? 0
          const rent = (bk as any).total_amount ?? null
          const total = rent != null ? rent + cleaningFee : null
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
              onClick={e => { if (e.target === e.currentTarget) setCalDetail(null) }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg leading-tight">{bk.guest_name}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${SOURCE_COLOR[(bk as any).source] ?? 'bg-muted text-muted-foreground'}`}>
                        {SOURCE_LABELS[(bk as any).source] ?? (bk as any).source}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{apt?.title}</p>
                  </div>
                  <button onClick={() => setCalDetail(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0">
                    <X size={16} />
                  </button>
                </div>

                {/* Info */}
                <div className="px-5 py-4 flex flex-col gap-3">
                  {/* Dates & nights */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Даты</p>
                      <p className="text-sm font-semibold">
                        {format(parseISO(bk.start_date), 'd MMM', { locale: ru })} — {format(parseISO(bk.end_date), 'd MMM yyyy', { locale: ru })}
                      </p>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-center">
                      <p className="text-xl font-bold text-rose-700 leading-none">{nights}</p>
                      <p className="text-[10px] text-rose-500 mt-0.5">ночей</p>
                    </div>
                  </div>

                  {/* Guests */}
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-muted-foreground" />
                    <span className="text-sm">{bk.guests_count} {bk.guests_count === 1 ? 'гость' : bk.guests_count < 5 ? 'гостя' : 'гостей'}</span>
                  </div>

                  {/* Financials */}
                  <div className="bg-muted/40 rounded-xl px-4 py-3 flex flex-col gap-2 mt-1">
                    {rent != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Аренда</span>
                        <span className="text-sm font-semibold">{rent} €</span>
                      </div>
                    )}
                    {cleaningFee > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Уборка</span>
                        <span className="text-sm font-semibold text-slate-600">{cleaningFee} €</span>
                      </div>
                    )}
                    {total != null && (
                      <div className="flex items-center justify-between border-t border-border pt-2 mt-1">
                        <span className="text-sm font-bold">Итого</span>
                        <span className="text-base font-bold text-emerald-700">{total} €</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

// ─── Dashboard Overview ───────────────────────────────────────────────────────

function DashboardOverview({
  bookings, apartments, onGoTo, ownerId,
}: {
  bookings: BookingRow[]; apartments: Apartment[]; onGoTo: (s: Section) => void; ownerId: string
}) {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd')
  const qc = useQueryClient()
  const { user: authUser } = useAuth()

  const { data: profileData } = useQuery({
    queryKey: ['profile', authUser?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('name').eq('id', authUser!.id).maybeSingle()
      return data
    },
    enabled: !!authUser?.id,
  })

  const rawName = authUser?.email?.split('@')[0] ?? ''
  const emailName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : 'друг'
  const profileFirstName = profileData?.name?.trim().split(/\s+/)[0] ?? null
  const displayName = profileFirstName || emailName

  // Fetch expenses for net income calculation
  const aptIds = apartments.map(a => a.id)
  const { data: dashExpenses = [] } = useQuery({
    queryKey: ['dash-expenses', ownerId, aptIds.join(',')],
    queryFn: async () => {
      if (!aptIds.length) return []
      const { data } = await supabase.from('all_expenses').select('amount,paid_date,apartment_id').in('apartment_id', aptIds)
      return (data ?? []) as { amount: number; paid_date: string; apartment_id: string }[]
    },
    enabled: aptIds.length > 0,
  })

  // Hover tooltip state for chart area
  const [hoverDayIdx, setHoverDayIdx] = useState<number | null>(null)
  const chartAreaRef = useRef<HTMLDivElement>(null)

  // Month selector
  const [selMonth, setSelMonth] = useState(today.getMonth())
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [dashModal, setDashModal] = useState<null | 'upcoming' | 'debt' | 'cleanings'>(null)
  const [debtFilterApt, setDebtFilterApt] = useState('all')
  const [debtFilterSource, setDebtFilterSource] = useState('all')
  const [eventBooking, setEventBooking] = useState<BookingRow | null>(null)
  const [showRevenueModal, setShowRevenueModal] = useState(false)
  const [revenueFromDate, setRevenueFromDate] = useState(`${today.getFullYear()}-01-01`)
  const [showTopMonthPicker, setShowTopMonthPicker] = useState(false)
  const prevMonth = () => {
    if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1) }
    else setSelMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1) }
    else setSelMonth(m => m + 1)
  }

  const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
  const MONTHS_RU_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

  // Revenue helper
  const calcRevenue = (b: BookingRow) => {
    if (b.total_amount && b.total_amount > 0) return b.total_amount
    const apt = apartments.find(a => a.id === b.apartment_id)
    const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
    return (apt?.price_per_night ?? 0) * nights
  }

  // Debt data
  // Platform bookings (airbnb/booking): owner pays cleaner → track owner_transfer unpaid
  // Private bookings (other): guest pays in cash → track any unpaid task
  const isPlatformSource = (src: string) => src === 'airbnb' || src === 'booking'
  const hasDebt = (b: BookingRow) =>
    isPlatformSource(b.source)
      ? b.cleaning_tasks.some(t => t.payment_method === 'owner_transfer' && t.payment_status !== 'paid')
      : b.cleaning_tasks.some(t => t.payment_status !== 'paid')
  const owedTotal = bookings.reduce((sum, b) =>
    sum + b.cleaning_tasks
      .filter(t => t.payment_method === 'owner_transfer' && t.payment_status !== 'paid')
      .reduce((s, t) => s + t.cleaning_fee, 0), 0)
  const debtBookings = bookings.filter(hasDebt)
  const debtPlatformBookings = debtBookings.filter(b => isPlatformSource(b.source))
  const debtPrivateBookings  = debtBookings.filter(b => !isPlatformSource(b.source))
  const debtPlatformCount    = debtPlatformBookings.length
  const debtPrivateCount     = debtPrivateBookings.length
  const debtPlatformSum      = debtPlatformBookings.reduce((s, b) =>
    s + b.cleaning_tasks.filter(t => t.payment_method === 'owner_transfer' && t.payment_status !== 'paid').reduce((a, t) => a + t.cleaning_fee, 0), 0)
  const debtPrivateSum       = debtPrivateBookings.reduce((s, b) =>
    s + b.cleaning_tasks.filter(t => t.payment_status !== 'paid').reduce((a, t) => a + t.cleaning_fee, 0), 0)

  // Debt modal: unique apartments list for filter
  const debtApts = (() => {
    const seen = new Set<string>()
    const result: { id: string; title: string }[] = []
    debtBookings.forEach(b => {
      if (!seen.has(b.apartment_id)) {
        seen.add(b.apartment_id)
        result.push({ id: b.apartment_id, title: b.apartments.title })
      }
    })
    return result
  })()

  // Filtered bookings for debt modal
  const filteredDebtBookings = debtBookings.filter(b => {
    if (debtFilterApt !== 'all' && b.apartment_id !== debtFilterApt) return false
    if (debtFilterSource === 'platform' && b.source !== 'airbnb' && b.source !== 'booking') return false
    if (debtFilterSource === 'private' && (b.source === 'airbnb' || b.source === 'booking')) return false
    return true
  })

  // Group filtered debt bookings by apartment
  const debtGrouped = (() => {
    const map = new Map<string, { title: string; bookings: BookingRow[] }>()
    filteredDebtBookings.forEach(b => {
      if (!map.has(b.apartment_id)) map.set(b.apartment_id, { title: b.apartments.title, bookings: [] })
      map.get(b.apartment_id)!.bookings.push(b)
    })
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }))
  })()

  // Stats for selected month
  // Revenue attributed to the month the guest checks OUT (end_date)
  const monthBookings = bookings.filter(b => {
    if (b.status !== 'accepted') return false
    const d = parseISO(b.end_date)
    return d.getMonth() === selMonth && d.getFullYear() === selYear
  })
  const monthRevenue = monthBookings.reduce((s, b) => s + calcRevenue(b), 0)
  // Check-ins still count by start_date
  const monthCheckIns = bookings.filter(b => {
    if (b.status !== 'accepted') return false
    const d = parseISO(b.start_date)
    return d.getMonth() === selMonth && d.getFullYear() === selYear
  }).length
  const monthCleanings = monthBookings.length  // checkouts = cleanings
  // Expenses for selected month
  const selMonthStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}`
  const monthExpenses = dashExpenses.filter(e => e.paid_date.startsWith(selMonthStr)).reduce((s, e) => s + e.amount, 0)
  // Net income = revenue − expenses
  const actualIncome = monthRevenue - monthExpenses


  // Upcoming bookings
  const upcoming = bookings
    .filter(b => b.end_date >= todayStr && b.status === 'accepted')
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  // Today's events
  const todayCheckIns = bookings.filter(b => b.status === 'accepted' && b.start_date === todayStr)
  const todayCheckOuts = bookings.filter(b => b.status === 'accepted' && b.end_date === todayStr)
  const soonCheckIns = bookings
    .filter(b => b.status === 'accepted' && b.start_date > todayStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5)

  // Per-day revenue for line chart
  const dayData = useMemo(() => {
    const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    const dim = getDaysInMonth(new Date(selYear, selMonth, 1))

    // Spread revenue per night across all stay days (instead of spike on check-in)
    const revByDate: Record<string, number> = {}
    const stayByDate: Record<string, BookingRow[]> = {}   // all bookings occupying each day
    const checkInByDate: Record<string, BookingRow[]> = {} // only check-in bookings

    bookings.filter(b => b.status === 'accepted').forEach(b => {
      const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
      if (nights === 0) return
      const apt = apartments.find(a => a.id === b.apartment_id)
      const totalRev = (b.total_amount && b.total_amount > 0) ? b.total_amount : (apt?.price_per_night ?? 0) * nights
      const revPerNight = totalRev / nights

      for (let n = 0; n < nights; n++) {
        const d = addDays(parseISO(b.start_date), n)
        if (d.getFullYear() !== selYear || d.getMonth() !== selMonth) continue
        const dStr = format(d, 'yyyy-MM-dd')
        revByDate[dStr] = (revByDate[dStr] ?? 0) + revPerNight
        if (!stayByDate[dStr]) stayByDate[dStr] = []
        if (!stayByDate[dStr].some(x => x.id === b.id)) stayByDate[dStr].push(b)
      }
      // track check-in day separately (for dot tooltips)
      if (parseISO(b.start_date).getFullYear() === selYear && parseISO(b.start_date).getMonth() === selMonth) {
        const dStr = b.start_date
        if (!checkInByDate[dStr]) checkInByDate[dStr] = []
        checkInByDate[dStr].push(b)
      }
    })

    return Array.from({ length: dim }, (_, i) => {
      const dayNum = i + 1
      const date = new Date(selYear, selMonth, dayNum)
      const dateStr = format(date, 'yyyy-MM-dd')
      return {
        dayNum, dateStr, date,
        bookings: stayByDate[dateStr] ?? [],   // all bookings occupying this day
        checkIns: checkInByDate[dateStr] ?? [], // only check-ins (for tooltip dots)
        rev: revByDate[dateStr] ?? 0,
        wd: WEEKDAYS_RU[date.getDay()],
      }
    })
  }, [bookings, selYear, selMonth, apartments])

  const chartRawMax = Math.max(...dayData.map(d => d.rev), 100)
  const yStep = chartRawMax <= 400 ? 100 : chartRawMax <= 800 ? 200 : chartRawMax <= 1500 ? 300 : 500
  const yMax = Math.ceil(chartRawMax / yStep) * yStep
  const yLabels = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0]

  // ── Chart computation: per-apartment lines + x-axis band data ─────────────────
  const APT_CHART_COLORS = ['hsl(var(--primary))', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#db2777']

  const chartCalc = useMemo(() => {
    const dim = dayData.length
    const toX = (i: number) => dim > 1 ? (i / (dim - 1)) * 100 : 50
    const toY = (rev: number) => yMax > 0 ? (1 - rev / yMax) * 84 + 8 : 90

    // Step-line with rounded top corners at check-in / check-out transitions
    const buildLine = (days: { rev: number }[]) => {
      if (days.length === 0) return ''
      const r = 1.8  // corner radius in SVG viewport units (0–100 scale)
      let path = `M ${toX(0)} ${toY(days[0].rev)}`
      for (let i = 1; i < days.length; i++) {
        const x      = toX(i)
        const y      = toY(days[i].rev)
        const prevRev = days[i - 1].rev
        const prevY  = toY(prevRev)
        const isRising  = prevRev === 0 && days[i].rev > 0
        const isFalling = prevRev > 0  && days[i].rev === 0
        if (isRising) {
          // Horizontal to base of step, rise, then arc the top-left corner
          path += ` L ${x} ${prevY}`
          path += ` L ${x} ${y + r}`
          path += ` A ${r} ${r} 0 0 1 ${x + r} ${y}`
        } else if (isFalling) {
          // Approach top-right corner, arc it, then fall
          path += ` L ${x - r} ${prevY}`
          path += ` A ${r} ${r} 0 0 1 ${x} ${prevY + r}`
          path += ` L ${x} ${y}`
        } else {
          path += ` L ${x} ${y}`
        }
      }
      return path
    }

    // Total aggregated line
    const totalLine = buildLine(dayData)
    const totalArea = totalLine ? `${totalLine} L 100 92 L 0 92 Z` : ''

    // Per-apartment data
    const aptLines = apartments.map((apt, aptIdx) => {
      const color = APT_CHART_COLORS[aptIdx % APT_CHART_COLORS.length]
      const revByDate: Record<string, number> = {}
      bookings.filter(b => b.status === 'accepted' && b.apartment_id === apt.id).forEach(b => {
        const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
        if (nights === 0) return
        const totalRev = (b.total_amount && b.total_amount > 0) ? b.total_amount : apt.price_per_night * nights
        const rPN = totalRev / nights
        for (let n = 0; n < nights; n++) {
          const d = addDays(parseISO(b.start_date), n)
          if (d.getFullYear() !== selYear || d.getMonth() !== selMonth) continue
          const ds = format(d, 'yyyy-MM-dd')
          revByDate[ds] = (revByDate[ds] ?? 0) + rPN
        }
      })
      const days = dayData.map(d => ({ rev: revByDate[d.dateStr] ?? 0 }))
      const line = buildLine(days)
      const area = line ? `${line} L 100 92 L 0 92 Z` : ''

      // Stay periods clipped to this month
      const periods = bookings
        .filter(b => b.status === 'accepted' && b.apartment_id === apt.id)
        .flatMap(b => {
          const mFirst = new Date(selYear, selMonth, 1)
          const mLast  = new Date(selYear, selMonth + 1, 0)
          const s = parseISO(b.start_date), e = parseISO(b.end_date)
          if (e <= mFirst || s > mLast) return []
          const cs = s < mFirst ? mFirst : s
          const ce = e > mLast ? mLast : addDays(e, -1)
          return [{ startDay: cs.getDate() - 1, endDay: ce.getDate() - 1 }]
        })

      return { apt, color, line, area, periods, hasData: days.some(d => d.rev > 0) }
    })

    // day → color map for x-axis band highlighting
    const dayBandColor = new Array(dim).fill(null) as (string | null)[]
    aptLines.forEach(({ color, periods }) => {
      periods.forEach(({ startDay, endDay }) => {
        for (let d = startDay; d <= Math.min(endDay, dim - 1); d++) dayBandColor[d] = color
      })
    })

    return { toX, toY, totalLine, totalArea, aptLines, dayBandColor }
  }, [dayData, yMax, apartments, bookings, selYear, selMonth])

  const { toX: toSvgX, toY: toSvgY, totalLine: linePath, totalArea: areaPath,
          aptLines: aptChartLines, dayBandColor } = chartCalc
  const isMultiApt = apartments.length > 1

  // Mark cleaning task as paid
  const markPaid = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('cleaning_tasks')
        .update({ payment_status: 'paid' } as never).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-bookings-full'] }),
  })

  // Revenue from date
  const completedBookings = bookings.filter(b =>
    b.status === 'accepted' && b.end_date <= todayStr && b.start_date >= revenueFromDate)
  const actualRevenue = completedBookings.reduce((sum, b) => sum + calcRevenue(b), 0)

  // Current active booking (guest staying now)
  const currentBooking = bookings.find(b =>
    b.status === 'accepted' && b.start_date <= todayStr && b.end_date > todayStr) ?? null
  const currentApt = currentBooking
    ? apartments.find(a => a.id === currentBooking.apartment_id) ?? null : null
  const currentAptImage = (currentApt as Apartment & { apartment_images?: ApartmentImage[] } | null)
    ?.apartment_images?.[0]?.image_url ?? null
  const currentProgress = currentBooking ? (() => {
    const total = Math.round(
      (parseISO(currentBooking.end_date).getTime() - parseISO(currentBooking.start_date).getTime()) / 86400000)
    const passed = Math.max(0, Math.round((today.getTime() - parseISO(currentBooking.start_date).getTime()) / 86400000))
    return { total, passed, pct: total > 0 ? Math.round((passed / total) * 100) : 0 }
  })() : null

  // Tomorrow check-ins
  const tomorrowCheckIns = bookings.filter(b => b.status === 'accepted' && b.start_date === tomorrowStr)

  return (
    <div className="flex flex-col gap-3 xl:flex-1 xl:min-h-0 xl:overflow-hidden relative pb-4 xl:pb-0">

      {/* Decorative leaf background — top-right */}
      <div className="absolute top-0 right-0 w-72 h-64 pointer-events-none select-none overflow-hidden z-0">
        <svg viewBox="0 0 260 220" className="w-full h-full" style={{ opacity: 0.07 }}>
          <ellipse cx="200" cy="30" rx="80" ry="22" transform="rotate(-38 200 30)" fill="hsl(var(--primary))" />
          <ellipse cx="230" cy="70" rx="90" ry="20" transform="rotate(-45 230 70)" fill="hsl(var(--primary))" />
          <ellipse cx="215" cy="110" rx="85" ry="18" transform="rotate(-50 215 110)" fill="hsl(var(--primary))" />
          <ellipse cx="195" cy="15" rx="70" ry="16" transform="rotate(-28 195 15)" fill="hsl(var(--primary))" />
          <ellipse cx="240" cy="145" rx="75" ry="16" transform="rotate(-55 240 145)" fill="hsl(var(--primary))" />
        </svg>
      </div>

      {/* ── Row 1: Greeting + month selector ── */}
      <div className="flex items-center justify-between flex-shrink-0 relative z-30 gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground truncate">
          Привет {displayName}! 👋
        </h1>
        <div className="relative">
          <button
            onClick={() => setShowTopMonthPicker(p => !p)}
            className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-1.5 shadow-sm hover:shadow-md transition-shadow">
            <CalendarDays size={14} className="text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{MONTHS_RU[selMonth]} {selYear}</span>
            <ChevronDown size={13} className={`text-muted-foreground transition-transform ${showTopMonthPicker ? 'rotate-180' : ''}`} />
          </button>
          {showTopMonthPicker && (
            <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-xl p-3 z-50 w-60"
              onMouseLeave={() => setShowTopMonthPicker(false)}>
              <div className="flex items-center justify-between mb-2.5">
                <button onClick={() => setSelYear(y => y - 1)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={14} /></button>
                <span className="text-sm font-bold">{selYear}</span>
                <button onClick={() => setSelYear(y => y + 1)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><ChevronRight size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MONTHS_RU.map((m, i) => (
                  <button key={i} onClick={() => { setSelMonth(i); setShowTopMonthPicker(false) }}
                    className={`py-2 rounded-lg text-[11px] font-semibold transition-colors ${selMonth === i && selYear === today.getFullYear() ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: 5 stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3 flex-shrink-0 relative z-10">
        {/* Общий доход */}
        <button onClick={() => setShowRevenueModal(true)}
          className="bg-card border border-border rounded-2xl p-3 md:p-4 text-left hover:shadow-md transition-all shadow-sm flex flex-col min-h-[96px] md:min-h-[116px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs text-muted-foreground leading-snug">Общий доход за {MONTHS_RU[selMonth].toLowerCase()}</p>
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-500 flex-shrink-0"><BarChart2 size={15} /></div>
          </div>
          <p className="text-xl md:text-2xl font-bold text-foreground leading-tight">{fmtEur(monthRevenue)}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">{monthBookings.length} заезд{monthBookings.length === 1 ? '' : monthBookings.length < 5 ? 'а' : 'ов'}</p>
          <p className="text-[10px] text-transparent select-none mt-0.5">&nbsp;</p>
        </button>

        {/* Заезды */}
        <button onClick={() => setDashModal('upcoming')}
          className="bg-card border border-border rounded-2xl p-3 md:p-4 text-left hover:shadow-md transition-all shadow-sm flex flex-col min-h-[96px] md:min-h-[116px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs text-muted-foreground">Заезды</p>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-500 flex-shrink-0"><CalendarDays size={15} /></div>
          </div>
          <p className="text-2xl font-bold text-foreground leading-tight">{monthCheckIns}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">в этом месяце</p>
          <p className="text-[10px] text-transparent select-none mt-0.5">&nbsp;</p>
        </button>

        {/* Уборки */}
        <button onClick={() => setDashModal('cleanings')}
          className="bg-card border border-border rounded-2xl p-3 md:p-4 text-left hover:shadow-md transition-all shadow-sm flex flex-col min-h-[96px] md:min-h-[116px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs text-muted-foreground">Уборки</p>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 flex-shrink-0"><Brush size={15} /></div>
          </div>
          <p className="text-2xl font-bold text-foreground leading-tight">{monthCleanings}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">в этом месяце</p>
          <p className="text-[10px] text-transparent select-none mt-0.5">&nbsp;</p>
        </button>

        {/* Долги */}
        <button onClick={() => setDashModal('debt')}
          className="bg-card border border-border rounded-2xl p-3 md:p-4 text-left hover:shadow-md transition-all shadow-sm flex flex-col min-h-[96px] md:min-h-[116px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs text-muted-foreground">Долги</p>
            <div className="p-1.5 rounded-lg bg-red-50 text-red-400 flex-shrink-0"><ClipboardX size={15} /></div>
          </div>
          <p className="text-xl md:text-2xl font-bold text-foreground leading-tight">{fmtEur(owedTotal)}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
            {debtPlatformCount > 0 && <span>{debtPlatformCount} airbnb/booking</span>}
            {debtPlatformCount > 0 && debtPrivateCount > 0 && <span className="mx-0.5">·</span>}
            {debtPrivateCount > 0 && <span>{debtPrivateCount} частн.</span>}
            {debtBookings.length === 0 && <span>нет долгов</span>}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            {debtPlatformSum > 0 && <span>{fmtEur(debtPlatformSum)}</span>}
            {debtPlatformSum > 0 && debtPrivateSum > 0 && <span className="mx-0.5">/</span>}
            {debtPrivateSum > 0 && <span>{fmtEur(debtPrivateSum)}</span>}
          </p>
        </button>

        {/* Актуальный доход (чистая прибыль) */}
        <div className="bg-card border border-border rounded-2xl p-3 md:p-4 shadow-sm flex flex-col min-h-[96px] md:min-h-[116px]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs text-muted-foreground leading-snug">Чистая прибыль</p>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 flex-shrink-0"><TrendingUp size={15} /></div>
          </div>
          <p className={`text-xl md:text-2xl font-bold leading-tight ${actualIncome < 0 ? 'text-destructive' : 'text-foreground'}`}>{fmtEur(actualIncome)}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">доход − расходы</p>
          {monthExpenses > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">−{fmtEur(monthExpenses)} расходов</p>
          )}
        </div>
      </div>

      {/* ── Row 3: Line chart + Events ── */}
      <div className="flex flex-col xl:flex-row gap-3 xl:flex-[4] xl:min-h-0 relative z-10">

        {/* Line chart */}
        <div className="xl:flex-[3] bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden min-w-0 min-h-[220px] xl:min-h-0">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2 flex-shrink-0">
            <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ChevronLeft size={14} /></button>
            <p className="text-sm font-semibold text-foreground flex-1">
              Доход за {MONTHS_RU[selMonth].toLowerCase()} {selYear}
            </p>
            {monthRevenue > 0 && (
              <span className="text-base font-bold text-primary">{fmtEur(monthRevenue)}</span>
            )}
            <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ChevronRight size={14} /></button>
          </div>

          <div className="flex flex-1 min-h-0 px-3 pb-2">
            {/* Y-axis labels */}
            <div className="flex flex-col justify-between w-12 flex-shrink-0 pb-9 pr-1.5 text-right">
              {yLabels.map((v, i) => (
                <span key={i} className="text-[9px] text-muted-foreground leading-none">{v} €</span>
              ))}
            </div>

            {/* Chart area + x-axis */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* SVG chart + hover overlay */}
              <div className="flex-1 relative min-h-0"
                ref={chartAreaRef}
                onMouseMove={e => {
                  const rect = chartAreaRef.current?.getBoundingClientRect()
                  if (!rect || rect.width === 0) return
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  setHoverDayIdx(Math.round(ratio * (dayData.length - 1)))
                }}
                onMouseLeave={() => setHoverDayIdx(null)}
                onTouchStart={e => {
                  const rect = chartAreaRef.current?.getBoundingClientRect()
                  if (!rect || rect.width === 0) return
                  const ratio = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width))
                  setHoverDayIdx(Math.round(ratio * (dayData.length - 1)))
                  e.preventDefault()
                }}
                onTouchMove={e => {
                  const rect = chartAreaRef.current?.getBoundingClientRect()
                  if (!rect || rect.width === 0) return
                  const ratio = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width))
                  setHoverDayIdx(Math.round(ratio * (dayData.length - 1)))
                  e.preventDefault()
                }}
                onTouchEnd={() => setHoverDayIdx(null)}
                style={{ touchAction: 'none' }}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                  <defs>
                    <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.22 }} />
                      <stop offset="100%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.02 }} />
                    </linearGradient>
                    {aptChartLines.map((al, i) => (
                      <linearGradient key={al.apt.id} id={`aptGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: al.color, stopOpacity: 0.18 }} />
                        <stop offset="100%" style={{ stopColor: al.color, stopOpacity: 0.02 }} />
                      </linearGradient>
                    ))}
                  </defs>
                  {/* Horizontal gridlines */}
                  {[25, 50, 75].map(p => (
                    <line key={p} x1="0" y1={toSvgY(yMax * p / 100)} x2="100" y2={toSvgY(yMax * p / 100)}
                      stroke="hsl(var(--border))" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                  ))}
                  <line x1="0" y1="92" x2="100" y2="92"
                    stroke="hsl(var(--border))" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                  {/* Single apartment */}
                  {!isMultiApt && areaPath && <path d={areaPath} fill="url(#chartAreaGrad)" />}
                  {!isMultiApt && linePath && (
                    <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  {/* Multiple apartments */}
                  {isMultiApt && aptChartLines.map((al, i) => al.hasData && (
                    <g key={al.apt.id}>
                      {al.area && <path d={al.area} fill={`url(#aptGrad${i})`} />}
                      {al.line && <path d={al.line} fill="none" stroke={al.color} strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
                    </g>
                  ))}
                  {/* Hover vertical line */}
                  {hoverDayIdx !== null && dayData[hoverDayIdx]?.bookings.length > 0 && (
                    <line
                      x1={toSvgX(hoverDayIdx)} y1="8" x2={toSvgX(hoverDayIdx)} y2="92"
                      stroke="hsl(var(--muted-foreground))" strokeWidth="0.5"
                      strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity="0.5" />
                  )}
                </svg>

                {/* Hover tooltip */}
                {hoverDayIdx !== null && (() => {
                  const d = dayData[hoverDayIdx]
                  if (!d || d.bookings.length === 0) return null
                  const xPct = toSvgX(hoverDayIdx)
                  const tipLeft = xPct < 30 ? '0%' : xPct > 70 ? 'auto' : '50%'
                  const tipRight = xPct > 70 ? '0%' : 'auto'
                  const tipTransform = xPct >= 30 && xPct <= 70 ? 'translateX(-50%)' : 'none'
                  return (
                    <div className="absolute top-1 z-40 pointer-events-none"
                      style={{ left: tipLeft === 'auto' ? 'auto' : `calc(${xPct}% + ${xPct < 30 ? '4px' : '0px'})`,
                               right: tipRight === '0%' ? '0' : 'auto',
                               transform: tipTransform }}>
                      <div className="bg-card border border-border rounded-xl shadow-xl px-3 py-2.5 min-w-[190px]">
                        <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">
                          {format(d.date, 'd MMMM yyyy', { locale: ru })}
                        </p>
                        {d.bookings.map((b, bi) => {
                          const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
                          const isCheckIn  = b.start_date === d.dateStr
                          const isCheckOut = b.end_date   === d.dateStr
                          return (
                            <div key={b.id} className={bi > 0 ? 'mt-2 pt-2 border-t border-border' : ''}>
                              <p className="text-xs font-bold text-foreground flex items-center gap-1">
                                {isCheckIn ? '🟢' : isCheckOut ? '🔴' : '📍'} {b.guest_name}
                                {isMultiApt && <span className="text-[10px] font-normal text-muted-foreground">· {b.apartments.title}</span>}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {format(parseISO(b.start_date), 'd MMM', { locale: ru })} → {format(parseISO(b.end_date), 'd MMM', { locale: ru })} · {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}
                              </p>
                              {b.total_amount ? (
                                <p className="text-xs font-bold text-emerald-700 mt-0.5">{fmtEur(b.total_amount ?? 0)}</p>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {dayData.every(d => d.rev === 0) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground/40">Нет данных за {MONTHS_RU_SHORT[selMonth]}</p>
                  </div>
                )}
              </div>

              {/* X-axis: day numbers + weekday names */}
              <div className="flex-shrink-0 flex" style={{ height: '32px' }}>
                {dayData.map((d, i) => {
                  const isToday = d.dateStr === todayStr
                  const color = dayBandColor[i]
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-center gap-px overflow-hidden">
                      <span className={`flex items-center justify-center rounded-full leading-none font-semibold text-[9px] w-4 h-4 flex-shrink-0
                        ${isToday ? 'bg-primary text-primary-foreground' : ''}`}
                        style={!isToday && color ? { color } : !isToday ? { color: 'hsl(var(--muted-foreground))' } : {}}>
                        {d.dayNum}
                      </span>
                      <span className="text-[8px] font-medium leading-none"
                        style={isToday ? { color: 'hsl(var(--primary))', fontWeight: 700 }
                          : color ? { color, opacity: 0.7 }
                          : { color: 'hsl(var(--muted-foreground))', opacity: 0.5 }}>
                        {d.wd}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Gantt stay bars — one row per apartment */}
              <div className="flex-shrink-0 flex flex-col gap-0.5 pt-1 pb-1">
                {aptChartLines.filter(al => al.hasData).map(al => (
                  <div key={al.apt.id} className="relative" style={{ height: '16px' }}>
                    {al.periods.map((p, pi) => {
                      const dim = dayData.length
                      // Use same coordinate system as the SVG step-line chart
                      const leftPct  = toSvgX(p.startDay)
                      const rightPct = p.endDay + 1 < dim ? toSvgX(p.endDay + 1) : 100
                      const widthPct = rightPct - leftPct
                      // Find the booking for this period
                      const booking = bookings.find(b =>
                        b.status === 'accepted' && b.apartment_id === al.apt.id &&
                        (() => {
                          const mFirst = new Date(selYear, selMonth, 1)
                          const mLast  = new Date(selYear, selMonth + 1, 0)
                          const s = parseISO(b.start_date), e = parseISO(b.end_date)
                          if (e <= mFirst || s > mLast) return false
                          const cs = s < mFirst ? mFirst : s
                          return cs.getDate() - 1 === p.startDay
                        })()
                      )
                      const nights = booking
                        ? Math.round((parseISO(booking.end_date).getTime() - parseISO(booking.start_date).getTime()) / 86400000)
                        : 0
                      const label = booking
                        ? `${format(parseISO(booking.start_date), 'd MMM', { locale: ru })} – ${format(parseISO(booking.end_date), 'd MMM', { locale: ru })} · ${nights}н. · ${booking.total_amount ? fmtEur(booking.total_amount ?? 0) : booking.guest_name}`
                        : ''
                      return (
                        <div key={pi}
                          className="absolute top-0 rounded-full flex items-center overflow-hidden cursor-default"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%`, height: '16px', backgroundColor: al.color, opacity: 0.85 }}
                          title={label}>
                          <span className="text-white text-[9px] font-semibold px-1.5 truncate leading-none select-none">
                            {booking?.guest_name ?? ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* Apartment legend */}
              <div className="flex-shrink-0 flex items-center gap-3 px-1 pb-1 flex-wrap">
                {aptChartLines.filter(al => al.hasData).map(al => {
                  // Summarize stays in month
                  const monthBookings_ = bookings.filter(b => {
                    if (b.status !== 'accepted' || b.apartment_id !== al.apt.id) return false
                    const mFirst = new Date(selYear, selMonth, 1)
                    const mLast  = new Date(selYear, selMonth + 1, 0)
                    const s = parseISO(b.start_date), e = parseISO(b.end_date)
                    return !(e <= mFirst || s > mLast)
                  })
                  return (
                    <div key={al.apt.id} className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: al.color }} />
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {al.apt.title}
                        {monthBookings_.length > 0 && (
                          <span className="ml-1 text-[9px] opacity-70">
                            {monthBookings_.length} заезд{monthBookings_.length > 1 ? 'а' : ''}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Ближайшие события */}
        <div className="xl:flex-[2] bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[180px] xl:min-h-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <p className="text-sm font-semibold text-foreground">Ближайшие события</p>
            <CalendarCheck size={15} className="text-muted-foreground" />
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-0.5">
            {/* Сегодня */}
            {(todayCheckIns.length > 0 || todayCheckOuts.length > 0) && (
              <div className="mb-1">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1 px-1">
                  Сегодня • {format(today, 'd MMMM', { locale: ru })}
                </p>
                <div className="flex flex-col gap-1">
                  {todayCheckIns.map(b => (
                    <button key={`ci-${b.id}`} onClick={() => setEventBooking(b)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted/60 transition-colors text-left w-full">
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0"><CalendarDays size={13} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{b.guest_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{b.apartments.title} · заезд</p>
                      </div>
                      <ChevronRight size={13} className="text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                  {todayCheckOuts.map(b => (
                    <button key={`co-${b.id}`} onClick={() => setEventBooking(b)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted/60 transition-colors text-left w-full">
                      <div className="p-1.5 rounded-lg bg-green-50 text-green-600 flex-shrink-0"><Brush size={13} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{b.guest_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{b.apartments.title} · выезд</p>
                      </div>
                      <ChevronRight size={13} className="text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Завтра */}
            {tomorrowCheckIns.length > 0 && (
              <div className="mb-1">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1 px-1">
                  Завтра • {format(addDays(today, 1), 'd MMMM', { locale: ru })}
                </p>
                <div className="flex flex-col gap-1">
                  {tomorrowCheckIns.map(b => (
                    <button key={`t-${b.id}`} onClick={() => setEventBooking(b)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted/60 transition-colors text-left w-full">
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-500 flex-shrink-0"><CalendarDays size={13} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{b.guest_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{b.apartments.title} · заезд</p>
                      </div>
                      <ChevronRight size={13} className="text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Скоро */}
            {soonCheckIns.filter(b => b.start_date > tomorrowStr).slice(0, 3).map(b => {
              const daysUntil = Math.round((parseISO(b.start_date).getTime() - today.getTime()) / 86400000)
              return (
                <button key={`s-${b.id}`} onClick={() => setEventBooking(b)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted/60 transition-colors text-left w-full">
                  <div className="p-1.5 rounded-lg bg-secondary text-muted-foreground flex-shrink-0"><CalendarDays size={13} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{b.guest_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.apartments.title}</p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground flex-shrink-0">+{daysUntil}д</span>
                </button>
              )
            })}
            {todayCheckIns.length === 0 && todayCheckOuts.length === 0 &&
              tomorrowCheckIns.length === 0 && soonCheckIns.length === 0 && (
              <p className="text-xs text-muted-foreground/40 text-center py-6">Нет ближайших событий</p>
            )}
          </div>
          <button onClick={() => setDashModal('upcoming')}
            className="flex-shrink-0 flex items-center justify-end gap-1 px-4 py-2.5 text-xs font-semibold text-primary hover:opacity-80 border-t border-border transition-opacity">
            Все события →
          </button>
        </div>
      </div>

      {/* ── Row 4: Current apartment + Quick actions ── */}
      <div className="flex flex-col md:flex-row gap-3 md:flex-[1.5] md:min-h-0 relative z-10">

        {/* Текущая квартира */}
        <div className="md:flex-[3] bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden min-w-0 min-h-[100px] md:min-h-0">
          <p className="text-sm font-semibold px-5 pt-4 pb-0 flex-shrink-0">Текущая квартира</p>
          {currentBooking && currentApt ? (
            <div className="flex gap-4 p-4 flex-1 min-h-0">
              <div className="w-28 rounded-xl overflow-hidden flex-shrink-0 bg-secondary self-stretch">
                {currentAptImage
                  ? <img src={currentAptImage} alt={currentApt.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-3xl opacity-20">🏠</div>
                }
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-foreground">{currentApt.title}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Сейчас заселена</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(parseISO(currentBooking.start_date), 'd MMM.', { locale: ru })}</span>
                  <div className="flex-1 border-t border-dashed border-border" />
                  <span>{format(parseISO(currentBooking.end_date), 'd MMM.', { locale: ru })}</span>
                </div>
                {currentProgress && (
                  <>
                    <div className="relative h-5 bg-muted rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${currentProgress.pct}%`, background: 'hsl(var(--primary) / 0.85)' }} />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-normal">
                        {currentProgress.pct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{currentProgress.total} {currentProgress.total === 1 ? 'ночь' : currentProgress.total < 5 ? 'ночи' : 'ночей'}</span>
                      <span>{currentProgress.total - currentProgress.passed} {currentProgress.total - currentProgress.passed === 1 ? 'ночь' : 'ночи'} осталось</span>
                    </div>
                  </>
                )}
                <div className="flex gap-4 text-[10px] text-muted-foreground">
                  <span>📅 Заезд: {format(parseISO(currentBooking.start_date), 'd MMM. yyyy', { locale: ru })}</span>
                  <span>📅 Выезд: {format(parseISO(currentBooking.end_date), 'd MMM. yyyy', { locale: ru })}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground/40">Нет активных заездов</p>
            </div>
          )}
        </div>

        {/* Быстрые действия */}
        <div className="md:flex-[2] bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[100px] md:min-h-0">
          <p className="text-sm font-semibold px-5 pt-4 pb-3 flex-shrink-0">Быстрые действия</p>
          <div className="flex gap-2 px-4 pb-4 flex-1 items-center justify-around">
            {[
              { icon: PlusCircle,  label: 'Добавить\nбронирование', action: () => onGoTo('bookings') },
              { icon: Home,        label: 'Добавить\nквартиру',      action: () => onGoTo('apartments') },
              { icon: Brush,       label: 'Добавить\nуборку',        action: () => onGoTo('cleaning') },
              { icon: FileText,    label: 'Добавить\nрасход',        action: () => setDashModal('debt') },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} onClick={action}
                className="flex flex-col items-center gap-2 hover:opacity-70 transition-opacity flex-1 min-w-0">
                <Icon size={28} className="text-primary flex-shrink-0" strokeWidth={1.5} />
                <span className="text-[10px] font-medium text-foreground text-center leading-tight whitespace-pre-line">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Developer footer ── */}
      <div className="flex-shrink-0 flex items-center justify-center py-1 relative z-10">
        <p className="text-[10px] text-muted-foreground/40 select-none">
          Разработано · <span className="font-medium text-muted-foreground/60">Rafael Babaew</span>
        </p>
      </div>

      {/* ── Modal: Upcoming ── */}
      <AnimatePresence>
        {dashModal === 'upcoming' && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm px-4 pb-4 sm:pb-0"
            onClick={e => { if (e.target === e.currentTarget) setDashModal(null) }}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-semibold">Ближайшие заезды ({upcoming.length})</h3>
                <button onClick={() => setDashModal(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
              </div>
              <div className="overflow-y-auto divide-y divide-border">
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Предстоящих заездов нет</p>
                ) : upcoming.map(b => {
                  const nights = Math.round((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000)
                  const isNow = b.start_date <= todayStr
                  const daysUntil = Math.round((new Date(b.start_date).getTime() - today.getTime()) / 86400000)
                  return (
                    <div key={b.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base text-foreground">{b.guest_name}</span>
                            {isNow
                              ? <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">● сейчас</span>
                              : daysUntil === 1
                                ? <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">завтра</span>
                                : daysUntil > 1
                                  ? <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">через {daysUntil} дн.</span>
                                  : null
                            }
                            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
                              {SOURCE_LABELS[b.source] ?? b.source}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground/70">{b.apartments.title}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>{format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM yyyy', { locale: ru })}</span>
                            <span>·</span><span>{nights} н.</span><span>·</span><span>{b.guests_count} гостей</span>
                          </div>
                          {b.guest_phone && (
                            <a href={`tel:${b.guest_phone}`} className="text-sm text-primary hover:underline font-medium w-fit">
                              📞 {b.guest_phone}
                            </a>
                          )}
                        </div>
                        {b.total_amount ? (
                          <div className="text-right flex-shrink-0 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                            <p className="text-[10px] text-emerald-700 font-medium uppercase tracking-wide">Аренда</p>
                            <p className="text-lg font-bold text-emerald-700">{fmtEur(b.total_amount ?? 0)}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: Debt ── */}
      <AnimatePresence>
        {dashModal === 'debt' && (() => {
          // Compute footer stats from filtered bookings (source-aware task selection)
          const relevantTasks = (b: BookingRow) =>
            isPlatformSource(b.source)
              ? b.cleaning_tasks.filter(t => t.payment_method === 'owner_transfer')
              : b.cleaning_tasks.filter(t => t.payment_status !== 'paid')
          let fPaid = 0, fUnpaid = 0
          filteredDebtBookings.forEach(b => relevantTasks(b).forEach(t => {
            const fee = t.cleaning_fee ?? 0
            if (t.payment_status === 'paid') fPaid += fee; else fUnpaid += fee
          }))
          const chipCls = (active: boolean) =>
            `px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm px-4 pb-4 sm:pb-0"
              onClick={e => { if (e.target === e.currentTarget) setDashModal(null) }}>
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
                className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                  <div>
                    <h3 className="font-semibold">Долг за уборку</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      К оплате: <span className="font-bold text-destructive">{fmtEur(owedTotal)}</span>
                      {debtPlatformCount > 0 && <span className="ml-2 text-muted-foreground">{debtPlatformCount} сайт · {fmtEur(debtPlatformSum)}</span>}
                      {debtPrivateCount > 0 && <span className="ml-2 text-muted-foreground">{debtPrivateCount} частн. · {fmtEur(debtPrivateSum)}</span>}
                    </p>
                  </div>
                  <button onClick={() => setDashModal(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
                </div>

                {/* Filters */}
                <div className="px-5 py-3 border-b border-border flex-shrink-0 flex flex-col gap-2">
                  {/* Apartment filter */}
                  {debtApts.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mr-0.5">Квартира:</span>
                      <button className={chipCls(debtFilterApt === 'all')} onClick={() => setDebtFilterApt('all')}>Все</button>
                      {debtApts.map(a => (
                        <button key={a.id} className={chipCls(debtFilterApt === a.id)} onClick={() => setDebtFilterApt(a.id)}>
                          {a.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Source filter */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mr-0.5">Тип:</span>
                    <button className={chipCls(debtFilterSource === 'all')} onClick={() => setDebtFilterSource('all')}>Все</button>
                    <button className={chipCls(debtFilterSource === 'platform')} onClick={() => setDebtFilterSource('platform')}>Airbnb / Booking</button>
                    <button className={chipCls(debtFilterSource === 'private')} onClick={() => setDebtFilterSource('private')}>Частные</button>
                  </div>
                </div>

                {/* Grouped content */}
                <div className="overflow-y-auto flex-1 min-h-0">
                  {filteredDebtBookings.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">
                      {debtBookings.length === 0 ? 'Долгов нет 🎉' : 'Нет записей по фильтру'}
                    </p>
                  ) : debtGrouped.map(group => {
                    const groupUnpaid = group.bookings.reduce((s, b) => {
                      const tasks = isPlatformSource(b.source)
                        ? b.cleaning_tasks.filter(t => t.payment_method === 'owner_transfer' && t.payment_status !== 'paid')
                        : b.cleaning_tasks.filter(t => t.payment_status !== 'paid')
                      return s + tasks.reduce((a, t) => a + t.cleaning_fee, 0)
                    }, 0)
                    return (
                      <div key={group.id}>
                        {/* Apartment group header */}
                        <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-5 py-2 flex items-center justify-between border-b border-border">
                          <div className="flex items-center gap-2">
                            <Home size={13} className="text-muted-foreground" />
                            <span className="text-xs font-semibold text-foreground">{group.title}</span>
                            <span className="text-[10px] text-muted-foreground">{group.bookings.length} бронир.</span>
                          </div>
                          {groupUnpaid > 0 && (
                            <span className="text-xs font-bold text-destructive">{fmtEur(groupUnpaid)}</span>
                          )}
                        </div>
                        {/* Bookings in this group */}
                        <div className="divide-y divide-border">
                          {group.bookings.map(b => {
                            const isPlatform = isPlatformSource(b.source)
                            // Platform: show owner_transfer tasks (owner owes cleaner)
                            // Private: show all unpaid tasks (guest owes in cash)
                            const tasks = isPlatform
                              ? b.cleaning_tasks.filter(t => t.payment_method === 'owner_transfer')
                              : b.cleaning_tasks.filter(t => t.payment_status !== 'paid')
                            return (
                              <div key={b.id} className="px-5 py-3 flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-semibold text-sm truncate">{b.guest_name}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
                                      {SOURCE_LABELS[b.source] ?? b.source}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground flex-shrink-0">выезд {b.end_date}</span>
                                </div>
                                {tasks.map(t => {
                                  const isOwnerTask = t.payment_method === 'owner_transfer'
                                  const unpaidColor = isOwnerTask ? 'bg-red-50' : 'bg-amber-50'
                                  const paidColor   = isOwnerTask ? 'bg-emerald-50' : 'bg-purple-50'
                                  const unpaidLabel = isOwnerTask ? '💸 Вы должны оплатить' : '💳 Гость платит наличными'
                                  const paidLabel   = isOwnerTask ? '✓ Оплачено' : '✓ Гость заплатил'
                                  const unpaidAmtCls = isOwnerTask ? 'text-destructive' : 'text-amber-700'
                                  const paidAmtCls   = isOwnerTask ? 'text-emerald-700' : 'text-purple-700'
                                  return (
                                    <div key={t.id} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${t.payment_status === 'paid' ? paidColor : unpaidColor}`}>
                                      <div>
                                        <p className="text-xs font-medium">{t.payment_status === 'paid' ? paidLabel : unpaidLabel}</p>
                                        <p className="text-[10px] text-muted-foreground">{t.status === 'done' ? '✓ выполнена' : '⏳ ожидает'}</p>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className={`font-bold text-sm ${t.payment_status === 'paid' ? paidAmtCls : unpaidAmtCls}`}>{fmtEur(t.cleaning_fee)}</span>
                                        {t.payment_status !== 'paid' && isOwnerTask && (
                                          <button onClick={() => markPaid.mutate(t.id)} disabled={markPaid.isPending}
                                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                                            Оплатить
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Footer balance */}
                <div className="border-t border-border bg-muted/30 px-5 py-3 flex-shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide">
                      Итого {filteredDebtBookings.length !== debtBookings.length ? '(фильтр)' : ''}
                    </p>
                    <div className="flex items-center gap-3">
                      {fPaid > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-emerald-700 font-medium">Оплачено</span>
                          <span className="text-sm font-bold text-emerald-700">{fmtEur(fPaid)}</span>
                        </div>
                      )}
                      {fUnpaid > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-destructive font-medium">К оплате</span>
                          <span className="text-sm font-bold text-destructive">{fmtEur(fUnpaid)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </motion.div>
            </div>
          )
        })()}
      </AnimatePresence>

      {/* ── Modal: Cleanings (без учёта уборки) ── */}
      <AnimatePresence>
        {dashModal === 'cleanings' && (() => {
          // Bookings checking out in selected month with no cleaning task
          const noCleaningBookings = bookings.filter(b => {
            if (b.status !== 'accepted') return false
            const end = parseISO(b.end_date)
            const inMonth = end.getMonth() === selMonth && end.getFullYear() === selYear
            return inMonth && b.cleaning_tasks.length === 0
          }).sort((a, b) => a.end_date.localeCompare(b.end_date))
          const withCleaning = bookings.filter(b => {
            if (b.status !== 'accepted') return false
            const end = parseISO(b.end_date)
            return end.getMonth() === selMonth && end.getFullYear() === selYear && b.cleaning_tasks.length > 0
          })
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm px-4 pb-4 sm:pb-0"
              onClick={e => { if (e.target === e.currentTarget) setDashModal(null) }}>
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
                className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                  <div>
                    <h3 className="font-semibold">Уборки за {MONTHS_RU[selMonth].toLowerCase()} {selYear}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {withCleaning.length} учтено · <span className={noCleaningBookings.length > 0 ? 'text-orange-600 font-semibold' : ''}>{noCleaningBookings.length} без уборки</span>
                    </p>
                  </div>
                  <button onClick={() => setDashModal(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto divide-y divide-border">
                  {noCleaningBookings.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-2xl mb-2">✓</p>
                      <p className="text-sm text-emerald-700 font-medium">Все уборки учтены!</p>
                    </div>
                  ) : (
                    <>
                      <div className="px-5 py-3 bg-orange-50">
                        <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Без уборки — {noCleaningBookings.length} заездов</p>
                      </div>
                      {noCleaningBookings.map(b => {
                        const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
                        return (
                          <div key={b.id} className="px-5 py-4 flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-sm text-foreground">{b.guest_name}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
                                  {SOURCE_LABELS[b.source] ?? b.source}
                                </span>
                              </div>
                              <p className="text-sm text-foreground/70">{b.apartments.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM', { locale: ru })} · {nights} н.
                              </p>
                            </div>
                            <div className="flex-shrink-0 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-center">
                              <p className="text-[10px] text-orange-700 font-medium">выезд</p>
                              <p className="text-base font-bold text-orange-700">{b.end_date.slice(8)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {withCleaning.length > 0 && (
                    <>
                      <div className="px-5 py-3 bg-emerald-50">
                        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Уборка учтена — {withCleaning.length} заездов</p>
                      </div>
                      {withCleaning.map(b => {
                        const task = b.cleaning_tasks[0]
                        return (
                          <div key={b.id} className="px-5 py-3 flex items-center justify-between gap-3 opacity-70">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-medium text-sm text-foreground">{b.guest_name}</span>
                                <span className="text-[10px] text-emerald-700">✓ учтено</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{b.apartments.title} · выезд {format(parseISO(b.end_date), 'd MMM', { locale: ru })}</p>
                            </div>
                            {task && <span className="text-sm font-bold text-muted-foreground flex-shrink-0">{fmtEur(task.cleaning_fee)}</span>}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )
        })()}
      </AnimatePresence>

      {/* ── Modal: Event detail ── */}
      <AnimatePresence>
        {eventBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
            onClick={e => { if (e.target === e.currentTarget) setEventBooking(null) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${SOURCE_COLOR[eventBooking.source] ?? 'bg-muted text-muted-foreground'}`}>
                    {SOURCE_LABELS[eventBooking.source] ?? eventBooking.source}
                  </span>
                  <h3 className="font-semibold text-foreground">{eventBooking.guest_name}</h3>
                </div>
                <button onClick={() => setEventBooking(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
              </div>
              {/* Body */}
              <div className="px-5 py-4 flex flex-col gap-3">
                {/* Dates */}
                <div className="flex items-center gap-3 bg-secondary/60 rounded-xl px-4 py-3">
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Заезд</p>
                    <p className="text-sm font-bold">{format(parseISO(eventBooking.start_date), 'd MMM yyyy', { locale: ru })}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Выезд</p>
                    <p className="text-sm font-bold">{format(parseISO(eventBooking.end_date), 'd MMM yyyy', { locale: ru })}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Ночей</p>
                    <p className="text-sm font-bold text-primary">
                      {Math.round((parseISO(eventBooking.end_date).getTime() - parseISO(eventBooking.start_date).getTime()) / 86400000)}
                    </p>
                  </div>
                </div>
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Квартира</p>
                    <p className="font-semibold mt-0.5">{eventBooking.apartments.title}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Гостей</p>
                    <p className="font-semibold mt-0.5">{eventBooking.guests_count}</p>
                  </div>
                  {eventBooking.guest_phone && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Телефон</p>
                      <p className="font-medium mt-0.5">{eventBooking.guest_phone}</p>
                    </div>
                  )}
                  {eventBooking.total_amount && eventBooking.total_amount > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Сумма</p>
                      <p className="font-bold text-primary mt-0.5">{eventBooking.total_amount} €</p>
                    </div>
                  )}
                </div>
                {eventBooking.owner_notes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-amber-700 font-medium mb-0.5">Заметка</p>
                    <p className="text-xs text-amber-900">{eventBooking.owner_notes}</p>
                  </div>
                )}
              </div>
              <div className="px-5 pb-4">
                <button onClick={() => setEventBooking(null)}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: Revenue ── */}
      <AnimatePresence>
        {showRevenueModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
            onClick={e => { if (e.target === e.currentTarget) setShowRevenueModal(false) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Актуальный заработок</h3>
                <button onClick={() => setShowRevenueModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-emerald-700">{fmtEur(actualRevenue)}</p>
                <p className="text-xs text-emerald-800/70 mt-1">{completedBookings.length} завершённых заездов</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Считать с даты</label>
                <input type="date" value={revenueFromDate} max={todayStr}
                  onChange={e => setRevenueFromDate(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-2">
                {[{ label: 'С начала года', v: `${today.getFullYear()}-01-01` }, { label: 'Всё время', v: '2020-01-01' }].map(q => (
                  <button key={q.label} onClick={() => setRevenueFromDate(q.v)}
                    className="flex-1 py-2 rounded-xl text-xs font-medium border border-border hover:bg-muted transition-colors">
                    {q.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowRevenueModal(false)}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                Готово
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Apartments Section ───────────────────────────────────────────────────────

function ApartmentsSection({
  apartments, bookings, ownerId, onRefresh,
}: {
  apartments: Apartment[]; bookings: BookingRow[]; ownerId: string; onRefresh: () => void
}) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Apartment | null>(null)
  const [pricingApt, setPricingApt] = useState<Apartment | null>(null)

  const occupancyMap = useMemo(() => {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const daysInM = getDaysInMonth(now)
    const map: Record<string, number> = {}
    apartments.forEach(apt => {
      const seen = new Set<string>()
      bookings.filter(b => b.apartment_id === apt.id && b.status === 'accepted').forEach(b => {
        let d = parseISO(b.start_date)
        while (d < parseISO(b.end_date)) {
          const key = format(d, 'yyyy-MM-dd')
          const mStart = format(monthStart, 'yyyy-MM-dd')
          const mEnd = format(addDays(monthStart, daysInM - 1), 'yyyy-MM-dd')
          if (!seen.has(key) && key >= mStart && key <= mEnd) { seen.add(key); }
          d = addDays(d, 1)
        }
      })
      map[apt.id] = Math.round((seen.size / daysInM) * 100)
    })
    return map
  }, [apartments, bookings])

  const togglePublic = useMutation({
    mutationFn: async ({ id, is_public }: { id: string; is_public: boolean }) => {
      const { error } = await supabase.from('apartments').update({ is_public }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['owner-apartments'] }); onRefresh() },
  })

  const deleteApt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('apartments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['owner-apartments'] }); onRefresh() },
  })

  const AMENITY_LABELS: Record<string, string> = {
    wifi: 'WiFi', kitchen: 'Кухня', parking: 'Parking', balcony: 'Балкон',
    tv: 'TV', washer: 'Стирка', dishwasher: 'Посудомойка', ac: 'Кондиц.',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h2 className="text-xl font-display font-semibold">Квартиры</h2>
        <button onClick={() => { setEditTarget(null); setModalOpen(true) }}
          className="btn-primary rounded-xl px-3 py-2 text-sm flex items-center gap-1.5 flex-shrink-0">
          <Plus size={15} /> <span className="hidden sm:inline">Добавить квартиру</span><span className="sm:hidden">Добавить</span>
        </button>
      </div>

      {!apartments.length ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          Квартир пока нет. Добавьте первую!
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {apartments.map(apt => {
              const occ = occupancyMap[apt.id] ?? 0
              const amenities = (apt.amenities ?? []).slice(0, 3)
              const coverUrl = apt.apartment_images?.[0]?.image_url ?? null

              return (
                <motion.div key={apt.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-card)] flex flex-col">
                  {/* Cover photo — static, no hover overlay */}
                  <div className="relative h-40 bg-secondary overflow-hidden">
                    {coverUrl ? (
                      <img src={coverUrl} alt={apt.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl opacity-20">🏠</span>
                      </div>
                    )}
                    {/* Occupancy badge */}
                    <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-bold text-foreground">
                      {occ}%
                    </div>
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/50">
                      <div className="h-full bg-primary transition-all" style={{ width: `${occ}%` }} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <h3 className="font-semibold text-foreground">{apt.title}</h3>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={10} /> {apt.address}
                    </p>
                    <p className="text-primary font-semibold text-sm">
                      {apt.price_per_night > 0 ? `${fmtEur(apt.price_per_night)}/ночь` : '— €/ночь'}
                    </p>
                    {amenities.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {amenities.map(a => (
                          <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {AMENITY_LABELS[a] ?? a}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 mt-auto pt-2 border-t border-border flex-wrap">
                      <button onClick={() => { setEditTarget(apt); setModalOpen(true) }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-medium bg-muted text-muted-foreground hover:bg-secondary transition-colors">
                        <Pencil size={12} /> Изменить
                      </button>
                      <button onClick={() => setPricingApt(apt)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-medium bg-muted text-muted-foreground hover:bg-secondary transition-colors">
                        <Euro size={12} /> Цены
                      </button>
                      <button onClick={() => togglePublic.mutate({ id: apt.id, is_public: !apt.is_public })}
                        className="p-1.5 rounded-xl bg-muted text-muted-foreground hover:bg-secondary transition-colors" title={apt.is_public ? 'Скрыть' : 'Опубликовать'}>
                        {apt.is_public ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button onClick={() => confirm(`Удалить «${apt.title}»? Все брони тоже удалятся!`) && deleteApt.mutate(apt.id)}
                        className="p-1.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <ApartmentModal initial={editTarget} ownerId={ownerId}
            onClose={() => setModalOpen(false)} onSaved={onRefresh} />
        )}
        {pricingApt && (
          <PricingModal apartment={pricingApt} onClose={() => setPricingApt(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Edit Booking Modal ───────────────────────────────────────────────────────

type EditBookingForm = {
  guest_name: string; guest_phone: string; start_date: string; end_date: string
  guests_count: number; source: BookingSourceLocal; total_amount: number; owner_notes: string
}

function EditBookingModal({ booking, onClose, onSaved }: {
  booking: BookingRow; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<EditBookingForm>({
    guest_name: booking.guest_name,
    guest_phone: booking.guest_phone ?? '',
    start_date: booking.start_date,
    end_date: booking.end_date,
    guests_count: booking.guests_count,
    source: (booking.source as BookingSourceLocal) ?? 'other',
    total_amount: booking.total_amount ?? 0,
    owner_notes: booking.owner_notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPhoneCountry, setShowPhoneCountry] = useState(false)
  const set = <K extends keyof EditBookingForm>(k: K, v: EditBookingForm[K]) => setForm(f => ({ ...f, [k]: v }))

  // Derived nights count
  const nights = (form.start_date && form.end_date && form.end_date > form.start_date)
    ? Math.round((parseISO(form.end_date).getTime() - parseISO(form.start_date).getTime()) / 86400000)
    : 0

  // String states for linked amount fields (avoids stuck "0" and supports decimals)
  const [rentalStr, setRentalStr] = useState(() =>
    booking.total_amount ? String(booking.total_amount) : ''
  )
  const [nightlyStr, setNightlyStr] = useState(() => {
    const n0 = (booking.start_date && booking.end_date && booking.end_date > booking.start_date)
      ? Math.round((parseISO(booking.end_date).getTime() - parseISO(booking.start_date).getTime()) / 86400000)
      : 0
    if (booking.total_amount && n0 > 0)
      return String(Math.round(booking.total_amount / n0 * 100) / 100)
    return ''
  })
  const [cleaningStr, setCleaningStr] = useState(
    String(booking.cleaning_tasks[0]?.cleaning_fee ?? '')
  )

  // Normalize decimal separator (comma → dot) for European input
  const parseDecimal = (val: string) => parseFloat(val.replace(',', '.'))

  // When rental changes → recalculate nightly (precise to cent)
  const handleRentalChange = (val: string) => {
    setRentalStr(val)
    const r = parseDecimal(val)
    if (!isNaN(r) && r > 0 && nights > 0) {
      const nightly = r / nights
      setNightlyStr((Math.round(nightly * 100) / 100).toFixed(2))
    } else setNightlyStr('')
  }

  // When nightly changes → recalculate rental (precise to cent)
  const handleNightlyChange = (val: string) => {
    setNightlyStr(val)
    const p = parseDecimal(val)
    if (!isNaN(p) && p > 0 && nights > 0) {
      const rental = p * nights
      setRentalStr((Math.round(rental * 100) / 100).toFixed(2))
    }
  }

  // When dates change → recalculate nightly from current rental
  useEffect(() => {
    const r = parseDecimal(rentalStr)
    if (!isNaN(r) && r > 0 && nights > 0) {
      setNightlyStr((Math.round(r / nights * 100) / 100).toFixed(2))
    } else setNightlyStr('')
  }, [form.start_date, form.end_date]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.guest_name.trim() || !form.start_date || !form.end_date) { setError('Заполните имя гостя и даты'); return }
    if (form.end_date <= form.start_date) { setError('Выезд должен быть позже заезда'); return }
    setSaving(true); setError(null)

    const totalAmount = parseDecimal(rentalStr)
    const { error: err } = await supabase.from('bookings').update({
      guest_name: form.guest_name.trim(),
      guest_phone: form.guest_phone.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      guests_count: form.guests_count,
      source: form.source,
      total_amount: !isNaN(totalAmount) && totalAmount > 0 ? totalAmount : null,
      owner_notes: form.owner_notes.trim() || null,
    } as never).eq('id', booking.id)

    if (err) { setError(err.message); setSaving(false); return }

    // Update cleaning task: fee and/or payment_method
    if (booking.cleaning_tasks[0]) {
      const newFee = parseFloat(cleaningStr)
      const feeChanged = !isNaN(newFee) && newFee !== booking.cleaning_tasks[0].cleaning_fee
      const sourceChanged = form.source !== booking.source
      if (feeChanged || sourceChanged) {
        await supabase.from('cleaning_tasks').update({
          ...(feeChanged ? { cleaning_fee: newFee } : {}),
          ...(sourceChanged ? { payment_method: SOURCE_PAYMENT[form.source] as 'owner_transfer' | 'guest_cash' } : {}),
        }).eq('id', booking.cleaning_tasks[0].id)
      }
    }

    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm px-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card rounded-2xl shadow-[var(--shadow-card-hover)] w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold">Редактировать бронирование</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{booking.apartments.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Source */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Источник</label>
            <div className="flex gap-2">
              {(['airbnb', 'booking', 'other'] as BookingSourceLocal[]).map(s => (
                <button key={s} type="button" onClick={() => set('source', s)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors border ${form.source === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40'}`}>
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Guest name + phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Гость *</label>
              <input type="text" value={form.guest_name}
                onChange={e => set('guest_name', e.target.value)}
                required className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Телефон</label>
              <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <button type="button"
                  onClick={() => setShowPhoneCountry(v => !v)}
                  className="flex-shrink-0 px-2.5 py-2 text-base leading-none border-r border-border hover:bg-muted transition-colors"
                  title={detectCountry(form.guest_phone)?.name}
                >
                  {detectCountry(form.guest_phone)?.flag ?? '🌐'}
                </button>
                <span className="pl-2 text-sm text-muted-foreground select-none">+</span>
                <input type="tel"
                  value={form.guest_phone.replace(/^\+/, '')}
                  onChange={e => set('guest_phone', '+' + e.target.value.replace(/^\+*/, ''))}
                  placeholder=""
                  className="flex-1 bg-transparent outline-none px-1 py-2 text-sm text-foreground min-w-0" />
              </div>
              {showPhoneCountry && detectCountry(form.guest_phone) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detectCountry(form.guest_phone)!.flag} {detectCountry(form.guest_phone)!.name}
                </p>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Заезд *</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Выезд *</label>
              <input type="date" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)} required className={inputCls} />
            </div>
          </div>
          {form.start_date && form.end_date && form.end_date > form.start_date && (() => {
            const nights = Math.round((parseISO(form.end_date).getTime() - parseISO(form.start_date).getTime()) / 86400000)
            return <p className="text-xs text-muted-foreground -mt-1">🌙 {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}</p>
          })()}

          {/* Guests + amounts */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Гостей</label>
              <input type="number" min={1} max={20} value={form.guests_count}
                onChange={e => set('guests_count', Math.max(1, +e.target.value))} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Аренда, €</label>
              <input type="text" inputMode="decimal" value={rentalStr} placeholder="0"
                onChange={e => handleRentalChange(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Уборка, €</label>
              <input type="text" inputMode="decimal" value={cleaningStr} placeholder="0"
                onChange={e => setCleaningStr(e.target.value)} className={inputCls} />
            </div>
          </div>
          {/* Price per night — linked to rental ÷ nights */}
          <div className="grid grid-cols-3 gap-3">
            <div />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                Цена за ночь, €
                {nights > 0 && <span className="text-muted-foreground/60 font-normal normal-case">({nights} н.)</span>}
              </label>
              <input type="text" inputMode="decimal" value={nightlyStr} placeholder="0"
                onChange={e => handleNightlyChange(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Заметки хозяина</label>
            <textarea rows={2} value={form.owner_notes} onChange={e => set('owner_notes', e.target.value)}
              placeholder="Особые пожелания..." className={`${inputCls} resize-none`} />
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm bg-muted text-muted-foreground hover:bg-muted/70">Отмена</button>
            <button type="submit" disabled={saving} className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-60">
              {saving ? 'Сохраняем…' : 'Сохранить изменения'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Bookings Section ─────────────────────────────────────────────────────────

function BookingsSection({
  bookings, isLoading, onRefresh, onAddBooking, apartments,
}: {
  bookings: BookingRow[]; isLoading: boolean
  onRefresh: () => void; onAddBooking: () => void; apartments: Apartment[]
}) {
  const qc = useQueryClient()
  const [editingBooking, setEditingBooking] = useState<BookingRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<'active' | 'archive'>('active')
  const [search, setSearch] = useState('')
  const [aptFilter, setAptFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(5)

  const today = new Date().toISOString().slice(0, 10)

  // Apartment photo map
  const photoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of apartments) {
      const imgs = [...(a.apartment_images ?? [])].sort((x, y) => x.order_index - y.order_index)
      if (imgs[0]) m[a.id] = imgs[0].image_url
    }
    return m
  }, [apartments])

  const deleteBooking = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bookings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { setDeleteError(null); setDeletingId(null); onRefresh(); qc.invalidateQueries({ queryKey: ['owner-bookings-full'] }) },
    onError: (err: Error) => setDeleteError(err.message),
  })

  // Tab counts
  const counts = useMemo(() => ({
    active: bookings.filter(b => b.status === 'accepted' && b.end_date >= today).length,
    archive: bookings.filter(b => b.end_date < today && b.status === 'accepted').length,
  }), [bookings, today])

  // Filtered list
  const filtered = useMemo(() => {
    // Active: upcoming/current, ascending (nearest first)
    // Archive: past, descending (most recent first)
    let list: typeof bookings
    if (statusFilter === 'archive') {
      list = [...bookings]
        .filter(b => b.end_date < today && b.status === 'accepted')
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
    } else {
      list = [...bookings]
        .filter(b => b.status === 'accepted' && b.end_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(b =>
        b.guest_name.toLowerCase().includes(q) ||
        b.apartments.title.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
      )
    }
    if (aptFilter !== 'all') list = list.filter(b => b.apartment_id === aptFilter)
    if (sourceFilter !== 'all') list = list.filter(b => b.source === sourceFilter)
    if (dateFrom) list = list.filter(b => b.end_date >= dateFrom)
    if (dateTo) list = list.filter(b => b.start_date <= dateTo)
    return list
  }, [bookings, statusFilter, search, aptFilter, sourceFilter, dateFrom, dateTo, today])

  useEffect(() => { setPage(1) }, [statusFilter, search, aptFilter, sourceFilter, dateFrom, dateTo])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  // Unique apartments for dropdown
  const aptOptions = useMemo(() => {
    const seen = new Set<string>()
    return bookings.filter(b => { if (seen.has(b.apartment_id)) return false; seen.add(b.apartment_id); return true })
  }, [bookings])



  // Smart page list (up to 7 buttons with ellipsis)
  const pageList = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | '…')[] = [1]
    if (page > 3) pages.push('…')
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) pages.push(p)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
    return pages
  }, [page, totalPages])

  const tabs = [
    { id: 'active' as const, label: 'Актуальные', count: counts.active },
    { id: 'archive' as const, label: 'Архив', count: counts.archive },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-display font-semibold">Бронирования</h2>
        <button onClick={onAddBooking} className="btn-primary rounded-xl px-3 py-2 text-sm flex items-center gap-1.5 flex-shrink-0">
          <Plus size={15} /> <span className="hidden sm:inline">Добавить вручную</span><span className="sm:hidden">Добавить</span>
        </button>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 text-sm">
          <XCircle size={16} className="flex-shrink-0" />
          <span>Ошибка удаления: {deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setStatusFilter(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 ${statusFilter === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}>
            {t.label}
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${statusFilter === t.id ? 'bg-white/20 text-white' : 'bg-background text-foreground'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-2 bg-background">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по гостю, квартире или ID..."
            className="flex-1 text-sm bg-transparent outline-none min-w-0" />
          {search && <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={aptFilter} onChange={e => setAptFilter(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring flex-1 min-w-[140px]">
            <option value="all">Все квартиры</option>
            {aptOptions.map(b => <option key={b.apartment_id} value={b.apartment_id}>{b.apartments.title}</option>)}
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring flex-1 min-w-[130px]">
            <option value="all">Все платформы</option>
            <option value="airbnb">Airbnb</option>
            <option value="booking">Booking.com</option>
            <option value="other">Частный</option>
          </select>
          <div className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 bg-background w-full">
            <CalendarDays size={14} className="text-muted-foreground flex-shrink-0" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm bg-transparent outline-none flex-1 min-w-0" />
            <span className="text-muted-foreground text-xs">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm bg-transparent outline-none flex-1 min-w-0" />
          </div>
        </div>
      </div>

      {/* Booking list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-2xl animate-pulse bg-muted" />)}</div>
      ) : !filtered.length ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          {!bookings.length
            ? <><p className="mb-3">Бронирований пока нет</p><button onClick={onAddBooking} className="btn-primary rounded-xl px-4 py-2 text-sm inline-flex items-center gap-1.5"><Plus size={14} />Добавить первую бронь</button></>
            : <p>Нет бронирований по выбранным фильтрам</p>
          }
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {paginated.map(b => {
              const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
              const startDate = parseISO(b.start_date)
              const endDate = parseISO(b.end_date)
              const photo = photoMap[b.apartment_id]
              const nightly = b.total_amount && nights > 0 ? Math.round(b.total_amount / nights) : null
              return (
                <div key={b.id} className="bg-card border border-border rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 shadow-[var(--shadow-card)] hover:shadow-md transition-shadow">
                  {/* Top row on mobile: date + photo + actions */}
                  <div className="flex items-center gap-3 sm:contents">
                    {/* Date block */}
                    <div className="flex-shrink-0 w-12 flex flex-col items-center text-center">
                      <span className="text-lg font-bold leading-none">{format(startDate, 'd')}</span>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">{format(startDate, 'MMM', { locale: ru })}</span>
                      <div className="w-px h-3 bg-border my-1" />
                      <span className="text-base font-semibold leading-none text-muted-foreground">{format(endDate, 'd')}</span>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">{format(endDate, 'MMM', { locale: ru })}</span>
                    </div>

                    {/* Apartment photo */}
                    <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-muted">
                      {photo
                        ? <img src={photo} alt={b.apartments.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Building2 size={20} /></div>
                      }
                    </div>

                    {/* Actions — on mobile pushed to right of date+photo row */}
                    <div className="flex sm:hidden ml-auto gap-1">
                      <button onClick={() => setEditingBooking(b)}
                        className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                        <Pencil size={14} />
                      </button>
                      {deletingId === b.id ? (
                        <>
                          <button onClick={() => deleteBooking.mutate(b.id)} disabled={deleteBooking.isPending}
                            className="p-2 rounded-xl bg-destructive text-white text-[11px] font-bold hover:opacity-90 disabled:opacity-60">✓</button>
                          <button onClick={() => setDeletingId(null)}
                            className="p-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-bold hover:bg-secondary">✗</button>
                        </>
                      ) : (
                        <button onClick={() => { setDeleteError(null); setDeletingId(b.id) }}
                          className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-sm truncate">{b.guest_name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLOR[b.status] ?? 'bg-muted text-muted-foreground'}`}>{STATUS_LABELS[b.status] ?? b.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5 flex-wrap">
                      <Building2 size={11} /><span className="truncate">{b.apartments.title}</span>
                      <Users size={11} /><span>{b.guests_count} {b.guests_count === 1 ? 'гость' : b.guests_count < 5 ? 'гостя' : 'гостей'}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {format(startDate, 'd MMM', { locale: ru })} — {format(endDate, 'd MMM yyyy', { locale: ru })} · {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap mt-0.5">
                      {b.total_amount
                        ? <span className="font-bold text-sm">{fmtEur(b.total_amount ?? 0)}{nightly ? <span className="text-xs font-normal text-muted-foreground ml-1">· {nightly} €/н.</span> : null}</span>
                        : null}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>{SOURCE_LABELS[b.source] ?? b.source}</span>
                    </div>
                  </div>

                  {/* Actions — desktop only */}
                  <div className="hidden sm:flex flex-shrink-0 flex-col gap-1.5">
                    <button onClick={() => setEditingBooking(b)}
                      className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="Редактировать">
                      <Pencil size={14} />
                    </button>
                    {deletingId === b.id ? (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => deleteBooking.mutate(b.id)} disabled={deleteBooking.isPending}
                          className="p-2 rounded-xl bg-destructive text-white text-[11px] font-bold hover:opacity-90 disabled:opacity-60" title="Подтвердить удаление">✓</button>
                        <button onClick={() => setDeletingId(null)}
                          className="p-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-bold hover:bg-secondary" title="Отмена">✗</button>
                      </div>
                    ) : (
                      <button onClick={() => { setDeleteError(null); setDeletingId(b.id) }}
                        className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Удалить">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-1 flex-wrap gap-2">
            <span>Показано {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} из {filtered.length}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
                {pageList.map((p, i) =>
                  p === '…'
                    ? <span key={`e${i}`} className="w-8 text-center text-muted-foreground">…</span>
                    : <button key={p} onClick={() => setPage(p as number)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${page === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{p}</button>
                )}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span>На странице:</span>
              <select value={perPage} onChange={e => { setPerPage(+e.target.value); setPage(1) }}
                className="border border-border rounded-lg px-2 py-1 text-sm bg-background focus:outline-none">
                {[5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingBooking && (
          <EditBookingModal booking={editingBooking}
            onClose={() => setEditingBooking(null)}
            onSaved={() => { onRefresh(); setEditingBooking(null) }} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Cleaning Section (owner view) ───────────────────────────────────────────

function CleaningSection({ bookings, onRefresh }: { bookings: BookingRow[]; onRefresh: () => void }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [modalGroup, setModalGroup] = useState<'platform' | 'private' | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payInput, setPayInput] = useState('')
  // Payment method lifted here to avoid inner-component state reset on re-render
  const [payMethod, setPayMethod] = useState<'owner_transfer' | 'guest_cash'>('owner_transfer')

  // ── helpers ───────────────────────────────────────────────────────────────
  const getPaidAmt = (t: CleaningTask): number => {
    if (t.payment_status === 'paid') return t.cleaning_fee
    if (t.payment_status === 'partial') {
      try { return Number(JSON.parse(t.notes ?? '{}').paid_amount ?? 0) } catch { return 0 }
    }
    return 0
  }
  const getOwedAmt = (t: CleaningTask): number => Math.max(0, t.cleaning_fee - getPaidAmt(t))

  const openPay = (task: CleaningTask) => {
    setPayingId(task.id)
    setPayInput('')
    setPayMethod(task.payment_method === 'guest_cash' ? 'guest_cash' : 'owner_transfer')
  }
  const closePay = () => { setPayingId(null); setPayInput('') }

  // ── mutations ─────────────────────────────────────────────────────────────
  const recordPayment = useMutation({
    mutationFn: async ({ taskId, amount, fee }: { taskId: string; amount: number; fee: number }) => {
      const full = amount >= fee
      const { error } = await supabase.from('cleaning_tasks').update({
        payment_status: full ? 'paid' : 'partial',
        payment_method: payMethod,
        notes: full ? null : JSON.stringify({ paid_amount: amount }),
      } as never).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => { closePay(); onRefresh(); qc.invalidateQueries({ queryKey: ['owner-bookings-full'] }) },
  })

  // Revert to unpaid
  const revertPayment = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('cleaning_tasks')
        .update({ payment_status: 'pending', notes: null } as never).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => { onRefresh(); qc.invalidateQueries({ queryKey: ['owner-bookings-full'] }) },
  })

  // ── debt calculations (owner_transfer unpaid) ────────────────────────────────
  const allTasks = bookings.flatMap(b => b.cleaning_tasks.map(t => ({ task: t, booking: b })))
  const owedTasks = allTasks.filter(({ task }) => task.payment_method === 'owner_transfer' && task.payment_status !== 'paid')
  const paidTasksTransfer = allTasks.filter(({ task }) => task.payment_method === 'owner_transfer' && task.payment_status === 'paid')
  const debtTotal = owedTasks.reduce((s, { task }) => s + getOwedAmt(task), 0)
  const paidTotal = paidTasksTransfer.reduce((s, { task }) => s + task.cleaning_fee, 0)

  // ── filtered lists ────────────────────────────────────────────────────────────
  const completed = bookings
    .filter(b => b.status === 'accepted' && b.end_date <= today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))

  const upcoming = bookings
    .filter(b => b.status === 'accepted' && b.end_date > today && b.cleaning_tasks.length > 0)
    .sort((a, b) => a.end_date.localeCompare(b.end_date))

  const isPlatform = (b: BookingRow) => b.source === 'airbnb' || b.source === 'booking'
  const platformCompleted = completed.filter(isPlatform)

  // Private includes ALL accepted bookings (upcoming + completed) since guest pays at check-in
  const allPrivate = bookings
    .filter(b => b.status === 'accepted' && !isPlatform(b) && b.cleaning_tasks.length > 0)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))

  // ── totals (account for partial payments) ─────────────────────────────────────
  const platformOwed = platformCompleted.reduce((s, b) =>
    s + b.cleaning_tasks.reduce((ss, t) => ss + getOwedAmt(t), 0), 0)
  const platformPaid = platformCompleted.reduce((s, b) =>
    s + b.cleaning_tasks.reduce((ss, t) => ss + getPaidAmt(t), 0), 0)
  const privatePending = allPrivate.reduce((s, b) =>
    s + b.cleaning_tasks.reduce((ss, t) => ss + getOwedAmt(t), 0), 0)
  const privatePaid = allPrivate.reduce((s, b) =>
    s + b.cleaning_tasks.reduce((ss, t) => ss + getPaidAmt(t), 0), 0)

  const modalBookings = modalGroup === 'platform' ? platformCompleted
    : modalGroup === 'private' ? allPrivate : []

  // ── render: inline payment panel (plain function, not React component) ────────
  const renderPayPanel = (task: CleaningTask) => {
    const owed = getOwedAmt(task)
    const alreadyPaid = getPaidAmt(task)
    const numVal = Number(payInput)
    const valid = payInput !== '' && !isNaN(numVal) && numVal > 0 && numVal <= owed

    return (
      <div className="border-t border-border bg-secondary/40 px-4 py-3 flex flex-col gap-2.5"
        onClick={e => e.stopPropagation()}>
        {/* Method selector */}
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Способ оплаты</p>
          <div className="flex gap-2">
            <button onClick={() => setPayMethod('owner_transfer')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${payMethod === 'owner_transfer' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              🏦 Перевод
            </button>
            <button onClick={() => setPayMethod('guest_cash')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${payMethod === 'guest_cash' ? 'bg-purple-600 text-white border-purple-600' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              💵 Наличные
            </button>
          </div>
        </div>
        {alreadyPaid > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Уже оплачено: <span className="font-semibold text-emerald-700">{fmtEur(alreadyPaid)}</span>
            {' '}· Остаток: <span className="font-semibold text-destructive">{fmtEur(owed)}</span>
          </p>
        )}
        <p className="text-xs font-medium text-foreground">Сумма</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 border border-border bg-card rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/40">
            <input type="text" inputMode="decimal" value={payInput}
              onChange={e => setPayInput(e.target.value)} placeholder={String(owed)} autoFocus
              className="flex-1 bg-transparent outline-none text-sm font-semibold min-w-0" />
            <span className="text-muted-foreground font-semibold text-sm flex-shrink-0">€</span>
          </div>
          <button onClick={() => setPayInput(String(owed))}
            className="text-[10px] px-2.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground font-medium whitespace-nowrap">
            Всё {fmtEur(owed)}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={closePay} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Отмена</button>
          <button onClick={() => { if (valid) recordPayment.mutate({ taskId: task.id, amount: numVal, fee: task.cleaning_fee }) }}
            disabled={!valid || recordPayment.isPending}
            className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {recordPayment.isPending ? 'Сохранение…' : numVal >= owed ? '✓ Закрыть долг' : `Отметить ${numVal || '...'} €`}
          </button>
        </div>
      </div>
    )
  }

  // ── render: booking row (plain function, not React component) ────────────────
  const renderBookingRow = (b: BookingRow) => {
    const isOpen = expandedId === b.id
    const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
    const task = b.cleaning_tasks[0]
    const fee = task?.cleaning_fee ?? 0
    const paid = task ? getPaidAmt(task) : 0
    const owed = task ? getOwedAmt(task) : 0
    const isPartial = task?.payment_status === 'partial'
    const isPaid = task?.payment_status === 'paid'
    const isOwnerTransfer = task?.payment_method === 'owner_transfer'
    const isGuestCash = task?.payment_method === 'guest_cash'
    const isPayingThis = payingId === task?.id

    return (
      <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="w-full flex items-center gap-3 px-4 py-3">
          {/* Date badge */}
          <button className="flex-shrink-0 text-center bg-secondary rounded-xl px-2.5 py-1.5 min-w-[46px] hover:bg-muted/70 transition-colors"
            onClick={() => setExpandedId(isOpen ? null : b.id)}>
            <div className="text-sm font-bold leading-tight">{b.end_date.slice(8)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">{format(parseISO(b.end_date), 'MMM', { locale: ru })}</div>
          </button>
          {/* Info */}
          <button className="flex-1 min-w-0 text-left" onClick={() => setExpandedId(isOpen ? null : b.id)}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{b.apartments.title}</p>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
                {SOURCE_LABELS[b.source] ?? b.source}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{b.guest_name} · {nights} н.</p>
          </button>
          {/* Status + revert */}
          <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
            <span className="text-sm font-bold text-foreground">{fmtEur(fee)}</span>
            <div className="flex items-center gap-1">
              {isGuestCash && isPaid && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">✓ Наличные</span>}
              {isGuestCash && isPartial && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{fmtEur(paid)}/{fmtEur(fee)}</span>}
              {isGuestCash && !isPaid && !isPartial && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Наличные</span>}
              {isOwnerTransfer && isPaid && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ Оплачено</span>}
              {isOwnerTransfer && isPartial && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{fmtEur(paid)}/{fmtEur(fee)}</span>}
              {isOwnerTransfer && !isPaid && !isPartial && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Не оплачено</span>}
              {task && (isPaid || isPartial) && (
                <button onClick={e => { e.stopPropagation(); revertPayment.mutate(task.id) }} disabled={revertPayment.isPending}
                  title="Отменить оплату"
                  className="ml-0.5 text-[11px] w-4 h-4 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40">
                  ↺
                </button>
              )}
            </div>
          </div>
          {task && !isPaid && (
            <button onClick={e => { e.stopPropagation(); isPayingThis ? closePay() : openPay(task) }}
              className={`flex-shrink-0 text-[10px] px-2.5 py-1.5 rounded-xl font-semibold transition-colors ${isPayingThis ? 'bg-muted text-muted-foreground' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
              {isPayingThis ? '✕' : isPartial ? `+${fmtEur(owed)}` : 'Оплатить'}
            </button>
          )}
          <ChevronRight size={14} className={`flex-shrink-0 text-muted-foreground transition-transform cursor-pointer ${isOpen ? 'rotate-90' : ''}`}
            onClick={() => setExpandedId(isOpen ? null : b.id)} />
        </div>

        {isPayingThis && task && renderPayPanel(task)}

        {isOpen && (
          <div className="px-4 pb-4 pt-0 border-t border-border bg-secondary/30">
            <div className="flex flex-col gap-3 pt-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Квартира</span><p className="font-semibold mt-0.5">{b.apartments.title}</p></div>
                <div><span className="text-muted-foreground">Адрес</span><p className="font-medium mt-0.5 text-[11px]">{b.apartments.address}</p></div>
                <div><span className="text-muted-foreground">Гость</span><p className="font-semibold mt-0.5">{b.guest_name}</p></div>
                <div><span className="text-muted-foreground">Телефон</span><p className="font-medium mt-0.5">{b.guest_phone || '—'}</p></div>
                <div><span className="text-muted-foreground">Заезд</span><p className="font-semibold mt-0.5">{format(parseISO(b.start_date), 'd MMM yyyy', { locale: ru })}</p></div>
                <div><span className="text-muted-foreground">Выезд</span><p className="font-semibold mt-0.5">{format(parseISO(b.end_date), 'd MMM yyyy', { locale: ru })}</p></div>
                <div><span className="text-muted-foreground">Ночей</span><p className="font-bold text-primary mt-0.5">{nights}</p></div>
                <div><span className="text-muted-foreground">Гостей</span><p className="font-semibold mt-0.5">{b.guests_count}</p></div>
              </div>
              {b.cleaning_tasks.map(t => {
                const tPaid = getPaidAmt(t); const tOwed = getOwedAmt(t)
                const tIsPartial = t.payment_status === 'partial'; const tIsPaid = t.payment_status === 'paid'
                return (
                  <div key={t.id} className={`rounded-xl px-3 py-2.5 border ${tIsPaid ? 'bg-green-50 border-green-100' : tIsPartial ? 'bg-orange-50 border-orange-100' : 'bg-red-50 border-red-100'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold">{t.payment_method === 'owner_transfer' ? '🏦 Перевод' : '💵 Наличные'}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {tIsPaid && '✓ Полностью оплачено'}
                          {tIsPartial && `Оплачено ${fmtEur(tPaid)} из ${fmtEur(t.cleaning_fee)} · осталось ${fmtEur(tOwed)}`}
                          {!tIsPaid && !tIsPartial && `Не оплачено · ${fmtEur(t.cleaning_fee)}`}
                        </p>
                      </div>
                      <span className={`text-base font-bold ${tIsPaid ? 'text-green-700' : tIsPartial ? 'text-orange-700' : 'text-red-600'}`}>
                        {tIsPartial ? tPaid : t.cleaning_fee} €
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── render: modal booking row (plain function, not React component) ───────────
  const renderModalRow = (b: BookingRow) => {
    const task = b.cleaning_tasks[0]
    const nights = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
    const paid = task ? getPaidAmt(task) : 0
    const owed = task ? getOwedAmt(task) : 0
    const isPaid = task?.payment_status === 'paid'
    const isPartial = task?.payment_status === 'partial'
    const isOwner = task?.payment_method === 'owner_transfer'
    const isPayingThis = payingId === task?.id
    const isUpcoming = b.end_date > today

    return (
      <div key={b.id} className="bg-secondary/60 rounded-xl overflow-hidden">
        <div className="p-4 flex items-start gap-3">
          <div className="flex-shrink-0 text-center bg-card border border-border rounded-xl px-2.5 py-1.5 min-w-[42px]">
            <p className="text-sm font-bold leading-tight">{b.end_date.slice(8)}</p>
            <p className="text-[9px] text-muted-foreground uppercase">{format(parseISO(b.end_date), 'MMM', { locale: ru })}</p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <p className="text-sm font-semibold">{b.apartments.title}</p>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
                {SOURCE_LABELS[b.source] ?? b.source}
              </span>
              {isUpcoming && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">предстоящий</span>}
            </div>
            <p className="text-xs text-muted-foreground">{b.guest_name} · {nights} н.</p>
            <p className="text-[10px] text-muted-foreground">
              {format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM yyyy', { locale: ru })}
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            <p className="text-base font-bold text-foreground">{task?.cleaning_fee ?? 0} €</p>
            <div className="flex items-center gap-1">
              {isPaid && <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">✓ Оплачено</span>}
              {isPartial && <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">{fmtEur(paid)}/{fmtEur(task?.cleaning_fee ?? 0)}</span>}
              {!isPaid && !isPartial && (
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${isOwner ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                  {isOwner ? 'Не оплачено' : 'Ожидание'}
                </span>
              )}
              {task && (isPaid || isPartial) && (
                <button onClick={() => revertPayment.mutate(task.id)} disabled={revertPayment.isPending}
                  title="Отменить оплату"
                  className="text-[11px] w-4 h-4 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40">
                  ↺
                </button>
              )}
            </div>
            {task && !isPaid && (
              <button onClick={() => isPayingThis ? closePay() : openPay(task)}
                className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${isPayingThis ? 'bg-muted text-muted-foreground' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                {isPayingThis ? 'Отмена' : isPartial ? `+${fmtEur(owed)}` : 'Оплатить'}
              </button>
            )}
          </div>
        </div>
        {isPayingThis && task && renderPayPanel(task)}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-display font-semibold mb-6">Уборка</h2>

      {/* ── 2-column summary cards ── */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {/* Platform */}
        <div onClick={() => setModalGroup('platform')}
          className="bg-card border border-border rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700">Airbnb</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700">Booking</span>
            </div>
            <span className="text-xs text-muted-foreground">{platformCompleted.length} заездов</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-1">К переводу</p>
              <p className="text-2xl font-bold text-red-600">{fmtEur(platformOwed)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-1">Переведено</p>
              <p className="text-2xl font-bold text-emerald-700">{fmtEur(platformPaid)}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">💸 Вы переводите уборщице после каждого выезда</p>
          <p className="text-[10px] text-primary font-medium mt-1 group-hover:underline">Нажмите, чтобы увидеть бронирования →</p>
        </div>

        {/* Private */}
        <div onClick={() => setModalGroup('private')}
          className="bg-card border border-border rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-purple-100 text-purple-700">Частные</span>
            <span className="text-xs text-muted-foreground">{allPrivate.length} заездов</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-1">Ожидание</p>
              <p className="text-2xl font-bold text-amber-600">{fmtEur(privatePending)}</p>
            </div>
            <div className="rounded-xl bg-purple-50 border border-purple-100 p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-1">Получено</p>
              <p className="text-2xl font-bold text-purple-700">{fmtEur(privatePaid)}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">💵 Гость платит уборщице наличными при заезде</p>
          <p className="text-[10px] text-primary font-medium mt-1 group-hover:underline">Нажмите, чтобы увидеть бронирования →</p>
        </div>
      </div>

      {/* ── Debt summary (owner_transfer) ── */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Общий долг уборщице</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-2xl p-4 border flex items-center gap-4 ${debtTotal > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${debtTotal > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
              <Banknote size={18} className={debtTotal > 0 ? 'text-red-600' : 'text-emerald-600'} />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">К выплате</p>
              <p className={`text-2xl font-bold ${debtTotal > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtEur(debtTotal)}</p>
              <p className="text-[10px] text-muted-foreground">{owedTasks.length} уборок не оплачено</p>
            </div>
          </div>
          <div className="rounded-2xl p-4 border bg-card border-border flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Уже оплачено</p>
              <p className="text-2xl font-bold text-emerald-700">{fmtEur(paidTotal)}</p>
              <p className="text-[10px] text-muted-foreground">{paidTasksTransfer.length} уборок оплачено</p>
            </div>
          </div>
        </div>
        {owedTasks.length > 0 && (
          <div className="mt-3 bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            {owedTasks.map(({ task, booking }) => (
              <div key={task.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{booking.apartments.title}</p>
                  <p className="text-xs text-muted-foreground">{booking.guest_name} · {format(parseISO(booking.end_date), 'd MMM yyyy', { locale: ru })}</p>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${task.payment_status !== 'paid' ? 'text-red-600' : 'text-emerald-600'}`}>{fmtEur(getOwedAmt(task))}</span>
              </div>
            ))}
          </div>
        )}
        {debtTotal === 0 && (
          <p className="text-sm text-emerald-700 font-medium mt-2">✓ Все долги оплачены!</p>
        )}
      </div>

      {/* ── Upcoming cleanings ── */}
      {upcoming.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Предстоящие уборки — {upcoming.length}
          </h3>
          <div className="flex flex-col gap-2">
            {upcoming.map(b => renderBookingRow(b))}
          </div>
        </div>
      )}

      {/* ── Archive ── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Архив завершённых заездов — {completed.length}
        </h3>
        {completed.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            Завершённых заездов пока нет
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {completed.map(b => renderBookingRow(b))}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {modalGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
            onClick={e => { if (e.target === e.currentTarget) { setModalGroup(null); setPayingId(null); setPayInput('') } }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {modalGroup === 'platform' ? '🏢 Airbnb + Booking.com' : '🤝 Частные бронирования'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {modalBookings.length} завершённых заездов
                    {modalGroup === 'platform'
                      ? ` · к переводу ${fmtEur(platformOwed)} · переведено ${fmtEur(platformPaid)}`
                      : ` · ожидание ${fmtEur(privatePending)} · получено ${fmtEur(privatePaid)}`}
                  </p>
                </div>
                <button onClick={() => { setModalGroup(null); setPayingId(null); setPayInput('') }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
              </div>

              {/* Summary bar */}
              <div className={`flex-shrink-0 grid grid-cols-2 gap-3 px-5 py-3 border-b border-border ${modalGroup === 'platform' ? 'bg-red-50/50' : 'bg-purple-50/50'}`}>
                {modalGroup === 'platform' ? (
                  <>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">К переводу</p>
                      <p className="text-xl font-bold text-red-600">{fmtEur(platformOwed)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Переведено</p>
                      <p className="text-xl font-bold text-emerald-700">{fmtEur(platformPaid)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Ожидание</p>
                      <p className="text-xl font-bold text-amber-600">{fmtEur(privatePending)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Получено</p>
                      <p className="text-xl font-bold text-purple-700">{fmtEur(privatePaid)}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Booking list */}
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
                {modalBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Нет завершённых заездов</p>
                ) : modalBookings.map(b => renderModalRow(b))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Cleaner View ─────────────────────────────────────────────────────────────

function CleanerView({ bookings, onRefresh }: { bookings: BookingRow[]; onRefresh: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const qc = useQueryClient()
  const [tab, setTab] = useState<'bookings' | 'payment' | 'archive'>('bookings')
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null)
  const [payingTaskId, setPayingTaskId] = useState<string | null>(null)
  const [payInput, setPayInput] = useState('')
  const [payMethod, setPayMethod] = useState<'guest_cash' | 'owner_transfer'>('guest_cash')
  // bulk selection (task IDs of unpaid bookings)
  const [bulkIds, setBulkIds] = useState<string[]>([])
  const [bulkMethod, setBulkMethod] = useState<'guest_cash' | 'owner_transfer'>('guest_cash')

  const openPay = (task: CleaningTask) => {
    const owed = Math.max(0, task.cleaning_fee - getPaidAmt(task))
    setPayingTaskId(task.id)
    setPayInput(String(owed))   // auto-fill full amount
    setPayMethod('guest_cash')
    setBulkIds([])              // clear bulk selection when individual panel opens
  }
  const closePay = () => { setPayingTaskId(null); setPayInput('') }
  const toggleBulk = (taskId: string) => {
    setBulkIds(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId])
    setPayingTaskId(null) // close individual panel when selecting
  }
  const clearBulk = () => setBulkIds([])

  // ── mutations ─────────────────────────────────────────────────────────────────
  const recordPayment = useMutation({
    mutationFn: async ({ taskId, amount, fee }: { taskId: string; amount: number; fee: number }) => {
      const full = amount >= fee
      const { error } = await supabase.from('cleaning_tasks').update({
        payment_status: full ? 'paid' : 'partial',
        payment_method: payMethod,
        notes: full ? null : JSON.stringify({ paid_amount: amount }),
      } as never).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => { closePay(); onRefresh(); qc.invalidateQueries({ queryKey: ['owner-bookings-full'] }) },
  })

  const revertPayment = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('cleaning_tasks')
        .update({ payment_status: 'pending', notes: null } as never).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => { onRefresh(); qc.invalidateQueries({ queryKey: ['owner-bookings-full'] }) },
  })

  const bulkPayment = useMutation({
    mutationFn: async (taskIds: string[]) => {
      for (const id of taskIds) {
        const { error } = await supabase.from('cleaning_tasks').update({
          payment_status: 'paid',
          payment_method: bulkMethod,
          notes: null,
        } as never).eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: () => { clearBulk(); onRefresh(); qc.invalidateQueries({ queryKey: ['owner-bookings-full'] }) },
  })

  // ── helpers ──────────────────────────────────────────────────────────────────
  const getPaidAmt = (t: CleaningTask): number => {
    if (t.payment_status === 'paid') return t.cleaning_fee
    if (t.payment_status === 'partial') {
      try { return Number(JSON.parse(t.notes ?? '{}').paid_amount ?? 0) } catch { return 0 }
    }
    return 0
  }

  // ── data ─────────────────────────────────────────────────────────────────────
  const all          = bookings.filter(b => b.status === 'accepted' && b.cleaning_tasks.length > 0)
  const currentStays = all.filter(b => b.start_date <= today && b.end_date > today)
  const upcoming     = all.filter(b => b.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const archive      = all.filter(b => b.end_date <= today).sort((a, b) => b.end_date.localeCompare(a.end_date))

  const totalOwed   = all.reduce((s, b) => s + b.cleaning_tasks.reduce((ss, t) => ss + Math.max(0, t.cleaning_fee - getPaidAmt(t)), 0), 0)
  const totalPaid   = all.reduce((s, b) => s + b.cleaning_tasks.reduce((ss, t) => ss + getPaidAmt(t), 0), 0)
  const totalEarned = totalOwed + totalPaid
  const pct         = totalEarned > 0 ? Math.round((totalPaid / totalEarned) * 100) : 0

  // ── render: inline pay panel (plain function) ──────────────────────────────────
  const renderPayPanel = (task: CleaningTask) => {
    const owed       = Math.max(0, task.cleaning_fee - getPaidAmt(task))
    const alreadyPaid = getPaidAmt(task)
    const numVal     = Number(payInput)
    const valid      = payInput !== '' && !isNaN(numVal) && numVal > 0 && numVal <= owed
    return (
      <div className="border-t border-border bg-secondary/40 px-4 py-3 flex flex-col gap-2.5" onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Способ оплаты</p>
          <div className="flex gap-2">
            <button onClick={() => setPayMethod('guest_cash')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${payMethod === 'guest_cash' ? 'bg-purple-600 text-white border-purple-600' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              💵 Наличные
            </button>
            <button onClick={() => setPayMethod('owner_transfer')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${payMethod === 'owner_transfer' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              🏦 Перевод
            </button>
          </div>
        </div>
        {alreadyPaid > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Уже оплачено: <span className="font-semibold text-emerald-700">{fmtEur(alreadyPaid)}</span>
            {' '}· Остаток: <span className="font-semibold text-destructive">{fmtEur(owed)}</span>
          </p>
        )}
        <p className="text-xs font-medium text-foreground">Сумма</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 border border-border bg-card rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/40">
            <input type="text" inputMode="decimal" value={payInput}
              onChange={e => setPayInput(e.target.value)} placeholder={String(owed)} autoFocus
              className="flex-1 bg-transparent outline-none text-sm font-semibold min-w-0" />
            <span className="text-muted-foreground font-semibold text-sm flex-shrink-0">€</span>
          </div>
          <button onClick={() => setPayInput(String(owed))}
            className="text-[10px] px-2.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground font-medium whitespace-nowrap">
            Всё {fmtEur(owed)}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={closePay} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Отмена</button>
          <button onClick={() => { if (valid) recordPayment.mutate({ taskId: task.id, amount: numVal, fee: task.cleaning_fee }) }}
            disabled={!valid || recordPayment.isPending}
            className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {recordPayment.isPending ? 'Сохранение…' : numVal >= owed ? '✓ Закрыть долг' : `Отметить ${numVal || '...'} €`}
          </button>
        </div>
      </div>
    )
  }

  // ── render: booking card (clickable) ──────────────────────────────────────────
  const renderCard = (b: BookingRow) => {
    const task      = b.cleaning_tasks[0]
    const fee       = task?.cleaning_fee ?? 0
    const paid      = task ? getPaidAmt(task) : 0
    const owed      = fee - paid
    const isPaid    = task?.payment_status === 'paid'
    const isPartial = task?.payment_status === 'partial'
    const isCur     = b.start_date <= today && b.end_date > today
    const isUp      = b.start_date > today
    const nights    = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)

    return (
      <button key={b.id} onClick={() => setSelectedBooking(b)}
        className={`bg-card border rounded-2xl shadow-sm transition-all text-left w-full hover:shadow-md hover:border-primary/30 ${isCur ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'}`}>
        <div className="flex items-center gap-4 px-5 py-4">
          {/* Date */}
          <div className={`flex-shrink-0 text-center rounded-xl px-3 py-2 min-w-[50px] ${isCur ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
            <div className="text-sm font-bold leading-tight">{b.end_date.slice(8)}</div>
            <div className={`text-[9px] uppercase font-medium ${isCur ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {format(parseISO(b.end_date), 'MMM', { locale: ru })}
            </div>
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <p className="text-sm font-bold text-foreground">{b.apartments.title}</p>
              {isCur && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">● Сейчас</span>}
              {isUp  && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Предстоящий</span>}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
                {SOURCE_LABELS[b.source] ?? b.source}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{b.guest_name} · {nights} н.</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {format(parseISO(b.start_date), 'd MMM', { locale: ru })} — {format(parseISO(b.end_date), 'd MMM yyyy', { locale: ru })}
            </p>
          </div>
          {/* Fee + status */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5 min-w-[80px] max-w-[110px]">
            <p className="text-lg font-bold text-foreground">{fmtEur(fee)}</p>
            {isPaid    && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Оплачено</span>}
            {isPartial && <>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Частично {fmtEur(paid)}</span>
              <span className="text-[9px] text-red-500 font-medium">осталось {fmtEur(owed)}</span>
            </>}
            {!isPaid && !isPartial && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Не оплачено</span>}
            <p className="text-[9px] text-muted-foreground">{task?.payment_method === 'owner_transfer' ? '🏦 Перевод' : task?.payment_method === 'guest_cash' ? '💵 Наличные' : ''}</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />
        </div>
      </button>
    )
  }

  // ── render: payment card (with checkbox + pay/revert actions) ─────────────────
  const renderPaymentCard = (b: BookingRow) => {
    const task       = b.cleaning_tasks[0]
    if (!task) return null
    const fee        = task.cleaning_fee
    const paid       = getPaidAmt(task)
    const owed       = fee - paid
    const isPaid     = task.payment_status === 'paid'
    const isPartial  = task.payment_status === 'partial'
    const isOpen     = payingTaskId === task.id
    const isChecked  = bulkIds.includes(task.id)
    const isCur      = b.start_date <= today && b.end_date > today
    const nights     = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)

    return (
      <div key={b.id} className={`bg-card border rounded-2xl shadow-sm overflow-hidden transition-all ${isChecked ? 'border-emerald-400 ring-1 ring-emerald-300' : isCur ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'}`}>
        <div className="flex items-center gap-3 px-4 py-4">
          {/* Checkbox for bulk (only for unpaid) */}
          {!isPaid && (
            <button onClick={() => toggleBulk(task.id)}
              className={`flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-border hover:border-emerald-400'}`}>
              {isChecked && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
            </button>
          )}
          {isPaid && <div className="flex-shrink-0 w-5 h-5" />}
          {/* Date */}
          <div className={`flex-shrink-0 text-center rounded-xl px-3 py-2 min-w-[50px] ${isCur ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
            <div className="text-sm font-bold leading-tight">{b.end_date.slice(8)}</div>
            <div className={`text-[9px] uppercase font-medium ${isCur ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {format(parseISO(b.end_date), 'MMM', { locale: ru })}
            </div>
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <p className="text-sm font-bold text-foreground">{b.apartments.title}</p>
              {isCur && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">● Сейчас</span>}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${SOURCE_COLOR[b.source] ?? 'bg-muted text-muted-foreground'}`}>
                {SOURCE_LABELS[b.source] ?? b.source}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{b.guest_name} · {nights} н.</p>
          </div>
          {/* Fee + actions */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5 min-w-[110px]">
            <p className="text-lg font-bold text-foreground">{fmtEur(fee)}</p>
            {isPaid    && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Оплачено</span>}
            {isPartial && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Частично {fmtEur(paid)}</span>}
            {!isPaid && !isPartial && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">{fmtEur(owed)} долг</span>}
            <div className="flex gap-1.5 mt-0.5">
              {(isPaid || isPartial) && (
                <button onClick={() => revertPayment.mutate(task.id)}
                  disabled={revertPayment.isPending}
                  title="Отменить оплату"
                  className="text-[10px] px-2 py-0.5 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50">
                  ↺ Отменить
                </button>
              )}
              {!isPaid && !isChecked && (
                <button onClick={() => isOpen ? closePay() : openPay(task)}
                  className={`text-[10px] px-2.5 py-0.5 rounded-lg font-semibold transition-colors ${isOpen ? 'bg-muted text-muted-foreground border border-border' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                  {isOpen ? 'Скрыть' : isPartial ? `Доплатить ${fmtEur(owed)}` : 'Оплатить'}
                </button>
              )}
              {!isPaid && isChecked && (
                <span className="text-[10px] px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 font-semibold">Выбрано</span>
              )}
            </div>
          </div>
        </div>
        {isOpen && !isChecked && renderPayPanel(task)}
      </div>
    )
  }

  // ── mini calendar helpers ─────────────────────────────────────────────────────
  const buildMonthCal = (base: Date) => {
    const first    = startOfMonth(base)
    const total    = getDaysInMonth(base)
    const offset   = (getDay(first) + 6) % 7   // Mon-based (0=Mon … 6=Sun)
    const cells: (number | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    return { cells, year: first.getFullYear(), month: first.getMonth() }
  }

  const dayStatus = (y: number, m: number, d: number) => {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    let ci = false, co = false, occ = false
    for (const b of all) {
      if (b.start_date === ds) ci = true
      if (b.end_date   === ds) co = true
      if (ds > b.start_date && ds < b.end_date) occ = true
    }
    return { ci, co, occ, ds }
  }

  const renderMiniCalendar = (base: Date) => {
    const { cells, year, month } = buildMonthCal(base)
    const WDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
    const rows: (number | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

    return (
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
        <p className="text-sm font-bold text-foreground mb-3 capitalize">
          {format(startOfMonth(base), 'LLLL yyyy', { locale: ru })}
        </p>
        {/* Week header */}
        <div className="grid grid-cols-7 mb-1">
          {WDAYS.map(w => (
            <div key={w} className="text-center text-[10px] text-muted-foreground font-semibold py-0.5">{w}</div>
          ))}
        </div>
        {/* Day cells */}
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7">
            {row.map((d, ci2) => {
              if (!d) return <div key={`e-${ci2}`} className="h-7" />
              const { ci, co, occ, ds } = dayStatus(year, month, d)
              const isToday = ds === today
              return (
                <div key={d}
                  className={`relative h-7 flex items-center justify-center text-xs font-medium rounded-lg mx-0.5 my-0.5
                    ${ci  ? 'bg-emerald-500 text-white' : ''}
                    ${co  ? 'bg-orange-400 text-white' : ''}
                    ${occ && !ci && !co ? 'bg-emerald-100 text-emerald-900' : ''}
                    ${!ci && !co && !occ ? 'text-foreground hover:bg-muted/60' : ''}
                  `}>
                  {d}
                  {isToday && !ci && !co && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── section content ───────────────────────────────────────────────────────────
  const renderBookings = () => {
    const daysToNext = upcoming.length > 0
      ? Math.max(0, Math.round((parseISO(upcoming[0].start_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000))
      : null

    return (
      <div className="flex flex-col md:grid md:gap-5" style={{ gridTemplateColumns: '1fr 240px', alignItems: 'start' }}>
        {/* ── LEFT: stats + cards ── */}
        <div className="flex flex-col gap-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-primary">{currentStays.length + upcoming.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">заездов впереди</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-foreground">{currentStays.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">сейчас заселено</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm text-center">
              {daysToNext !== null
                ? <><p className="text-2xl font-bold text-foreground">{daysToNext}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{daysToNext === 0 ? 'заезд сегодня!' : 'дней до заезда'}</p></>
                : <><p className="text-2xl font-bold text-muted-foreground">—</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">нет заездов</p></>}
            </div>
          </div>

          {/* Current stays */}
          {currentStays.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Сейчас заселены</h3>
              <div className="flex flex-col gap-2">{currentStays.map(b => renderCard(b))}</div>
            </div>
          )}
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Предстоящие — {upcoming.length}</h3>
              <div className="flex flex-col gap-2">{upcoming.map(b => renderCard(b))}</div>
            </div>
          )}
          {/* Empty */}
          {currentStays.length === 0 && upcoming.length === 0 && (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-3xl mb-2">🧹</p>
              <p className="text-sm text-muted-foreground">Нет предстоящих заездов</p>
            </div>
          )}
        </div>

        {/* ── RIGHT: calendars (sticky on desktop, normal flow on mobile) ── */}
        <div className="flex flex-col gap-3 mt-5 md:mt-0" style={{ position: 'sticky', top: '1.5rem' }}>
          {renderMiniCalendar(new Date())}
          {renderMiniCalendar(addMonths(new Date(), 1))}
          {/* Legend */}
          <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 flex-shrink-0" />
              Заезд
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-orange-400 flex-shrink-0" />
              Выезд / уборка
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 flex-shrink-0" />
              Занято
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderPayment = () => (
    <div className="flex flex-col gap-6">
      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">Всего заработано</p>
          <p className="text-2xl sm:text-3xl font-bold text-foreground">{fmtEur(totalEarned)}</p>
          <p className="text-xs text-muted-foreground mt-1">{all.length} уборок</p>
        </div>
        <div className={`bg-card border rounded-2xl p-4 sm:p-5 shadow-sm ${totalOwed > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
          <p className="text-xs text-muted-foreground mb-2">Задолженность</p>
          <p className={`text-2xl sm:text-3xl font-bold ${totalOwed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtEur(totalOwed)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalOwed > 0 ? 'ожидает перевода' : 'долгов нет 🎉'}</p>
        </div>
        <div className="bg-card border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">Получено</p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{fmtEur(totalPaid)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {all.filter(b => b.cleaning_tasks.some(t => t.payment_status === 'paid')).length} оплачено
          </p>
        </div>
      </div>

      {/* Progress bar */}
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

      {/* Unpaid / partial list */}
      {(() => {
        const unpaidList = all.filter(b => b.cleaning_tasks.some(t => t.payment_status !== 'paid'))
        const paidList   = all.filter(b => b.cleaning_tasks.every(t => t.payment_status === 'paid'))
        const bulkTotal  = bulkIds.reduce((s, id) => {
          const task = all.flatMap(b => b.cleaning_tasks).find(t => t.id === id)
          return s + (task ? Math.max(0, task.cleaning_fee - getPaidAmt(task)) : 0)
        }, 0)
        const allUnpaidIds = unpaidList.flatMap(b => b.cleaning_tasks.filter(t => t.payment_status !== 'paid').map(t => t.id))
        const allSelected  = allUnpaidIds.length > 0 && allUnpaidIds.every(id => bulkIds.includes(id))

        return (
          <>
            {unpaidList.length > 0 && (
              <div>
                {/* Section header with select-all */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Долг — {unpaidList.length} уборок
                  </h3>
                  <button onClick={() => allSelected ? clearBulk() : setBulkIds(allUnpaidIds)}
                    className="text-[11px] text-primary font-semibold hover:underline">
                    {allSelected ? 'Снять всё' : 'Выбрать все'}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {unpaidList.map(b => renderPaymentCard(b))}
                </div>
              </div>
            )}
            {paidList.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Оплачено — {paidList.length} уборок
                </h3>
                <div className="flex flex-col gap-2">
                  {paidList.map(b => renderPaymentCard(b))}
                </div>
              </div>
            )}
            {all.length === 0 && (
              <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground text-sm">
                Нет данных об уборках
              </div>
            )}

            {/* ── Floating bulk action bar ── */}
            <AnimatePresence>
              {bulkIds.length > 0 && (
                <motion.div key="bulk-bar"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                  className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
                  <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground">
                        Выбрано {bulkIds.length} {bulkIds.length === 1 ? 'заезд' : bulkIds.length < 5 ? 'заезда' : 'заездов'} · <span className="text-emerald-600">{fmtEur(bulkTotal)}</span>
                      </p>
                      <button onClick={clearBulk} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                    {/* Method selector */}
                    <div className="flex gap-2">
                      <button onClick={() => setBulkMethod('guest_cash')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${bulkMethod === 'guest_cash' ? 'bg-purple-600 text-white border-purple-600' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        💵 Наличные
                      </button>
                      <button onClick={() => setBulkMethod('owner_transfer')}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${bulkMethod === 'owner_transfer' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        🏦 Перевод
                      </button>
                    </div>
                    {/* Confirm */}
                    <button onClick={() => bulkPayment.mutate(bulkIds)}
                      disabled={bulkPayment.isPending}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {bulkPayment.isPending ? 'Сохранение…' : `✓ Отметить оплаченными — ${fmtEur(bulkTotal)}`}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )
      })()}
    </div>
  )

  const renderArchive = () => (
    <div>
      {archive.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground text-sm">
          Архив пуст
        </div>
      ) : (
        <div className="flex flex-col gap-2">{archive.map(b => renderCard(b))}</div>
      )}
    </div>
  )

  // ── nav items ─────────────────────────────────────────────────────────────────
  const NAV: { id: typeof tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'bookings', label: 'Заезды',  icon: <CalendarDays size={16} />, count: currentStays.length + upcoming.length },
    { id: 'payment',  label: 'Оплата',  icon: <Banknote size={16} />,    count: totalOwed > 0 ? undefined : undefined },
    { id: 'archive',  label: 'Архив',   icon: <FileText size={16} />,     count: archive.length },
  ]

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* ── Left sidebar (desktop only) ── */}
      <aside className="sidebar-root hidden md:flex w-52 flex-shrink-0 flex-col py-5 px-3">
        {/* Title */}
        <div className="px-2 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Brush size={16} className="text-primary flex-shrink-0" />
            <span className="font-display font-bold text-sm leading-tight" style={{ color: 'hsl(var(--sidebar-logo-fg))' }}>
              Сервис по уборке
            </span>
          </div>
        </div>

        {/* Nav */}
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
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-600">
                  {fmtEur(totalOwed)}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Payment hint */}
        {totalOwed > 0 && (
          <div className="mt-auto mx-1 p-3 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[10px] text-red-600 font-semibold mb-0.5">Ожидает оплаты</p>
            <p className="text-lg font-bold text-red-700">{fmtEur(totalOwed)}</p>
          </div>
        )}
        {totalOwed === 0 && totalEarned > 0 && (
          <div className="mt-auto mx-1 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] text-emerald-700 font-semibold">✓ Все выплачено</p>
            <p className="text-lg font-bold text-emerald-700">{fmtEur(totalPaid)}</p>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto flex flex-col"
        style={{
          backgroundImage: tab === 'bookings'
            ? 'radial-gradient(ellipse at 80% 10%, hsl(var(--primary) / 0.04) 0%, transparent 50%), radial-gradient(ellipse at 10% 90%, hsl(142 60% 50% / 0.04) 0%, transparent 50%)'
            : undefined,
        }}>

        {/* Mobile top tab bar */}
        <div className="md:hidden flex-shrink-0 flex items-center gap-1 px-3 pt-3 pb-1">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition-colors ${tab === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {item.icon}
              {item.label}
              {item.id === 'payment' && totalOwed > 0 && (
                <span className="text-[9px] px-1 rounded-full bg-red-500 text-white font-bold">€</span>
              )}
            </button>
          ))}
        </div>

        <div className={`px-3 py-4 md:px-8 md:py-8 flex-1 ${tab === 'bookings' ? 'max-w-5xl' : 'max-w-3xl'} w-full`}>
          {/* Page title */}
          <div className="mb-4 md:mb-6">
            <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
              {tab === 'bookings' ? 'Заезды' : tab === 'payment' ? 'Оплата' : 'Архив заездов'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === 'bookings' ? `${currentStays.length} сейчас · ${upcoming.length} предстоящих` :
               tab === 'payment'  ? `Заработано ${fmtEur(totalEarned)} · получено ${fmtEur(totalPaid)}` :
               `${archive.length} завершённых заездов`}
            </p>
          </div>
          {tab === 'bookings' && renderBookings()}
          {tab === 'payment'  && renderPayment()}
          {tab === 'archive'  && renderArchive()}
        </div>
      </div>

      {/* ── Booking detail modal ── */}
      <AnimatePresence>
        {selectedBooking && (() => {
          const b    = selectedBooking
          const task = b.cleaning_tasks[0]
          const fee  = task?.cleaning_fee ?? 0
          const paid = task ? getPaidAmt(task) : 0
          const isPaid    = task?.payment_status === 'paid'
          const isPartial = task?.payment_status === 'partial'
          const nights    = Math.round((parseISO(b.end_date).getTime() - parseISO(b.start_date).getTime()) / 86400000)
          const isCur     = b.start_date <= today && b.end_date > today
          return (
            <>
              <motion.div key="cleaner-modal-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
                onClick={() => setSelectedBooking(null)} />
              <motion.div key="cleaner-modal-panel"
                initial={{ opacity: 0, y: 32, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }} transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border p-6 flex flex-col gap-4">
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
                  <button onClick={() => setSelectedBooking(null)}
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors">
                    <X size={15} />
                  </button>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-2.5 bg-secondary/50 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Гость</span>
                    <span className="font-semibold text-foreground">{b.guest_name}</span>
                  </div>
                  {b.guest_phone && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Телефон</span>
                      <a href={`tel:${b.guest_phone}`} className="font-semibold text-primary hover:underline">{b.guest_phone}</a>
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
                    <span className="font-bold text-foreground">{fmtEur(fee)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Статус</span>
                    <span>
                      {isPaid    && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Оплачено</span>}
                      {isPartial && <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Частично {fmtEur(paid)} / {fmtEur(fee)}</span>}
                      {!isPaid && !isPartial && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Не оплачено</span>}
                    </span>
                  </div>
                  {task?.payment_method && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Способ</span>
                      <span className="text-foreground text-xs">{task.payment_method === 'owner_transfer' ? '🏦 Перевод' : '💵 Наличные'}</span>
                    </div>
                  )}
                </div>

                <button onClick={() => setSelectedBooking(null)}
                  className="w-full py-2.5 rounded-2xl bg-secondary text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  Закрыть
                </button>
              </motion.div>
            </>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

// ─── Expenses Section ─────────────────────────────────────────────────────────

type AllExpense = {
  id: string; apartment_id: string; category_name: string
  amount: number; paid_date: string; period_note: string | null
  is_recurring: boolean; notes: string | null; created_at: string
}

type ExpenseCategory = { id: string; owner_id: string; name: string }

const BUILT_IN_CATS = ['Электричество', 'Вода']

const CAT_META: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  'Электричество': { icon: <Zap size={14} />, color: 'text-amber-500', bg: 'bg-amber-50' },
  'Вода':          { icon: <Droplets size={14} />, color: 'text-blue-500', bg: 'bg-blue-50' },
}

const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#8b5cf6','#14b8a6','#f97316','#84cc16']

const EXP_MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const EXP_MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

const expFieldCls = 'rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full'

function ExpModal({ title, onClose, onSave, canSave, saving, children }: {
  title: string; onClose: () => void; onSave: () => void
  canSave: boolean; saving?: boolean; children: React.ReactNode
}) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end sticky bottom-0 bg-card">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted">Отмена</button>
          <button onClick={onSave} disabled={!canSave}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ExpensesSection({ apartments }: { apartments: Apartment[] }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const thisYear = now.getFullYear()

  // Period selector (controls table + donut chart)
  const [periodYear, setPeriodYear] = useState(thisYear)
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1) // 1-based

  // Table filters
  const [catFilter, setCatFilter] = useState('')
  const [aptFilter, setAptFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Add / edit modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingExp, setEditingExp] = useState<AllExpense | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [newCatInput, setNewCatInput] = useState('')
  const [addingCat, setAddingCat] = useState(false)

  // Quick-view modals
  const [expMonthModal, setExpMonthModal] = useState(false)
  const [barClickMonth, setBarClickMonth] = useState<number | null>(null) // 0-based month index
  const [yearViewYear, setYearViewYear] = useState(thisYear)
  const [yearViewModal, setYearViewModal] = useState(false)

  type ExpForm = { category_name: string; amount: string; paid_date: string; period_note: string; is_recurring: boolean; notes: string; apartment_id: string }
  // Default date: today if selected period is current month, otherwise 1st of selected period month
  const periodDefaultDate = (periodYear === thisYear && periodMonth === now.getMonth() + 1)
    ? todayStr
    : `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`
  const emptyForm: ExpForm = { category_name: '', amount: '', paid_date: periodDefaultDate, period_note: '', is_recurring: false, notes: '', apartment_id: getLastAptId() || apartments[0]?.id || '' }
  const [form, setForm] = useState<ExpForm>(emptyForm)
  const [editForm, setEditForm] = useState<ExpForm>(emptyForm)

  // Period navigation
  const prevPeriod = () => {
    if (periodMonth === 1) { setPeriodYear((y: number) => y - 1); setPeriodMonth(12) }
    else setPeriodMonth((m: number) => m - 1)
    setPage(1)
  }
  const nextPeriod = () => {
    if (periodMonth === 12) { setPeriodYear((y: number) => y + 1); setPeriodMonth(1) }
    else setPeriodMonth((m: number) => m + 1)
    setPage(1)
  }

  // Fetch ALL apartments' expenses
  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ['all-expenses-all', apartments.map(a => a.id).join(',')],
    queryFn: async () => {
      const aptIds = apartments.map(a => a.id)
      if (!aptIds.length) return []
      const { data } = await supabase.from('all_expenses').select('*')
        .in('apartment_id', aptIds).order('paid_date', { ascending: false })
      return (data ?? []) as AllExpense[]
    },
    enabled: apartments.length > 0,
  })

  const { data: userCats = [] } = useQuery({
    queryKey: ['expense-categories', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('expense_categories').select('*').eq('owner_id', user!.id).order('name')
      return (data ?? []) as ExpenseCategory[]
    },
    enabled: !!user,
  })

  const allCats = [...BUILT_IN_CATS, ...userCats.map(c => c.name).filter(n => !BUILT_IN_CATS.includes(n))]
  const catMeta = (name: string) => CAT_META[name] ?? { icon: <Receipt size={14} />, color: 'text-violet-500', bg: 'bg-violet-50' }

  // ── Year-view stat computations ──
  const yearViewYearStr        = String(yearViewYear)
  const yearViewExps           = allExpenses.filter(e => e.paid_date.startsWith(yearViewYearStr))
  const totalYearView          = yearViewExps.reduce((s, e) => s + e.amount, 0)
  const distinctMonthsYearView = new Set(yearViewExps.map(e => e.paid_date.slice(0, 7))).size
  const avgMonthYearView       = distinctMonthsYearView > 0 ? totalYearView / distinctMonthsYearView : 0

  // ── Bar chart: 12 months of periodYear ──
  const barData = Array.from({ length: 12 }, (_, i) => {
    const ms = `${periodYear}-${String(i + 1).padStart(2, '0')}`
    return {
      month: EXP_MONTH_SHORT[i],
      value: allExpenses.filter(e => e.paid_date.startsWith(ms)).reduce((s, e) => s + e.amount, 0),
    }
  })

  // ── Donut chart: by category for selected period month ──
  const periodStr      = `${periodYear}-${String(periodMonth).padStart(2, '0')}`
  const periodExpenses = allExpenses.filter(e => e.paid_date.startsWith(periodStr))
  const byCat          = periodExpenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category_name] = (acc[e.category_name] ?? 0) + e.amount; return acc
  }, {})
  const donutData  = Object.entries(byCat)
    .map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
    .sort((a, b) => b.value - a.value)
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  // ── Table filtering ──
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(e => {
      if (!e.paid_date.startsWith(periodStr)) return false
      if (catFilter && e.category_name !== catFilter) return false
      if (aptFilter && e.apartment_id !== aptFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const aptName = apartments.find(a => a.id === e.apartment_id)?.title ?? ''
        if (!e.category_name.toLowerCase().includes(q) &&
            !(e.notes ?? '').toLowerCase().includes(q) &&
            !aptName.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allExpenses, periodStr, catFilter, aptFilter, search, apartments])

  // Group by apartment when "all" selected and multiple apartments exist
  const showGrouped = apartments.length > 1 && !aptFilter
  const groupedExpenses = showGrouped
    ? apartments
        .map(a => ({
          apt: a,
          expenses: filteredExpenses.filter(e => e.apartment_id === a.id),
          total: filteredExpenses.filter(e => e.apartment_id === a.id).reduce((s, e) => s + e.amount, 0),
        }))
        .filter(g => g.expenses.length > 0)
    : null

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize))
  const paginated  = filteredExpenses.slice((page - 1) * pageSize, page * pageSize)

  // ── Handlers ──
  const handleAddCat = async () => {
    const name = newCatInput.trim(); if (!name) return
    setAddingCat(true)
    await supabase.from('expense_categories').insert({ owner_id: user!.id, name })
    qc.invalidateQueries({ queryKey: ['expense-categories', user?.id] })
    setNewCatInput(''); setAddingCat(false)
  }

  const handleDeleteCat = async (id: string) => {
    await supabase.from('expense_categories').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['expense-categories', user?.id] })
  }

  const invalidateAll = () => qc.invalidateQueries({ queryKey: ['all-expenses-all'] })

  const handleSave = async () => {
    if (!form.category_name || !form.amount || !form.paid_date || !form.apartment_id) return
    setSaving(true)
    await supabase.from('all_expenses').insert({
      apartment_id: form.apartment_id,
      category_name: form.category_name,
      amount: parseFloat(form.amount.replace(',', '.')),
      paid_date: form.paid_date,
      period_note: form.period_note.trim() || null,
      is_recurring: form.is_recurring,
      notes: form.notes.trim() || null,
    })
    invalidateAll()
    setForm(emptyForm)
    setShowAddModal(false); setSaving(false)
  }

  const startEdit = (e: AllExpense) => {
    setEditingExp(e)
    setEditForm({
      category_name: e.category_name, amount: String(e.amount),
      paid_date: e.paid_date, period_note: e.period_note ?? '',
      is_recurring: e.is_recurring, notes: e.notes ?? '',
      apartment_id: e.apartment_id,
    })
  }

  const handleUpdate = async () => {
    if (!editingExp) return
    await supabase.from('all_expenses').update({
      apartment_id: editForm.apartment_id,
      category_name: editForm.category_name,
      amount: parseFloat(editForm.amount.replace(',', '.')),
      paid_date: editForm.paid_date,
      period_note: editForm.period_note.trim() || null,
      is_recurring: editForm.is_recurring,
      notes: editForm.notes.trim() || null,
    }).eq('id', editingExp.id)
    invalidateAll(); setEditingExp(null)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await supabase.from('all_expenses').delete().eq('id', id)
    invalidateAll(); setDeleting(null)
  }

  // ── Bar-click month data (computed inline, no hook needed) ──
  const clickedMs        = barClickMonth !== null ? `${periodYear}-${String(barClickMonth + 1).padStart(2, '0')}` : ''
  const clickedExps      = barClickMonth !== null ? allExpenses.filter(e => e.paid_date.startsWith(clickedMs)) : []
  const clickedTotal     = clickedExps.reduce((s, e) => s + e.amount, 0)
  const clickedMonthName = barClickMonth !== null ? EXP_MONTH_NAMES[barClickMonth] : ''

  // ── Period-month modal data (reuse periodExpenses already defined above) ──
  const periodMonthTotal = periodExpenses.reduce((s, e) => s + e.amount, 0)

  const renderFormFields = (f: ExpForm, setF: React.Dispatch<React.SetStateAction<ExpForm>>) => (
    <div className="grid grid-cols-2 gap-3">
      {apartments.length > 1 && (
        <div className="flex flex-col gap-1 col-span-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Квартира</label>
          <select value={f.apartment_id}
            onChange={e => { setF(p => ({ ...p, apartment_id: e.target.value })); saveLastAptId(e.target.value) }}
            className={expFieldCls}>
            {apartments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1 col-span-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Категория</label>
        <select value={f.category_name} onChange={e => {
          const cat = e.target.value
          setF(p => {
            // Auto-fill amount from last recurring expense when category is selected and amount is empty
            if (cat && !p.amount) {
              const last = allExpenses.find(ex => ex.category_name === cat && ex.is_recurring && ex.apartment_id === p.apartment_id)
              if (last) return { ...p, category_name: cat, amount: String(last.amount) }
            }
            return { ...p, category_name: cat }
          })
        }} className={expFieldCls}>
          <option value="">— Выберите —</option>
          {allCats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex gap-2 mt-1">
          <input type="text" placeholder="Новая категория..." value={newCatInput} onChange={e => setNewCatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCat() }}
            className="flex-1 rounded-xl border border-dashed border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={handleAddCat} disabled={!newCatInput.trim() || addingCat}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-primary hover:text-primary-foreground disabled:opacity-50 flex-shrink-0">
            + Добавить
          </button>
        </div>
        {userCats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {userCats.map(c => (
              <span key={c.id} className="flex items-center gap-1 text-xs bg-secondary border border-border rounded-lg px-2 py-0.5">
                {c.name}
                <button onClick={() => handleDeleteCat(c.id)} className="text-muted-foreground hover:text-destructive ml-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Сумма, €</label>
        <input type="text" inputMode="decimal" placeholder="0" value={f.amount}
          onChange={e => setF(p => ({ ...p, amount: e.target.value }))} className={expFieldCls} />
        {(() => {
          const lastExp = f.category_name
            ? allExpenses.find(ex => ex.category_name === f.category_name && ex.is_recurring && ex.apartment_id === f.apartment_id)
            : null
          if (!lastExp) return null
          const lastStr = String(lastExp.amount)
          return (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">Последний: {fmtEur(lastExp.amount)}</span>
              {f.amount !== lastStr && f.amount !== lastExp.amount.toFixed(2) && (
                <button type="button"
                  onClick={() => setF(p => ({ ...p, amount: String(lastExp.amount) }))}
                  className="text-xs text-primary hover:underline font-medium">
                  Вернуть
                </button>
              )}
            </div>
          )
        })()}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Дата оплаты</label>
        <input type="date" value={f.paid_date} onChange={e => setF(p => ({ ...p, paid_date: e.target.value }))} className={expFieldCls} />
      </div>
      <div className="flex flex-col gap-1 col-span-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">За какой период (необязательно)</label>
        <input type="text" placeholder="напр. 1 кв. 2026, январь 2026..." value={f.period_note} onChange={e => setF(p => ({ ...p, period_note: e.target.value }))} className={expFieldCls} />
      </div>
      <div className="flex flex-col gap-1 col-span-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Заметки</label>
        <input type="text" placeholder="Необязательно" value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} className={expFieldCls} />
      </div>
      <div className="col-span-2">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={f.is_recurring} onChange={e => {
            const checked = e.target.checked
            setF(p => {
              if (checked && p.category_name && !p.amount) {
                const last = allExpenses.find(ex => ex.category_name === p.category_name && ex.is_recurring && ex.apartment_id === p.apartment_id)
                if (last) return { ...p, is_recurring: checked, amount: String(last.amount) }
              }
              return { ...p, is_recurring: checked }
            })
          }} className="w-4 h-4 rounded accent-primary" />
          <span className="text-sm font-medium">Ежемесячный платёж</span>
        </label>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold">Расходы</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Управление всеми расходами по квартирам</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
          <div className="flex items-center gap-0.5 bg-card border border-border rounded-xl px-1 py-1">
            <button onClick={prevPeriod} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ChevronLeft size={14} /></button>
            <span className="text-sm font-medium px-2 min-w-[120px] text-center">
              {EXP_MONTH_NAMES[periodMonth - 1]} {periodYear}
            </span>
            <button onClick={nextPeriod} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ChevronRight size={14} /></button>
          </div>
          <button
            onClick={() => { setForm(emptyForm); setShowAddModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 whitespace-nowrap">
            <Plus size={16} /> Добавить расход
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. В этом месяце — shows selected period, clickable */}
        <button onClick={() => setExpMonthModal(true)}
          className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2 text-left hover:bg-muted/30 transition-colors">
          <span className="text-xs text-muted-foreground font-medium">В этом месяце</span>
          <span className="text-2xl font-bold leading-none">{fmtEur(periodMonthTotal)}</span>
          <span className="text-xs text-muted-foreground">{periodExpenses.length} расход{periodExpenses.length === 1 ? '' : periodExpenses.length < 5 ? 'а' : 'ов'}</span>
        </button>
        {/* 2. В этом году — year selector on click */}
        <button onClick={() => setYearViewModal(true)}
          className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2 text-left hover:bg-muted/30 transition-colors">
          <span className="text-xs text-muted-foreground font-medium">В этом году</span>
          <span className="text-2xl font-bold leading-none">{fmtEur(totalYearView)}</span>
          <span className="text-xs text-muted-foreground">{yearViewYear} год · {yearViewExps.length} записей</span>
        </button>
        {/* 3. Средний в месяц — from yearViewYear data */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
          <span className="text-xs text-muted-foreground font-medium">Средний в месяц</span>
          <span className="text-2xl font-bold leading-none">{fmtEur(avgMonthYearView)}</span>
          <span className="text-xs text-muted-foreground">за {yearViewYear} год · {distinctMonthsYearView} мес.</span>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Bar chart — Динамика расходов */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Динамика расходов</h3>
            <span className="text-xs text-muted-foreground">{periodYear}</span>
          </div>
          <div onMouseDown={e => e.preventDefault()} style={{ userSelect: 'none' }}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} style={{ outline: 'none' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <RechartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length || !payload[0].value) return null
                  return (
                    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
                      <div className="font-semibold text-foreground">{label}</div>
                      <div className="text-primary font-bold mt-0.5">{fmtEur(Number(payload[0].value))}</div>
                    </div>
                  )
                }}
                cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32}
                onClick={(_data, index) => { if (barData[index]?.value > 0) setBarClickMonth(index) }}
                style={{ cursor: 'pointer' }} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Donut chart — Расходы по категориям */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Расходы по категориям</h3>
            <span className="text-xs text-muted-foreground">{EXP_MONTH_NAMES[periodMonth - 1]}</span>
          </div>
          {donutData.length === 0 ? (
            <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
              Нет данных за период
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
                <PieChart width={140} height={140}>
                  <Pie data={donutData} cx={65} cy={65} innerRadius={44} outerRadius={62}
                    dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
                    {donutData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-muted-foreground leading-tight">Итого</span>
                  <span className="text-sm font-bold leading-tight">{fmtEur(donutTotal)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                {donutData.slice(0, 7).map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-muted-foreground truncate flex-1">{d.name}</span>
                    <span className="text-xs font-semibold flex-shrink-0">{fmtEur(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Expense list table ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Table header + filters */}
        <div className="px-4 py-4 border-b border-border">
          <h3 className="font-semibold mb-3">Список расходов</h3>
          <div className="flex flex-wrap gap-2">
            <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1) }}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Все категории</option>
              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {apartments.length > 1 && (
              <select value={aptFilter} onChange={e => { setAptFilter(e.target.value); setPage(1) }}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Все квартиры</option>
                {apartments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            )}
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Поиск расходов" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Загрузка...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Нет расходов за выбранный период</div>
        ) : showGrouped && groupedExpenses ? (
          // ── Grouped by apartment ──────────────────────────────────────────────
          <div className="divide-y divide-border">
            {groupedExpenses.map(group => (
              <div key={group.apt.id}>
                {/* Apartment group header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Home size={13} className="text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">{group.apt.title}</span>
                    <span className="text-[11px] text-muted-foreground">{group.expenses.length} запис{group.expenses.length === 1 ? 'ь' : group.expenses.length < 5 ? 'и' : 'ей'}</span>
                  </div>
                  <span className="text-xs font-bold text-foreground">{fmtEur(group.total)}</span>
                </div>

                {/* Desktop table for this group */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    {group === groupedExpenses[0] && (
                      <thead>
                        <tr className="border-b border-border bg-muted/10">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Дата</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Категория</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Описание</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Период</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сумма</th>
                          <th className="w-[72px]" />
                        </tr>
                      </thead>
                    )}
                    <tbody className="divide-y divide-border">
                      {group.expenses.map(e => {
                        const meta = catMeta(e.category_name)
                        return (
                          <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                              {format(parseISO(e.paid_date), 'd MMM yyyy', { locale: ru })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                                  <span className={meta.color}>{meta.icon}</span>
                                </div>
                                <span className="font-medium">{e.category_name}</span>
                                {e.is_recurring && <span className="text-xs" title="Ежемесячный">🔄</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{e.notes || '—'}</td>
                            <td className="px-4 py-3">
                              {e.period_note
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-primary/10 text-primary">{e.period_note}</span>
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{fmtEur(e.amount)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-0.5 justify-end">
                                <button onClick={() => startEdit(e)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={13} /></button>
                                <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards for this group */}
                <div className="sm:hidden divide-y divide-border">
                  {group.expenses.map(e => {
                    const meta = catMeta(e.category_name)
                    return (
                      <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.bg}`}>
                          <span className={meta.color}>{meta.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{e.category_name}</span>
                            {e.is_recurring && <span className="text-xs">🔄</span>}
                            <span className="text-sm font-bold ml-auto">{fmtEur(e.amount)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">{format(parseISO(e.paid_date), 'd MMM yyyy', { locale: ru })}</span>
                          </div>
                          {e.period_note && <span className="text-xs text-primary font-medium mt-0.5 inline-block">{e.period_note}</span>}
                          {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0">
                          <button onClick={() => startEdit(e)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={13} /></button>
                          <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── Flat list with pagination ─────────────────────────────────────────
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Дата</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Категория</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Описание</th>
                    {apartments.length > 1 && <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Квартира</th>}
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Период</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сумма</th>
                    <th className="w-[72px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map(e => {
                    const meta = catMeta(e.category_name)
                    const aptName = apartments.find(a => a.id === e.apartment_id)?.title ?? ''
                    return (
                      <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(parseISO(e.paid_date), 'd MMM yyyy', { locale: ru })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                              <span className={meta.color}>{meta.icon}</span>
                            </div>
                            <span className="font-medium">{e.category_name}</span>
                            {e.is_recurring && <span className="text-xs" title="Ежемесячный">🔄</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{e.notes || '—'}</td>
                        {apartments.length > 1 && <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{aptName}</td>}
                        <td className="px-4 py-3">
                          {e.period_note
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-primary/10 text-primary">{e.period_note}</span>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{fmtEur(e.amount)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5 justify-end">
                            <button onClick={() => startEdit(e)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={13} /></button>
                            <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-border">
              {paginated.map(e => {
                const meta = catMeta(e.category_name)
                const aptName = apartments.find(a => a.id === e.apartment_id)?.title ?? ''
                return (
                  <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.bg}`}>
                      <span className={meta.color}>{meta.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{e.category_name}</span>
                        {e.is_recurring && <span className="text-xs">🔄</span>}
                        <span className="text-sm font-bold ml-auto">{fmtEur(e.amount)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">{format(parseISO(e.paid_date), 'd MMM yyyy', { locale: ru })}</span>
                        {apartments.length > 1 && <span className="text-xs text-muted-foreground">· {aptName}</span>}
                      </div>
                      {e.period_note && <span className="text-xs text-primary font-medium mt-0.5 inline-block">{e.period_note}</span>}
                      {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
                    </div>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button onClick={() => startEdit(e)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors"><ChevronLeft size={14} /></button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = i + 1
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${page === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
                      {p}
                    </button>
                  )
                })}
                {totalPages > 5 && <span className="text-muted-foreground text-sm px-1">…</span>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors"><ChevronRight size={14} /></button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>На странице:</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none">
                  {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Add expense modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <ExpModal title="Новый расход" onClose={() => setShowAddModal(false)} onSave={handleSave}
            canSave={!saving && !!form.category_name && !!form.amount} saving={saving}>
            {renderFormFields(form, setForm)}
          </ExpModal>
        )}
      </AnimatePresence>

      {/* ── Edit expense modal ── */}
      <AnimatePresence>
        {editingExp && (
          <ExpModal title="Редактировать расход" onClose={() => setEditingExp(null)} onSave={handleUpdate}
            canSave={!!editForm.category_name && !!editForm.amount}>
            {renderFormFields(editForm, setEditForm)}
          </ExpModal>
        )}
      </AnimatePresence>

      {/* ── Year view modal ── */}
      <AnimatePresence>
        {yearViewModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setYearViewModal(false)} />
            <motion.div className="relative bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
              <div className="px-5 py-4 border-b border-border bg-card rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Расходы за год</h3>
                  <button onClick={() => setYearViewModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
                </div>
                {/* Year navigation */}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => setYearViewYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><ChevronLeft size={15} /></button>
                  <span className="text-lg font-bold px-2">{yearViewYear}</span>
                  <button onClick={() => setYearViewYear(y => y + 1)} disabled={yearViewYear >= thisYear} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 transition-colors"><ChevronRight size={15} /></button>
                  <span className="ml-auto text-sm text-muted-foreground">{yearViewExps.length} записей · <span className="font-semibold text-foreground">{fmtEur(totalYearView)}</span></span>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-border">
                {yearViewExps.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Нет расходов за {yearViewYear} год</div>
                ) : yearViewExps.map(e => {
                  const meta = catMeta(e.category_name)
                  const aptName = apartments.find(a => a.id === e.apartment_id)?.title ?? ''
                  return (
                    <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                        <span className={meta.color}>{meta.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{e.category_name}</span>
                          {e.is_recurring && <span className="text-xs">🔄</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{format(parseISO(e.paid_date), 'd MMM yyyy', { locale: ru })}</span>
                          {apartments.length > 1 && <span>· {aptName}</span>}
                          {e.notes && <span>· {e.notes}</span>}
                        </div>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0">{fmtEur(e.amount)}</span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Period month modal ── */}
      <AnimatePresence>
        {expMonthModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setExpMonthModal(false)} />
            <motion.div className="relative bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <div>
                  <h3 className="font-semibold">{EXP_MONTH_NAMES[periodMonth - 1]} {periodYear}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{periodExpenses.length} записей · {fmtEur(periodMonthTotal)}</p>
                </div>
                <button onClick={() => setExpMonthModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-border">
                {periodExpenses.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Нет расходов за этот месяц</div>
                ) : periodExpenses.map(e => {
                  const meta = catMeta(e.category_name)
                  const aptName = apartments.find(a => a.id === e.apartment_id)?.title ?? ''
                  return (
                    <div key={e.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                        <span className={meta.color}>{meta.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{e.category_name}</span>
                          {e.is_recurring && <span className="text-xs">🔄</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{format(parseISO(e.paid_date), 'd MMM yyyy', { locale: ru })}</span>
                          {apartments.length > 1 && <span>· {aptName}</span>}
                          {e.notes && <span>· {e.notes}</span>}
                        </div>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0">{fmtEur(e.amount)}</span>
                      <div className="flex gap-0.5 flex-shrink-0">
                        <button onClick={() => { startEdit(e); setExpMonthModal(false) }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bar-click month modal ── */}
      <AnimatePresence>
        {barClickMonth !== null && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setBarClickMonth(null)} />
            <motion.div className="relative bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
              <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card rounded-t-2xl">
                <div>
                  <h3 className="font-semibold">{clickedMonthName} {periodYear}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{clickedExps.length} записей · {fmtEur(clickedTotal)}</p>
                </div>
                <button onClick={() => setBarClickMonth(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-border">
                {clickedExps.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Нет расходов за этот месяц</div>
                ) : clickedExps.map(e => {
                  const meta = catMeta(e.category_name)
                  const aptName = apartments.find(a => a.id === e.apartment_id)?.title ?? ''
                  return (
                    <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                        <span className={meta.color}>{meta.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{e.category_name}</span>
                          {e.is_recurring && <span className="text-xs">🔄</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{format(parseISO(e.paid_date), 'd MMM yyyy', { locale: ru })}</span>
                          {apartments.length > 1 && <span>· {aptName}</span>}
                          {e.notes && <span>· {e.notes}</span>}
                        </div>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0">{fmtEur(e.amount)}</span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}

// ─── Settings Section ────────────────────────────────────────────────────────

function SettingsSection({ userId }: { userId: string }) {
  const { theme, setTheme } = useTheme()
  const qc = useQueryClient()
  const [nameInput, setNameInput] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)

  const { data: profileData } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle()
      return data
    },
  })

  useEffect(() => {
    if (profileData?.name) setNameInput(profileData.name)
  }, [profileData])

  const saveName = async () => {
    setNameSaving(true)
    await supabase.from('profiles').update({ name: nameInput.trim() } as never).eq('id', userId)
    await qc.invalidateQueries({ queryKey: ['profile', userId] })
    setNameSaving(false)
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  const themes: Array<{
    id: AppTheme
    name: string
    description: string
    preview: { sidebar: string; bg: string; card: string; accent: string }
  }> = [
    {
      id: 'standard',
      name: 'Стандартный',
      description: 'Тёплые тона, тёмный сайдбар',
      preview: { sidebar: '#1e2a3e', bg: '#f7f4f0', card: '#fefcf9', accent: '#7c4a2e' },
    },
    {
      id: 'light',
      name: 'Светлый',
      description: 'Чистый и воздушный дизайн',
      preview: { sidebar: '#b8c7d8', bg: '#edf2f7', card: '#ffffff', accent: '#3b6fd4' },
    },
    {
      id: 'business',
      name: 'Бизнес',
      description: 'Тёмный профессиональный вид',
      preview: { sidebar: '#101318', bg: '#181b24', card: '#1e2230', accent: '#d4a84b' },
    },
    {
      id: 'notebook',
      name: 'Блокнот',
      description: 'Бумажный тёплый стиль с кольцами',
      preview: { sidebar: '#201a15', bg: '#e8e1d6', card: '#faf7f2', accent: '#c47830' },
    },
  ]

  return (
    <div>
      <h2 className="text-xl font-display font-semibold mb-2">Настройки</h2>
      <p className="text-sm text-muted-foreground mb-6">Персонализация профиля и внешнего вида</p>

      {/* Profile name */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6">
        <h3 className="font-semibold mb-1">Профиль</h3>
        <p className="text-sm text-muted-foreground mb-5">Ваше имя отображается в приветствии на дашборде</p>
        <div className="flex gap-3 items-end max-w-sm">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Имя</label>
            <input
              type="text"
              value={nameInput}
              onChange={e => { setNameInput(e.target.value); setNameSaved(false) }}
              onKeyDown={e => e.key === 'Enter' && saveName()}
              placeholder="Введите ваше имя"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full"
            />
          </div>
          <button
            onClick={saveName}
            disabled={nameSaving || !nameInput.trim()}
            className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50 flex-shrink-0"
          >
            {nameSaving ? 'Сохраняем…' : nameSaved ? '✓ Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Theme picker */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)]">
        <h3 className="font-semibold mb-1">Тема оформления</h3>
        <p className="text-sm text-muted-foreground mb-5">Выберите стиль интерфейса</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {themes.map(t => {
            const isActive = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`relative flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                  isActive
                    ? 'border-primary shadow-lg shadow-primary/10'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                {/* Active checkmark */}
                {isActive && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}

                {/* Preview */}
                <div className="w-full h-16 rounded-xl overflow-hidden flex border border-border/40">
                  {/* Sidebar preview */}
                  <div className="w-8 flex-shrink-0 flex flex-col gap-1 p-1.5 pt-2 relative" style={{ background: t.preview.sidebar }}>
                    {/* Notebook rings in preview */}
                    {t.id === 'notebook' && (
                      <div className="absolute left-0.5 top-1 bottom-1 flex flex-col justify-around" style={{ gap: 0 }}>
                        {[0,1,2,3].map(i => (
                          <div key={i} className="w-2 h-2 rounded-full border" style={{ borderColor: '#8a7a65', background: t.preview.sidebar }} />
                        ))}
                      </div>
                    )}
                    <div className="w-full h-1.5 rounded-full opacity-60" style={{ background: t.preview.card }} />
                    <div className="w-full h-1.5 rounded-full opacity-40" style={{ background: t.preview.card }} />
                    <div className="w-full h-1.5 rounded-full opacity-40" style={{ background: t.preview.card }} />
                    <div className="w-full h-1.5 rounded-full" style={{ background: t.preview.accent, opacity: 0.8 }} />
                  </div>
                  {/* Content preview */}
                  <div className="flex-1 p-1.5 flex flex-col gap-1 relative overflow-hidden" style={{
                    background: t.preview.bg,
                    ...(t.id === 'notebook' ? {
                      backgroundImage: 'repeating-linear-gradient(transparent, transparent 6px, rgba(0,0,0,0.08) 6px, rgba(0,0,0,0.08) 7px)',
                    } : {})
                  }}>
                    <div className="flex gap-1">
                      <div className="flex-1 h-4 rounded" style={{ background: t.preview.card }} />
                      <div className="flex-1 h-4 rounded" style={{ background: t.preview.card }} />
                    </div>
                    <div className="h-3 rounded" style={{ background: t.preview.accent, opacity: 0.3 }} />
                    <div className="flex gap-1 mt-auto">
                      <div className="w-8 h-2 rounded" style={{ background: t.preview.accent, opacity: 0.6 }} />
                      <div className="flex-1 h-2 rounded opacity-30" style={{ background: t.preview.card === '#ffffff' ? '#888' : t.preview.card }} />
                    </div>
                  </div>
                </div>

                {/* Labels */}
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Дашборд', icon: <LayoutDashboard size={16} /> },
  { id: 'bookings', label: 'Бронирования', icon: <CalendarCheck size={16} /> },
  { id: 'calendar', label: 'Календарь', icon: <CalendarDays size={16} /> },
  { id: 'cleaning', label: 'Уборка', icon: <Brush size={16} /> },
  { id: 'expenses', label: 'Расходы', icon: <Receipt size={16} /> },
  { id: 'apartments', label: 'Апартаменты', icon: <Building2 size={16} /> },
  { id: 'settings', label: 'Настройки', icon: <Settings size={16} /> },
]

export default function OwnerDashboard() {
  const { user, signOut } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [section, setSection] = useState<Section>('dashboard')
  const [topView, setTopView] = useState<'owner' | 'cleaner'>('owner')
  const [showAddBooking, setShowAddBooking] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [calSelectedApt, setCalSelectedApt] = useState(() => getLastAptId())

  const { data: apartments = [] } = useQuery({
    queryKey: ['owner-apartments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('apartments')
        .select('*, apartment_images(*)')
        .eq('owner_id', user!.id)
        .order('title')
      if (error) throw error
      return data as Apartment[]
    },
    enabled: !!user,
  })

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['owner-bookings-full', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, apartments!inner(title, address, owner_id), cleaning_tasks(*)')
        .eq('apartments.owner_id', user!.id)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data as BookingRow[]
    },
    enabled: !!user,
  })

  if (!user) return null

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['owner-bookings-full'] })
    qc.invalidateQueries({ queryKey: ['owner-apartments'] })
    qc.invalidateQueries({ queryKey: ['booking-notes'] })
    // Also refresh calendar so edits appear immediately there too
    qc.invalidateQueries({ queryKey: ['cal-bookings'] })
    qc.invalidateQueries({ queryKey: ['cal-prices'] })
  }

  const pendingCount = bookings.filter(b => b.status === 'pending').length
  const handleSignOutRoot = async () => { await signOut(); navigate('/') }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Mobile nav backdrop */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar-root w-52 flex-shrink-0 flex flex-col py-5 px-3 z-50
        fixed inset-y-0 left-0 md:relative md:translate-x-0 transition-transform duration-200
        ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${topView === 'cleaner' ? 'md:hidden' : ''}
      `}>
        {/* Logo — links back to public home */}
        <button onClick={() => navigate('/')} className="px-2 mb-6 flex items-center gap-2.5 hover:opacity-75 transition-opacity text-left">
          <span className="text-2xl">{theme === 'notebook' ? '📓' : '🏡'}</span>
          <span className="font-display font-bold text-base tracking-tight" style={{ color: 'hsl(var(--sidebar-logo-fg))' }}>
            Блокнот
          </span>
        </button>

        {/* Nav */}
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => { setSection(item.id); setMobileNavOpen(false) }}
            className={`sidebar-nav-item flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 mb-0.5 relative ${
              section === item.id ? 'active' : ''
            }`}
          >
            {item.icon}
            {item.label}
            {item.id === 'bookings' && pendingCount > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}

        {/* User avatar — bottom */}
        <div className="mt-auto pt-4 mx-1" style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}>
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: 'hsl(var(--sidebar-active-bg))', color: 'hsl(var(--sidebar-active-fg))' }}
            >
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--sidebar-logo-fg))' }}>
                {user?.email?.split('@')[0] ?? 'Пользователь'}
              </p>
              <p className="text-[10px]" style={{ color: 'hsl(var(--sidebar-fg))' }}>Администратор</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Notebook spiral rings strip */}
      {theme === 'notebook' && (
        <div
          className="flex-shrink-0 w-6 z-10"
          style={{
            background: 'hsl(24, 18%, 8%)',
            backgroundImage: `
              radial-gradient(
                circle at 50% 50%,
                hsl(24, 18%, 5%) 4.5px,
                hsl(30, 16%, 40%) 4.5px,
                hsl(30, 16%, 40%) 6.5px,
                hsl(28, 12%, 18%) 6.5px,
                hsl(28, 12%, 18%) 8px,
                transparent 8px
              )
            `,
            backgroundSize: '24px 34px',
            backgroundRepeat: 'repeat-y',
            backgroundPosition: 'center 8px',
          }}
        />
      )}

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top header bar */}
        <header className="flex-shrink-0 h-14 bg-card border-b border-border relative flex items-center px-3 md:px-6">
          {/* Hamburger — mobile only */}
          {topView !== 'cleaner' && (
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors mr-1 flex-shrink-0">
              <Menu size={18} />
            </button>
          )}
          {/* Center tabs — absolutely centered */}
          <div className="absolute inset-x-0 flex justify-center pointer-events-none">
            <nav className="flex items-end gap-4 md:gap-8 h-14 pointer-events-auto">
              <button onClick={() => navigate('/')}
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium h-full border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors pb-0">
                <Home size={14} /> Главная
              </button>
              <button onClick={() => setTopView('owner')}
                className={`flex items-center gap-1.5 text-sm font-medium h-full border-b-2 transition-colors pb-0 ${topView === 'owner' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <LayoutDashboard size={14} /> <span className="hidden sm:inline">Кабинет</span>
              </button>
              <button onClick={() => setTopView('cleaner')}
                className={`flex items-center gap-1.5 text-sm font-medium h-full border-b-2 transition-colors pb-0 ${topView === 'cleaner' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <Brush size={14} /> <span className="hidden sm:inline">Уборка</span>
              </button>
            </nav>
          </div>
          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSection('bookings')} className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Bell size={17} />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
            <button onClick={handleSignOutRoot}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted">
              <LogOut size={14} /> <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </header>

        {/* Content area — cleaner view */}
        {topView === 'cleaner' && (
          <main className="flex-1 flex overflow-hidden">
            <CleanerView bookings={bookings} onRefresh={invalidate} />
          </main>
        )}
        <main className={`flex-1 relative min-h-0 ${topView === 'cleaner' ? 'hidden' : ''} ${section === 'dashboard' || section === 'calendar' ? 'overflow-y-auto xl:overflow-hidden flex flex-col' : 'overflow-y-auto'}`}
          style={section === 'dashboard' ? {
            backgroundImage: 'radial-gradient(ellipse at 15% 0%, hsl(var(--primary) / 0.05) 0%, transparent 55%), radial-gradient(ellipse at 85% 95%, hsl(var(--primary) / 0.04) 0%, transparent 50%)',
          } : undefined}>
        <div className={`mx-auto ${
          section === 'calendar' ? 'px-2 py-2 md:px-4 md:py-4 w-full xl:flex-1 xl:min-h-0 xl:flex xl:flex-col' :
          section === 'dashboard' ? 'px-2 py-2 md:px-4 md:py-3 w-full xl:flex-1 xl:min-h-0 xl:flex xl:flex-col' :
          'px-3 py-4 md:px-6 md:py-8 max-w-4xl'
        }`}>
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className={section === 'dashboard' || section === 'calendar' ? 'xl:flex-1 xl:min-h-0 xl:flex xl:flex-col' : ''}>
              {section === 'dashboard' && (
                <DashboardOverview bookings={bookings} apartments={apartments}
                  onGoTo={setSection} ownerId={user.id}
                />
              )}
              {section === 'apartments' && (
                <ApartmentsSection apartments={apartments} bookings={bookings} ownerId={user.id} onRefresh={invalidate} />
              )}
              {section === 'bookings' && (
                <BookingsSection bookings={bookings} isLoading={isLoading} onRefresh={invalidate} onAddBooking={() => setShowAddBooking(true)} apartments={apartments} />
              )}
              {section === 'calendar' && apartments.length > 0 && (
                <CalendarSection
                  apartments={apartments}
                  selectedApt={(calSelectedApt || apartments[0]?.id) ?? ''}
                  setSelectedApt={(id: string) => { setCalSelectedApt(id); saveLastAptId(id) }}
                />
              )}
              {section === 'calendar' && apartments.length === 0 && (
                <div>
                  <h2 className="text-xl font-display font-semibold mb-6">Календарь</h2>
                  <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
                    Добавьте квартиру, чтобы увидеть календарь
                  </div>
                </div>
              )}
              {section === 'cleaning' && <CleaningSection bookings={bookings} onRefresh={invalidate} />}
              {section === 'expenses' && <ExpensesSection apartments={apartments} />}
              {section === 'settings' && <SettingsSection userId={user.id} />}
            </motion.div>
          </AnimatePresence>
        </div>
        </main>
      </div>{/* end main content column */}

      {/* Add Booking Modal */}
      <AnimatePresence>
        {showAddBooking && (
          apartments.length > 0
            ? <AddBookingModal apartments={apartments} onClose={() => setShowAddBooking(false)} onSaved={invalidate} />
            : (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm px-4">
                <div className="bg-card rounded-2xl p-8 text-center max-w-sm shadow-[var(--shadow-card-hover)]">
                  <p className="text-muted-foreground mb-4">Сначала добавьте квартиру во вкладке «Квартиры»</p>
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => setShowAddBooking(false)} className="px-4 py-2 rounded-xl text-sm bg-muted text-muted-foreground">Закрыть</button>
                    <button onClick={() => { setShowAddBooking(false); setSection('apartments') }} className="btn-primary rounded-xl px-4 py-2 text-sm">Перейти к квартирам</button>
                  </div>
                </div>
              </div>
            )
        )}
      </AnimatePresence>
    </div>
  )
}

