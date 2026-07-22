import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Menu,
  Search,
  Bell,
  LogOut,
  Settings,
  User,
  ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabaseClient'
import { getInitials } from '../../utils/formatters'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/pipeline': 'Pipeline',
  '/leads': 'Leads',
  '/properties': 'Propiedades',
  '/conversations': 'Conversaciones',
  '/automations': 'Automatizaciones',
  '/agents': 'Agentes IA',
  '/analytics': 'Analytics',
  '/team': 'Equipo',
  '/settings': 'Configuración',
}

function getBreadcrumbs(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return [{ label: 'Dashboard', path: '/dashboard' }]
  return parts.map((part, i) => {
    const path = '/' + parts.slice(0, i + 1).join('/')
    const decoded = decodeURIComponent(part)
    const label = pageTitles[path] || decoded.charAt(0).toUpperCase() + decoded.slice(1)
    return { label, path }
  })
}

export default function Topbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { setSidebarOpen, sidebarOpen, user } = useStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const breadcrumbs = getBreadcrumbs(pathname)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/leads?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
      setSearchOpen(false)
    }
  }

  const notificationCount = 3

  return (
    <header
      className="fixed top-0 right-0 h-16 bg-[#0A0A0F]/80 backdrop-blur-md border-b border-[#1E1E2E] z-20 flex items-center justify-between px-4 lg:px-6 transition-all duration-300"
      style={{ left: sidebarOpen ? '240px' : '64px' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#13131A] transition-colors"
        >
          <Menu size={20} />
        </button>

        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <span className="text-[#2A2A3E] select-none">/</span>
              )}
              {i < breadcrumbs.length - 1 ? (
                <button
                  onClick={() => navigate(crumb.path)}
                  className="text-[#64748B] hover:text-[#F1F5F9] truncate transition-colors"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-[#F1F5F9] font-semibold truncate">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {searchOpen ? (
          <form onSubmit={handleSearch} className="flex items-center">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => {
                  if (!searchQuery) setSearchOpen(false)
                }}
                placeholder="Buscar leads, propiedades..."
                className="w-64 pl-9 pr-3 py-2 text-sm bg-[#1A1A24] border-[#2A2A3E] rounded-lg focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-all text-[#F1F5F9]"
              />
            </div>
          </form>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#13131A] transition-colors"
          >
            <Search size={20} />
          </button>
        )}

        <button className="relative p-2 rounded-lg text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#13131A] transition-colors">
          <Bell size={20} />
          {notificationCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#EF4444] rounded-full" />
          )}
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-[#13131A] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 text-[#818CF8] flex items-center justify-center text-sm font-bold shrink-0 border border-[#2A2A3E]">
              {user ? getInitials(user.name) : '?'}
            </div>
            <ChevronDown
              size={14}
              className={clsx(
                'text-[#64748B] transition-transform',
                dropdownOpen && 'rotate-180'
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[#13131A] rounded-xl shadow-elevated border border-[#2A2A3E] py-1.5 z-50 animate-fade-up">
              <div className="px-4 py-2.5 border-b border-[#1E1E2E]">
                <p className="text-sm font-semibold text-[#F1F5F9] truncate">
                  {user?.name || 'Usuario'}
                </p>
                <p className="text-xs text-[#64748B] truncate">
                  {user?.email || ''}
                </p>
              </div>
              <button
                onClick={() => { navigate('/settings'); setDropdownOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#1A1A24] transition-colors"
              >
                <User size={16} />
                Mi perfil
              </button>
              <button
                onClick={() => { navigate('/settings'); setDropdownOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#1A1A24] transition-colors"
              >
                <Settings size={16} />
                Configuración
              </button>
              <div className="border-t border-[#1E1E2E] mt-1 pt-1">
                <button
                  onClick={async () => {
                    setDropdownOpen(false)
                    // IMPORTANTE: setUser(null) solo limpia el estado local en memoria.
                    // La sesión real de Supabase (persistida en el navegador) seguía
                    // viva, así que ProtectedRoute la volvía a detectar de inmediato y
                    // te dejaba en la misma pantalla en vez de llevarte al login.
                    await supabase.auth.signOut()
                    useStore.getState().setUser(null)
                    navigate('/login', { replace: true })
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#EF4444] hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
