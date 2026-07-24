import { createContext, useContext, useState } from 'react'

export type AppTheme = 'standard' | 'light' | 'business' | 'notebook' | 'saas-dark' | 'saas-light'

interface ThemeContextType {
  theme: AppTheme
  setTheme: (t: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'standard', setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const saved = (localStorage.getItem('bloknot-theme') as AppTheme) ?? 'standard'
    document.documentElement.setAttribute('data-theme', saved)
    return saved
  })

  const setTheme = (t: AppTheme) => {
    setThemeState(t)
    localStorage.setItem('bloknot-theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
