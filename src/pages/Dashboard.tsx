import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import AdminDashboard from '@/components/dashboards/AdminDashboard'
import OwnerDashboard from '@/components/dashboards/OwnerDashboard'
import CleanerDashboard from '@/components/dashboards/CleanerDashboard'
import GuestDashboard from '@/components/dashboards/GuestDashboard'

export default function Dashboard() {
  const { user, roles, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true })
  }, [user, loading, navigate])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-muted-foreground">Загрузка...</div>
      </div>
    )
  }

  if (!user) return null

  // OwnerDashboard and CleanerDashboard manage their own full-screen layout with sidebar
  if (roles.includes('owner')) return <OwnerDashboard />
  if (roles.includes('cleaner')) return <CleanerDashboard />

  // Other dashboards are simple scroll pages — wrap in a scrollable container
  const ScrollShell = ({ children }: { children: ReactNode }) => (
    <div className="flex-1 overflow-y-auto">{children}</div>
  )

  if (roles.includes('admin')) return <ScrollShell><AdminDashboard /></ScrollShell>
  return <ScrollShell><GuestDashboard /></ScrollShell>
}
