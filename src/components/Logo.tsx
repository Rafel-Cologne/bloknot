import { useTheme } from '@/contexts/ThemeContext'
import logoLightBg from '@/assets/logo-light-bg.png'
import logoDarkBg from '@/assets/logo-dark-bg.png'

// Which themes render each surface with a DARK background (needs the white/light logo variant).
const DARK_CARD_THEMES = new Set(['business'])                    // bg-card / bg-background is dark only in "business"
const DARK_SIDEBAR_THEMES = new Set(['standard', 'business', 'notebook']) // sidebar is dark in all but "light"

/**
 * Bloknot logo (icon + wordmark), auto-switching between the navy variant (light backgrounds)
 * and the white variant (dark backgrounds) based on the current theme and where it's placed.
 */
export function Logo({ surface = 'card', className = 'h-7 w-auto' }: { surface?: 'card' | 'sidebar'; className?: string }) {
  const { theme } = useTheme()
  const isDark = surface === 'sidebar' ? DARK_SIDEBAR_THEMES.has(theme) : DARK_CARD_THEMES.has(theme)
  return <img src={isDark ? logoDarkBg : logoLightBg} alt="Bloknot" className={className} />
}
