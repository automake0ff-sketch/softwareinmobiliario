import { Outlet } from 'react-router-dom'
import { useStore } from '../../lib/store'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import clsx from 'clsx'

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
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
