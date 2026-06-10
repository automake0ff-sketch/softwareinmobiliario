import { createMiddlewareSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Las rutas /login, /registro, /onboarding, /, /precios → SIEMPRE dejar pasar sin verificar
// Mapeamos los equivalentes en inglés y español para mayor seguridad.
const bypassRoutes = ['/login', '/registro', '/register', '/onboarding', '/precios', '/pricing']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl

  const isBypassRoute = bypassRoutes.some(route => pathname === route || pathname.startsWith(route + '/')) || pathname === '/'
  const isStaticFile = pathname.startsWith('/_next/') || pathname.startsWith('/favicon') || pathname.includes('.')
  const isApiRoute = pathname.startsWith('/api/')

  if (isStaticFile) return res
  if (isApiRoute) return res

  if (isBypassRoute) {
    return res
  }

  // 1. Si NO está autenticado → redirigir a /login
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  // 2. Si está autenticado, consultar la tabla inmosaas:
  // SELECT nombre_empresa FROM inmosaas WHERE user_id = auth.uid()
  try {
    const { data, error } = await supabase
      .from('inmosaas')
      .select('nombre_empresa')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const nombreEmpresa = data?.nombre_empresa

    // Si devuelve null o nombre_empresa está vacío → /onboarding
    if (!nombreEmpresa || nombreEmpresa.trim() === '') {
      if (pathname !== '/onboarding') {
        return NextResponse.redirect(new URL('/onboarding', req.url))
      }
    }
  } catch (err) {
    console.error('Error al verificar nombre_empresa en middleware:', err)
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
