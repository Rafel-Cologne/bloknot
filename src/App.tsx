import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import Index from '@/pages/Index'
import Auth from '@/pages/Auth'
import Dashboard from '@/pages/Dashboard'
import ApartmentDetail from '@/pages/ApartmentDetail'
import NotFound from '@/pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

// Extracted so useLocation works inside BrowserRouter
function AppLayout() {
  const location = useLocation()
  const { roles } = useAuth()
  // OwnerDashboard/CleanerDashboard строят собственный полноэкранный shell с сайдбаром и не
  // нуждаются в глобальном Header/Footer (см. Dashboard.tsx). Но GuestDashboard (и легаси
  // AdminDashboard) — простые скролл-страницы без своей навигации: без глобального Header
  // у гостя не было ни ссылки "Главная" (чтобы увидеть список квартир для брони), ни "Выйти".
  const hasOwnShell = roles.includes('owner') || roles.includes('admin') || roles.includes('cleaner')
  const isAppShell = location.pathname === '/dashboard' && hasOwnShell

  return (
    <div
      className={`flex flex-col ${isAppShell ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
      style={isAppShell ? { height: '100dvh' } : undefined}
    >
      {!isAppShell && <Header />}
      <main className={`flex-1 flex flex-col${isAppShell ? ' overflow-hidden min-h-0' : ''}`}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/apartments/:id" element={<ApartmentDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!isAppShell && <Footer />}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <AppLayout />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
