import { Outlet, useEffect } from 'react-router-dom'
import { useStore } from '../../lib/store'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { UsageBanner } from '../billing/UsageBanner'
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user = session.user;
        try {
          const respuesta = await fetch('/api/auth/social-login-or-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.user_metadata?.full_name || user.email.split('@')[0],
              supabase_uid: user.id
            })
          });
          if (respuesta.ok) {
            const loginData = await respuesta.json();
            setUser(loginData.user);
            setAgency(loginData.agency);
            api.setAuth(
              loginData.token,
              loginData.user.id,
              loginData.user.role,
              loginData.user.agency_id,
              loginData.user.office_id
            );
          }
        } catch (error) {
          console.error("Error sincronizando sesión social con el backend:", error);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

export default function Layout() {
  const { sidebarOpen } = useStore()

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <Sidebar />

      <Topbar />

      <main
        className={clsx(
          'pt-16 min-h-screen transition-all duration-300',
          sidebarOpen ? 'pl-60' : 'pl-[64px]'
        )}
      >
        <UsageBanner />
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
