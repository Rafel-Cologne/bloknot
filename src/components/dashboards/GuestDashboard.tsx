import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import type { BookingStatus } from '@/integrations/supabase/types'
import { useState } from 'react'

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-muted text-muted-foreground',
}

export default function GuestDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all')

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['guest-bookings', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, apartments(title, address)')
        .eq('guest_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  const filtered = bookings?.filter((b) => filter === 'all' || b.status === filter) ?? []

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-display font-semibold text-foreground mb-6">{t('dashboard.myBookings')}</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {(['all', 'pending', 'accepted', 'declined', 'cancelled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {s === 'all' ? t('common.all') : t(`booking.status${s.charAt(0).toUpperCase() + s.slice(1)}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="card-base p-8 text-center text-muted-foreground">{t('common.noApartments')}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((booking) => (
            <div key={booking.id} className="card-base p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-foreground">{(booking as never as { apartments: { title: string } }).apartments?.title}</h3>
                  <p className="text-sm text-muted-foreground">{(booking as never as { apartments: { address: string } }).apartments?.address}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {booking.start_date} → {booking.end_date} · {booking.guests_count} {t('apartment.guests')}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${STATUS_COLORS[booking.status as BookingStatus]}`}>
                  {t(`booking.status${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}`)}
                </span>
              </div>
              {booking.total_amount && (
                <p className="mt-2 text-sm font-medium text-primary">{t('common.currency')}{booking.total_amount}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
