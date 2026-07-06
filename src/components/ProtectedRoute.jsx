import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../lib/store'

// Used as layout wrapper: <Route element={<ProtectedRoute />}>
export default function ProtectedRoute() {
  const [status, setStatus] = useState('loading')
  const { user: storeUser } = useStore()

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          if (mounted) setStatus('no-auth')
          return
        }

        // FIX: Primero verifica el store (que ya fue actualizado en OnboardingPage)
        if (storeUser?.id === session.user.id) {
          if (mounted) setStatus('auth')
          return
        }

        // Si no está en el store, verifica la tabla users real (no inmosaas que no existe)
        const { data: profile, error } = await supabase
          .from('users')
          .select('id, agency_id')
          .eq('id', session.user.id)
          .maybeSingle()

        if (error) {
          console.error('Error fetching profile:', error)
          // En caso de error de permisos RLS, dejar pasar — el backend validará el JWT
          if (mounted) setStatus('auth')
          return
        }

        // Si existe en users con agencia asignada, permitir acceso
        if (profile?.id && profile?.agency_id) {
          if (mounted) setStatus('auth')
        } else if (profile?.id) {
          // Existe pero sin agencia — probablemente necesita onboarding
          if (mounted) setStatus('no-profile')
        } else {
          // No existe en users todavía — primer login, ir a onboarding
          if (mounted) setStatus('no-profile')
        }
      } catch (err) {
        console.error('Auth check error:', err)
        if (mounted) setStatus('no-auth')
      }
    }

    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          if (mounted) setStatus('no-auth')
        } else {
          check()
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [storeUser])

  if (status === 'loading') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#080811'
      }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid rgba(99,102,241,0.3)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (status === 'no-auth') return <Navigate to="/login" replace />
  if (status === 'no-profile') return <Navigate to="/onboarding" replace />

  // Outlet renders the nested child routes
  return <Outlet />
}

// Named export for public routes (redirect to dashboard if already logged in)
export function PublicRoute({ children }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? 'auth' : 'no-auth')
    })
  }, [])

  if (status === 'loading') return null
  if (status === 'auth') return <Navigate to="/dashboard" replace />
  return children
}
