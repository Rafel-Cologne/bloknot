import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useState } from 'react'
import { Eye, EyeOff, UserX } from 'lucide-react'

type DashTab = 'users' | 'apartments' | 'bookings'

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<DashTab>('users')
  const qc = useQueryClient()

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*, user_roles(role)').order('created_at', { ascending: false })
      return data
    },
    enabled: tab === 'users',
  })

  const { data: apartments } = useQuery({
    queryKey: ['admin-apartments'],
    queryFn: async () => {
      const { data } = await supabase.from('apartments').select('*, profiles!owner_id(name, email)').order('created_at', { ascending: false })
      return data
    },
    enabled: tab === 'apartments',
  })

  const { data: bookings } = useQuery({
    queryKey: ['admin-bookings'],
    queryFn: async () => {
      const { data } = await supabase.from('bookings').select('*, apartments(title)').order('created_at', { ascending: false }).limit(50)
      return data
    },
    enabled: tab === 'bookings',
  })

  const toggleUserActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await supabase.from('profiles').update({ is_active: !is_active }).eq('id', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const toggleApartmentPublic = useMutation({
    mutationFn: async ({ id, is_public }: { id: string; is_public: boolean }) => {
      await supabase.from('apartments').update({ is_public: !is_public }).eq('id', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-apartments'] }),
  })

  const TABS: { key: DashTab; label: string }[] = [
    { key: 'users', label: t('dashboard.users') },
    { key: 'apartments', label: t('dashboard.allApartments') },
    { key: 'bookings', label: t('dashboard.allBookings') },
  ]

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-display font-semibold text-foreground mb-6">Admin Panel</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t_) => (
          <button
            key={t_.key}
            onClick={() => setTab(t_.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t_.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {t_.label}
          </button>
        ))}
      </div>

      {/* Users */}
      {tab === 'users' && (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Имя</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Роль</th>
                <th className="text-left px-4 py-3">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    {(u as never as { user_roles: { role: string }[] }).user_roles?.map((r) => r.role).join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleUserActive.mutate({ id: u.id, is_active: u.is_active })}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      title={u.is_active ? 'Заблокировать' : 'Активировать'}
                    >
                      <UserX size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Apartments */}
      {tab === 'apartments' && (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Название</th>
                <th className="text-left px-4 py-3">Собственник</th>
                <th className="text-left px-4 py-3">Публичный</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {apartments?.map((apt) => (
                <tr key={apt.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{apt.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(apt as never as { profiles: { name: string; email: string } }).profiles?.name || (apt as never as { profiles: { name: string; email: string } }).profiles?.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${apt.is_public ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                      {apt.is_public ? 'Да' : 'Нет'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleApartmentPublic.mutate({ id: apt.id, is_public: apt.is_public })}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                    >
                      {apt.is_public ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bookings */}
      {tab === 'bookings' && (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Объект</th>
                <th className="text-left px-4 py-3">Гость</th>
                <th className="text-left px-4 py-3">Даты</th>
                <th className="text-left px-4 py-3">Статус</th>
                <th className="text-left px-4 py-3">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {bookings?.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{(b as never as { apartments: { title: string } }).apartments?.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.guest_name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{b.start_date} → {b.end_date}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{b.status}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{b.total_amount ? `€${b.total_amount}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
