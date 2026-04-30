import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, Users } from 'lucide-react'

export function SearchBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState(2)

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (checkIn) params.set('checkIn', checkIn)
    if (checkOut) params.set('checkOut', checkOut)
    params.set('guests', String(guests))
    navigate(`/?${params.toString()}`)
  }

  return (
    <div className="flex flex-col sm:flex-row bg-card rounded-2xl shadow-card border border-border overflow-hidden max-w-xl mx-auto w-full">
      <input
        type="date"
        value={checkIn}
        onChange={(e) => setCheckIn(e.target.value)}
        className="flex-1 px-4 py-3 bg-transparent text-sm text-foreground outline-none border-b border-border sm:border-b-0 sm:border-r min-w-0"
      />
      <input
        type="date"
        value={checkOut}
        onChange={(e) => setCheckOut(e.target.value)}
        className="flex-1 px-4 py-3 bg-transparent text-sm text-foreground outline-none border-b border-border sm:border-b-0 sm:border-r min-w-0"
      />
      <div className="flex items-center flex-1 sm:flex-none">
        <div className="flex items-center gap-1.5 px-4 py-3 flex-1 sm:flex-none sm:px-3 sm:border-r border-border">
          <Users size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            type="number"
            min={1}
            max={20}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-10 bg-transparent text-sm text-foreground outline-none text-center"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('apartment.guests')}</span>
        </div>
        <button
          onClick={handleSearch}
          className="m-1.5 w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
          aria-label={t('common.search')}
        >
          <Search size={15} />
        </button>
      </div>
    </div>
  )
}
