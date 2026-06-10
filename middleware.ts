import { clerkMiddleware } from '@clerk/nextjs/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rutas que no requieren autenticación
const publicRoutes = ['/login', '/register', '/pricing', '/api/auth/callback']

export default clerkMiddleware(async (auth, req) => {
  const res = NextResponse.next()
  const { pathname } = req.nextUrl

  // 1. Omitir archivos estáticos
  const isStaticFile = pathname.startsWith('/_next/') || pathname.startsWith('/favicon')
  if (isStaticFile) return res

  // 2. Verificar autenticación con Clerk (Next.js/Onboarding)
  const { userId } = await auth()
  
  // 3. Verificar autenticación con Supabase (Dashboard/Vite)
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const isAuthenticated = !!userId || !!session
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // 4. Lógica de redirección
  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Si está autenticado y trata de ir a login/register, mandarlo al dashboard
  if (isAuthenticated && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
})

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

