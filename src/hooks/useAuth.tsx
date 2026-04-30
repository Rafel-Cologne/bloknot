import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { AppRole } from '@/integrations/supabase/types'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  roles: AppRole[]
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  roles: [],
  signOut: async () => {},
})

async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  return (data ?? []).map((r: { role: string }) => r.role as AppRole)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Subscribe first to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          // Avoid deadlock — defer DB call
          setTimeout(() => {
            fetchRoles(newSession.user.id).then(setRoles)
          }, 0)
        } else {
          setRoles([])
        }
        setLoading(false)
      }
    )

    // 2. Hydrate from existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (existing?.user) {
        setSession(existing)
        setUser(existing.user)
        fetchRoles(existing.user.id).then(setRoles)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setRoles([])
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
