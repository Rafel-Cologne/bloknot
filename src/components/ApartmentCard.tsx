import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { MapPin, Users } from 'lucide-react'
import { addDays, format } from 'date-fns'
import type { Database } from '@/integrations/supabase/types'

type Apartment = Database['public']['Tables']['apartments']['Row'] & {
  apartment_images: Database['public']['Tables']['apartment_images']['Row'][]
  custom_pricing: Database['public']['Tables']['custom_pricing']['Row'][]
}

interface Props {
  apartment: Apartment
  index?: number
  isOccupied?: boolean
}

function calcAvgPrice(apartment: Apartment): number {
  const today = new Date()
  let total = 0
  for (let i = 0; i < 7; i++) {
    const d = format(addDays(today, i), 'yyyy-MM-dd')
    const custom = apartment.custom_pricing.find((p) => p.date === d)
    total += custom ? custom.price : apartment.price_per_night
  }
  return Math.round(total / 7)
}

export function ApartmentCard({ apartment, index = 0, isOccupied = false }: Props) {
  const { t } = useTranslation()

  const images = [...apartment.apartment_images].sort((a, b) => a.order_index - b.order_index)
  const coverUrl = images[0]?.image_url ?? null
  const avgPrice = calcAvgPrice(apartment)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
    >
      <Link
        to={`/apartments/${apartment.id}`}
        className="group flex gap-4 bg-card rounded-2xl border border-border hover:shadow-card-hover transition-shadow duration-300 overflow-hidden"
      >
        {/* Thumbnail */}
        <div className="relative w-28 h-28 sm:w-36 sm:h-36 flex-shrink-0 bg-muted overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={apartment.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl text-muted-foreground/30">🏠</div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 py-3 pr-4 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground text-base leading-snug line-clamp-1">{apartment.title}</h3>
              <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-lg font-medium ${
                isOccupied ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {isOccupied ? t('dashboard.statusBlocked') : t('dashboard.statusFree')}
              </span>
            </div>

            {apartment.address && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <MapPin size={11} /> {apartment.address}
              </p>
            )}

            {apartment.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {apartment.description}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users size={11} />
              <span>{apartment.max_guests} {t('apartment.guests')}</span>
            </div>
            <div>
              <span className="font-semibold text-primary text-sm">{t('common.currency')}{avgPrice}</span>
              <span className="text-xs text-muted-foreground"> {t('apartment.perNight')}</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
