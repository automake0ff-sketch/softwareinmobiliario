import { NavLink, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Columns3,
  Building2,
  MessageCircle,
  Zap,
  Bot,
  BarChart3,
  Users2,
  Settings,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Lock,
  Puzzle,
  Shield,
} from 'lucide-react'
import clsx from 'clsx'
import { useStore, SECTION_PLAN_REQUIREMENTS, PLAN_ORDER } from '../../lib/store'
import { getInitials } from '../../utils/formatters'

const PLAN_LABELS = { starter: 'Básico', profesional: 'Pro', agencia: 'Agencia' }

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, minPlan: null },
  { to: '/pipeline', label: 'Pipeline', icon: Columns3, minPlan: null },
  { to: '/leads', label: 'Leads', icon: Users, minPlan: null },
  { to: '/properties', label: 'Propiedades', icon: Building2, minPlan: null },
  { to: '/conversations', label: 'Conversaciones', icon: MessageCircle, minPlan: null },
  { to: '/automations', label: 'Automatizaciones', icon: Zap, minPlan: null },
  { to: '/automations/templates', label: 'Plantillas', icon: Puzzle, minPlan: null },
  { to: '/agents', label: 'Agentes IA', icon: Bot, minPlan: null },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, minPlan: 'profesional' },
  { to: '/team', label: 'Equipo', icon: Users2, minPlan: 'profesional' },
  { to: '/settings', label: 'Configuración', icon: Settings, minPlan: null },
  { to: '/pricing', label: 'Planes', icon: CreditCard, minPlan: null },
]

const roleLabels = {
  admin: 'Admin',
  agent: 'Agente',
  manager: 'Gerente',
  viewer: 'Visor',
}

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, user, agency, subscription } = useStore()
  const { pathname } = useLocation()
  const userPlan = subscription?.planId || 'starter'

  const isActive = (to) => {
    if (to === '/dashboard') return pathname === '/dashboard'
    if (to === '/leads') return pathname.startsWith('/leads')
    if (to === '/properties') return pathname.startsWith('/properties')
    if (to === '/conversations') return pathname.startsWith('/conversations')
    if (to === '/pipeline') return pathname.startsWith('/pipeline')
    return pathname.startsWith(to)
  }

  const isLocked = (minPlan) => {
    if (!minPlan) return false
    return PLAN_ORDER[userPlan] < PLAN_ORDER[minPlan]
  }

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-screen bg-[#0A0A0F] border-r border-[#1E1E2E] z-30 flex flex-col transition-all duration-300',
        sidebarOpen ? 'w-60' : 'w-[64px]'
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-[#1E1E2E] shrink-0">
        {sidebarOpen ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {agency ? getInitials(agency.name) : 'P'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate gradient-text">
                {agency?.name || 'PropIA'}
              </p>
              <p className="text-[11px] text-[#64748B] truncate">Panel de control</p>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
              P
            </div>
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="shrink-0 ml-auto p-1.5 rounded-md text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#13131A] transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navigation.map(({ to, label, icon: Icon, minPlan }) => {
          const active = isActive(to)
          const locked = isLocked(minPlan)

          const linkContent = (
            <div className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative w-full',
              active && !locked
                ? 'bg-[#1A1A24] text-[#F1F5F9]'
                : locked
                  ? 'text-[#4A4A5E] cursor-not-allowed'
                  : 'text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#13131A]'
            )}>
              {(active && !locked) && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-indigo-500 to-purple-600" />
              )}
              <Icon size={20} className={clsx(
                'shrink-0',
                locked ? 'text-[#4A4A5E]' : active ? 'text-[#818CF8]' : 'text-[#64748B] group-hover:text-[#818CF8]'
              )} />
              {sidebarOpen && <span className="truncate flex-1 text-left">{label}</span>}
              {locked && sidebarOpen && (
                <Lock size={12} className="text-[#4A4A5E] shrink-0" />
              )}
              {locked && minPlan && sidebarOpen && (
                <span className="text-[9px] font-semibold uppercase tracking-wider bg-[#1A1A24] text-[#4A4A5E] px-1.5 py-0.5 rounded shrink-0">
                  {PLAN_LABELS[minPlan]}
                </span>
              )}
              {!sidebarOpen && (
                <div className="absolute left-[64px] ml-2 px-2.5 py-1.5 bg-[#1A1A24] text-[#F1F5F9] text-xs rounded-md shadow-elevated opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 border border-[#2A2A3E] flex items-center gap-2">
                  {label}
                  {locked && <span className="text-[#64748B]">🔒 {PLAN_LABELS[minPlan]}</span>}
                </div>
              )}
            </div>
          )

          if (locked) {
            return (
              <Link
                key={to}
                to="/pricing"
                className="block"
                title={!sidebarOpen ? `${label} (${PLAN_LABELS[minPlan]})` : undefined}
              >
                {linkContent}
              </Link>
            )
          }

          return (
            <NavLink key={to} to={to} className="block" title={!sidebarOpen ? label : undefined}>
              {linkContent}
            </NavLink>
          )
        })}
        {(user?.role === 'admin' || user?.role === 'super_admin') && (
          <NavLink to="/admin" className="block mt-2">
            <div className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative w-full',
              pathname.startsWith('/admin')
                ? 'bg-[#1A1A24] text-[#F1F5F9]'
                : 'text-[#64748B] hover:text-[#F1F5F9] hover:bg-[#13131A]'
            )}>
              {pathname.startsWith('/admin') && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-amber-500 to-orange-600" />
              )}
              <Shield size={20} className={clsx(
                'shrink-0',
                pathname.startsWith('/admin') ? 'text-amber-400' : 'text-[#64748B] group-hover:text-amber-400'
              )} />
              {sidebarOpen && <span className="truncate flex-1 text-left">Admin SaaS</span>}
            </div>
          </NavLink>
        )}
      </nav>

      <div className="border-t border-[#1E1E2E] p-3 shrink-0">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 text-[#818CF8] flex items-center justify-center text-sm font-bold shrink-0 border border-[#2A2A3E]">
              {getInitials(user.name)}
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate text-[#F1F5F9]">{user.name}</p>
                <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-[#64748B] bg-[#1A1A24] px-1.5 py-0.5 rounded">
                  {roleLabels[user.role] || user.role}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1A1A24] animate-pulse" />
            {sidebarOpen && (
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-[#1A1A24] rounded w-24 animate-pulse" />
                <div className="h-2 bg-[#1A1A24] rounded w-16 animate-pulse" />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
