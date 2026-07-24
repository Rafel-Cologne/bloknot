import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Logo } from '@/components/Logo'

type Tab = 'signin' | 'signup' | 'forgot' | 'reset'

export default function Auth() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'guest' | 'owner'>('guest')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  // Listen for PASSWORD_RECOVERY event
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTab('reset')
      }
    })
    // Check URL param
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'true') setTab('reset')
    return () => subscription.unsubscribe()
  }, [])

  const showMsg = (type: 'success' | 'error', text: string) => setMessage({ type, text })

  // Translate Supabase error messages to current language
  const translateError = (msg: string): string => {
    const lower = msg.toLowerCase()
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials'))
      return t('auth.errorInvalidCredentials')
    if (lower.includes('email not confirmed'))
      return t('auth.errorEmailNotConfirmed')
    if (lower.includes('user already registered') || lower.includes('already been registered'))
      return t('auth.errorAlreadyRegistered')
    if (lower.includes('password should be at least'))
      return t('auth.errorPasswordTooShort')
    if (lower.includes('for security purposes') || lower.includes('after') && lower.includes('seconds'))
      return t('auth.errorRateLimit')
    if (lower.includes('unable to validate email'))
      return t('auth.errorInvalidEmail')
    return t('common.error')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) showMsg('error', translateError(error.message))
    else navigate('/dashboard')
    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone, role } },
    })
    if (error) showMsg('error', translateError(error.message))
    else showMsg('success', t('auth.emailConfirmation'))
    setLoading(false)
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login?reset=true`,
    })
    if (error) showMsg('error', translateError(error.message))
    else showMsg('success', t('auth.passwordResetSent'))
    setLoading(false)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) showMsg('error', error.message)
    else {
      showMsg('success', t('auth.passwordUpdated'))
      setTimeout(() => navigate('/dashboard'), 1500)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-background">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo className="h-10 w-auto" />
        </div>

        <div className="card-base p-8">
          {/* Tabs */}
          {tab !== 'reset' && (
            <div className="flex border-b border-border mb-6">
              <button
                onClick={() => { setTab('signin'); setMessage(null) }}
                className={`flex-1 pb-3 text-sm font-medium transition-colors ${tab === 'signin' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
              >
                {t('auth.signIn')}
              </button>
              <button
                onClick={() => { setTab('signup'); setMessage(null) }}
                className={`flex-1 pb-3 text-sm font-medium transition-colors ${tab === 'signup' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
              >
                {t('auth.signUp')}
              </button>
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`mb-4 p-3 rounded-xl text-sm ${message.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent'}`}>
              {message.text}
            </div>
          )}

          {/* Sign In */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.email')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.password')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('common.loading') : t('auth.signIn')}
              </button>
              <button
                type="button"
                onClick={() => { setTab('forgot'); setMessage(null) }}
                className="text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
              >
                {t('auth.forgotPassword')}
              </button>
            </form>
          )}

          {/* Sign Up */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="flex flex-col gap-4">
              <input
                type="text" required value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.name')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.email')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              <input
                type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder={t('auth.phone')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.password')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              {/* Role selector */}
              <div className="flex gap-3">
                {(['guest', 'owner'] as const).map((r) => (
                  <label key={r} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${role === r ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="hidden" />
                    <span className="text-sm font-medium">{r === 'guest' ? t('auth.iAmGuest') : t('auth.iAmOwner')}</span>
                  </label>
                ))}
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('common.loading') : t('auth.signUp')}
              </button>
            </form>
          )}

          {/* Forgot Password */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t('auth.forgotPassword')}</p>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.email')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('common.loading') : t('auth.resetPassword')}
              </button>
              <button
                type="button"
                onClick={() => { setTab('signin'); setMessage(null) }}
                className="text-xs text-muted-foreground hover:text-foreground text-center"
              >
                ← {t('auth.signIn')}
              </button>
            </form>
          )}

          {/* Reset Password */}
          {tab === 'reset' && (
            <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
              <h2 className="text-lg font-display font-semibold text-foreground">{t('auth.newPassword')}</h2>
              <input
                type="password" required minLength={6} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('auth.newPassword')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 ring-ring"
              />
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('common.loading') : t('auth.resetPassword')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
