import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Heart, Users } from 'lucide-react'
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
  // Чисто визуальное сердечко "в избранное" — своего бэкенда для избранного пока нет,
  // состояние только локальное (не сохраняется между визитами).
  const [liked, setLiked] = useState(false)

  const images = [...apartment.apartment_images].sort((a, b) => a.order_index - b.order_index)
  const coverUrl = images[0]?.image_url ?? null
  const avgPrice = calcAvgPrice(apartment)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
    >
      <Link to={`/apartments/${apartment.id}`} className="group block">
        {/* Cover image */}
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted mb-3">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={apartment.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl text-muted-foreground/30">🏠</div>
          )}

          <span className={`absolute top-3 left-3 text-[11px] px-2.5 py-1 rounded-full font-semibold shadow-sm ${
            isOccupied ? 'bg-white/95 text-red-700' : 'bg-white/95 text-green-700'
          }`}>
            {isOccupied ? t('dashboard.statusBlocked') : t('dashboard.statusFree')}
          </span>

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLiked((v) => !v) }}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 backdrop-blur-sm flex items-center justify-center transition-colors"
            aria-label="В избранное"
          >
            <Heart size={17} className={liked ? 'fill-red-500 text-red-500' : 'text-white'} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-1">{apartment.title}</h3>
          </div>

          {apartment.address && (
            <p className="text-xs text-muted-foreground line-clamp-1">{apartment.address}</p>
          )}

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users size={11} />
            <span>{apartment.max_guests} {t('apartment.guests')}</span>
          </div>

          <p className="text-sm mt-0.5">
            <span className="font-semibold text-foreground">{t('common.currency')}{avgPrice}</span>
            <span className="text-muted-foreground"> {t('apartment.perNight')}</span>
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
