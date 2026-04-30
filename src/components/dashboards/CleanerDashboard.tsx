import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Clock, Banknote, ChevronDown } from 'lucide-react'
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
  bookings: {
    id: string
    start_date: string
    end_date: string
    guest_name: string
    guest_phone: string
    guests_count: number
    share_contact_with_cleaner: boolean
    source: string
    owner_notes: string | null
    apartments: {
      title: string
      address: string
    }
  }
}

const SOURCE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  other: 'Частный',
  platform: 'Платформа',
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onRefresh }: { task: TaskRow; onRefresh: () => void }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const booking = task.bookings
  const apt = booking?.apartments
  const isDone = task.status === 'done'
  const isOwnerTransfer = task.payment_method === 'owner_transfer'
  const isGuestCash = task.payment_method === 'guest_cash'
  const isPaid = task.payment_status === 'paid'
  const today = new Date().toISOString().slice(0, 10)
  const isUpcoming = booking?.start_date >= today

  const nights = booking
    ? Math.max(
        1,
        Math.round(
          (new Date(booking.end_date).getTime() -
            new Date(booking.start_date).getTime()) /
            86400000,
        ),
      )
    : 1

  const markDone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('cleaning_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', task.id)
      if (error) throw error
    },
    onSuccess: () => {
      onRefresh()
      qc.invalidateQueries({ queryKey: ['cleaner-tasks'] })
    },
  })

  // Ekaterina marks guest cash received (only for guest_cash tasks after she's done)
  const markGuestPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('cleaning_tasks')
        .update({ payment_status: 'paid' })
        .eq('id', task.id)
      if (error) throw error
    },
    onSuccess: () => {
      onRefresh()
      qc.invalidateQueries({ queryKey: ['cleaner-tasks'] })
    },
  })

  return (
    <div
      className={`bg-card border rounded-2xl overflow-hidden shadow-[var(--shadow-card)] transition-opacity ${
        !isUpcoming && !isDone ? 'opacity-60' : 'border-border'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        {/* Date tile */}
        <div className="flex-shrink-0 text-center bg-secondary rounded-xl px-2.5 py-1.5 min-w-[72px]">
          <div className="text-xs font-bold text-foreground leading-tight">
            {booking?.start_date?.slice(5).replace('-', '.') ?? '—'}
          </div>
          <div className="text-[10px] text-muted-foreground">{nights} н.</div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate max-w-[180px]">
              {apt?.title ?? '—'}
            </span>
            {booking?.source && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                {SOURCE_LABELS[booking.source] ?? booking.source}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{apt?.address}</p>
        </div>

        {/* Status chips */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          {isDone ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
              ✓ Убрано
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
              ⏳ Нужна уборка
            </span>
          )}
          {isOwnerTransfer && isPaid && (
            <span className="text-[10px] text-green-700">✓ оплата получена</span>
          )}
          {isOwnerTransfer && !isPaid && (
            <span className="text-[10px] text-muted-foreground">
              💸 €{task.cleaning_fee} от хозяина
            </span>
          )}
          {isGuestCash && isPaid && (
            <span className="text-[10px] text-green-700">✓ гость заплатил</span>
          )}
          {isGuestCash && !isPaid && (
            <span className="text-[10px] text-purple-700">💳 €{task.cleaning_fee} от гостя</span>
          )}
        </div>

        <ChevronDown
          size={14}
          className={`text-muted-foreground flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {booking?.start_date} → {booking?.end_date}
                {booking?.guests_count ? (
                  <span className="ml-3">👥 {booking.guests_count} гостей</span>
                ) : null}
              </p>

              {/* Show contact if allowed */}
              {booking?.share_contact_with_cleaner && booking.guest_name && (
                <p className="text-xs text-muted-foreground">
                  Гость: {booking.guest_name}
                  {booking.guest_phone ? ` · 📞 ${booking.guest_phone}` : ''}
                </p>
              )}

              {/* Owner notes */}
              {booking?.owner_notes && (
                <p className="text-xs bg-secondary rounded-lg px-3 py-2 text-foreground">
                  📝 {booking.owner_notes}
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {!isDone && (
                  <button
                    onClick={() => markDone.mutate()}
                    disabled={markDone.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    <CheckCircle2 size={14} />
                    {markDone.isPending ? 'Сохраняем…' : 'Уборка выполнена'}
                  </button>
                )}
                {isGuestCash && isDone && !isPaid && (
                  <button
                    onClick={() => markGuestPaid.mutate()}
                    disabled={markGuestPaid.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors disabled:opacity-60"
                  >
                    <Banknote size={14} />
                    Получила €{task.cleaning_fee} от гостя
                  </button>
                )}
                {isDone && isOwnerTransfer && !isPaid && (
                  <p className="text-xs text-muted-foreground italic py-1">
                    Ждём перевода от хозяина
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CleanerDashboard() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['cleaner-tasks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaning_tasks')
        .select(
          '*, bookings(id, start_date, end_date, guest_name, guest_phone, guests_count, share_contact_with_cleaner, source, owner_notes, apartments(title, address))',
        )
        .eq('cleaner_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TaskRow[]
    },
    enabled: !!user,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['cleaner-tasks'] })

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (tasks ?? []).filter(
    (t) => t.bookings?.start_date >= today && t.status !== 'done',
  )
  const done = (tasks ?? []).filter((t) => t.status === 'done')
  const other = (tasks ?? []).filter(
    (t) => t.bookings?.start_date < today && t.status !== 'done',
  )

  // Balance calculations
  const pendingFromOwners = (tasks ?? [])
    .filter((t) => t.payment_method === 'owner_transfer' && t.payment_status !== 'paid')
    .reduce((s, t) => s + t.cleaning_fee, 0)

  const receivedFromGuests = (tasks ?? [])
    .filter((t) => t.payment_method === 'guest_cash' && t.payment_status === 'paid')
    .reduce((s, t) => s + t.cleaning_fee, 0)

  const totalEarned = (tasks ?? [])
    .filter((t) => t.payment_status === 'paid')
    .reduce((s, t) => s + t.cleaning_fee, 0)

  if (!user) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-display font-semibold text-foreground mb-6">
        Панель уборщицы
      </h1>

      {/* Balance */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock size={13} />
            <span className="text-xs">Жду от хозяев</span>
          </div>
          <p className={`text-2xl font-bold ${pendingFromOwners > 0 ? 'text-amber-600' : 'text-foreground'}`}>
            €{pendingFromOwners}
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Banknote size={13} />
            <span className="text-xs">Получила нал.</span>
          </div>
          <p className="text-2xl font-bold text-purple-700">€{receivedFromGuests}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <CheckCircle2 size={13} />
            <span className="text-xs">Всего получено</span>
          </div>
          <p className="text-2xl font-bold text-green-700">€{totalEarned}</p>
        </div>
      </div>

      {/* Tasks */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl animate-pulse bg-muted" />
          ))}
        </div>
      ) : !tasks?.length ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          Заданий пока нет. Хозяин добавит уборку при создании брони.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock size={12} />
                Нужна уборка ({upcoming.length})
              </h3>
              <div className="flex flex-col gap-3">
                {[...upcoming]
                  .sort((a, b) =>
                    a.bookings?.start_date?.localeCompare(b.bookings?.start_date ?? '') ?? 0,
                  )
                  .map((t) => (
                    <TaskCard key={t.id} task={t} onRefresh={invalidate} />
                  ))}
              </div>
            </div>
          )}

          {/* Overdue (past, not done) */}
          {other.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-destructive uppercase tracking-wide mb-3">
                ⚠️ Просрочено ({other.length})
              </h3>
              <div className="flex flex-col gap-3">
                {other.map((t) => (
                  <TaskCard key={t.id} task={t} onRefresh={invalidate} />
                ))}
              </div>
            </div>
          )}

          {/* Done */}
          {done.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CheckCircle2 size={12} />
                Выполнено ({done.length})
              </h3>
              <div className="flex flex-col gap-3">
                {done.map((t) => (
                  <TaskCard key={t.id} task={t} onRefresh={invalidate} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
