import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, Home, LayoutDashboard, LogIn, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function Header() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border shadow-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-display font-semibold text-xl text-primary">
            <span className="text-2xl">🏡</span>
            bloknot
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Home size={15} />
              Главная
            </Link>
            {user && (
              <Link to="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <LayoutDashboard size={15} />
                Кабинет
              </Link>
            )}
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut size={15} />
                Выйти
              </button>
            ) : (
              <Link to="/login" className="flex items-center gap-1.5 btn-primary text-sm">
                <LogIn size={15} />
                Войти
              </Link>
            )}
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 py-4 flex flex-col gap-3">
          <Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-foreground">
            <Home size={15} /> Главная
          </Link>
          {user && (
            <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-foreground">
              <LayoutDashboard size={15} /> Кабинет
            </Link>
          )}
          <div className="pt-1">
            {user ? (
              <button onClick={handleSignOut} className="flex items-center gap-2 text-sm text-muted-foreground">
                <LogOut size={15} /> Выйти
              </button>
            ) : (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-primary text-sm inline-flex items-center gap-2">
                <LogIn size={15} /> Войти
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
