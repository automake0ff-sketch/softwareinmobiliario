import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// 1. Definimos qué rutas requieren que el usuario haya iniciado sesión obligatoriamente
const esRutaProtegida = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
]);

// 2. Definimos las rutas exclusivas del flujo de registro/onboarding
const esRutaOnboarding = createRouteMatcher(['/onboarding(.*)']);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const url = req.nextUrl;

  // Si intenta entrar a una ruta protegida (como el dashboard) y NO está logueado, Clerk lo manda a /register
  if (esRutaProtegida(req) && !userId) {
    return NextResponse.redirect(new URL('/register', req.url));
  }

  // Si el usuario YA inició sesión, necesitamos validar su estado de registro en tu SaaS
  if (userId) {
    // Aquí puedes hacer una llamada rápida a tu base de datos de Supabase para comprobar 'onboarding_paso'
    // Por simplicidad en el middleware, si está en el dashboard pero no ha hecho el onboarding, lo redirigimos:
    /*
    Ejemplo de lógica recomendada:
    const { data: usuario } = await supabase.from('usuarios').select('onboarding_paso').eq('clerk_id', userId).single();
    
    if (usuario && usuario.onboarding_paso < 4 && !esRutaOnboarding(req)) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }
    */
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Protege todas las rutas excepto archivos estáticos, imágenes, etc.
    '/((?!_next|[^?]*\.(?:html|css|js|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest))).*',
    // Siempre ejecuta el middleware para las peticiones de la API
    '/(api|trpc)(.*)',
  ],
};
