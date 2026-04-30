import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="font-display font-semibold text-lg text-primary flex items-center gap-2">
            <span>🏡</span> bloknot
          </Link>
          <p className="text-sm text-muted-foreground text-center">
            {t('features.direct')} · {t('features.transparent')} · {t('features.verified')}
          </p>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} bloknot</p>
        </div>
      </div>
    </footer>
  )
}
