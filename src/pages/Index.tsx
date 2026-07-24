import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Shield, MessageCircle, Euro } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { ApartmentCard } from '@/components/ApartmentCard'
import { SearchBar } from '@/components/SearchBar'

async function fetchApartments() {
  const { data, error } = await supabase
    .from('apartments')
    .select('*, apartment_images(*), custom_pricing(*)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Какие из публичных квартир заняты ПРЯМО СЕЙЧАС — по реальным бронированиям (не по
// blocked_dates: эта таблица используется только для ручной блокировки хозяином и не
// заполняется автоматически при подтверждении брони, поэтому не отражает факт заезда).
async function fetchOccupiedTodayIds(): Promise<Set<string>> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('bookings')
    .select('apartment_id')
    .eq('status', 'accepted')
    .is('deleted_at', null)
    .lte('start_date', today)
    .gt('end_date', today)
  if (error) throw error
  return new Set((data ?? []).map((b) => b.apartment_id))
}

export default function Index() {
  const { t } = useTranslation()
  const { data: apartments, isLoading } = useQuery({ queryKey: ['apartments-public'], queryFn: fetchApartments })
  const { data: occupiedIds } = useQuery({ queryKey: ['apartments-occupied-today'], queryFn: fetchOccupiedTodayIds })

  return (
    <div className="flex flex-col">
      {/* Hero — light beige style */}
      <section className="relative min-h-[360px] sm:min-h-[460px] flex flex-col items-center justify-center text-center px-4 py-12 sm:py-20 bg-secondary">
        <div className="relative z-10 max-w-2xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-2xl sm:text-4xl md:text-5xl font-display font-semibold text-foreground mb-4 break-words"
          >
            {t('hero.title')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-sm sm:text-base text-muted-foreground mb-8 sm:mb-10"
          >
            {t('hero.subtitle')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <SearchBar />
          </motion.div>
        </div>
      </section>

      {/* Apartments list */}
      <section className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">
        <h2 className="text-xl font-display font-semibold text-foreground mb-6">{t('dashboard.myProperties')}</h2>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse bg-muted" />
            ))}
          </div>
        ) : apartments && apartments.length > 0 ? (
          <div className="flex flex-col gap-4">
            {apartments.map((apt, i) => (
              <ApartmentCard key={apt.id} apartment={apt as never} index={i} isOccupied={occupiedIds?.has(apt.id) ?? false} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-16">{t('apartment.noApartments')}</p>
        )}
      </section>

      {/* Features */}
      <section className="bg-card border-t border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl font-display font-semibold text-foreground text-center mb-10">{t('features.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: t('features.verified'), desc: t('features.verifiedDesc') },
              { icon: MessageCircle, title: t('features.direct'), desc: t('features.directDesc') },
              { icon: Euro, title: t('features.transparent'), desc: t('features.transparentDesc') },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center gap-3 p-5 rounded-2xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon size={20} className="text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
