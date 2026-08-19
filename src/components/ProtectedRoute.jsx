import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../lib/store'

const BACKEND = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '').replace(/\/$/, '')

// Rutas accesibles incluso sin un plan activo (necesarias para poder pagar,
// o para revisar/cambiar el método de pago si el cobro falló).
const PLAN_EXEMPT_PATHS = ['/pricing', '/settings']

export default function ProtectedRoute() {
  const [status, setStatus] = useState('loading')
  const { user: storeUser, setUser, setAgency, subscription, fetchSubscription } = useStore()
  const location = useLocation()

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          if (mounted) setStatus('no-auth')
          return
        }

        // Si el store ya tiene al usuario con token válido, dejar pasar directamente
        if (storeUser?.id === session.user.id && storeUser?.token) {
          if (mounted) setStatus('auth')
          return
        }

        // Si hay sesión de Supabase pero no hay token en el store,
        // sincronizar con el backend para obtenerlo
        try {
          const res = await fetch(`${BACKEND}/api/auth/social-login-or-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: session.user.email,
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              supabase_uid: session.user.id,
            }),
          })

          if (res.ok) {
            const loginData = await res.json()
            // Guard crítico: asegurar que loginData.user existe antes de usarlo
            if (loginData?.user?.id) {
              if (mounted) {
                setUser(loginData.user)
                setAgency(loginData.agency || null)
                setStatus(loginData.user.agency_id ? 'auth' : 'no-profile')
              }
            } else {
              // Respuesta ok pero sin user válido — dejar pasar si hay sesión Supabase
              if (mounted) setStatus('auth')
            }
          } else {
            // Backend no responde correctamente — si hay sesión de Supabase, dejamos pasar
            // El backend validará el JWT en cada request protegida
            if (mounted) setStatus('auth')
          }
        } catch (fetchErr) {
          // Sin conexión al backend — si hay sesión Supabase o store con user, dejar pasar
          console.warn('[ProtectedRoute] Backend inalcanzable:', fetchErr?.message)
          if (mounted) setStatus(storeUser?.id || storeUser?.token ? 'auth' : 'no-auth')
        }
      } catch (err) {
        console.error('[ProtectedRoute] Error:', err)
        if (mounted) setStatus('no-auth')
      }
    }

    check()

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        if (mounted) setStatus('no-auth')
      } else {
        check()
      }
    })

    return () => {
      mounted = false
      authSub.unsubscribe()
    }
  }, [storeUser?.id, storeUser?.token])

  // En cuanto hay sesión válida, comprobar el estado real del plan por su
  // cuenta (no depender de que otra pantalla lo haya refrescado antes) —
  // así una pestaña nueva o un acceso directo a /dashboard siempre tiene
  // una respuesta fresca en vez de un dato de sesión potencialmente viejo.
  useEffect(() => {
    if (status === 'auth' && !subscription) {
      fetchSubscription()
    }
  }, [status, subscription, fetchSubscription])

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

  // Mientras se resuelve el estado real del plan, no bloquear todavía
  // (evita un parpadeo/redirect falso mientras carga).
  if (status === 'auth' && subscription === null) {
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

  // Solo un plan realmente activo (pago confirmado) da acceso al resto de la
  // app. 'trialing'/'inactive' son los estados por defecto nada más
  // registrarse — si se dejaran pasar, cualquiera accedería sin pagar nunca,
  // justo lo contrario de lo que se pide aquí.
  const planActive = subscription?.status === 'active'
  if (!planActive && !PLAN_EXEMPT_PATHS.includes(location.pathname)) {
    return <Navigate to="/pricing" replace />
  }

  return <Outlet />
}

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
