import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users2, Plus, Mail, Phone, Building2, BarChart3,
  TrendingUp, TrendingDown, Award, Star, Target,
  MoreHorizontal, ChevronDown, Filter, UserPlus,
  Shield, Crown, User, Bot, MapPin, X
} from 'lucide-react'
import { useStore } from '../lib/store'
import { getInitials, formatCurrency } from '../utils/formatters'
import { PlanGate } from '../components/billing/PlanGate'

const roleConfig = {
  admin: { label: 'Admin', icon: Shield, color: 'text-err bg-err/10 border-err/20' },
  manager: { label: 'Manager', icon: Crown, color: 'text-blue-500 bg-blue-50 border-blue-200' },
  comercial: { label: 'Comercial', icon: User, color: 'text-ok bg-ok/10 border-ok/20' },
  ia_agent: { label: 'Agente IA', icon: Bot, color: 'text-purple-500 bg-purple-50 border-purple-200' },
}

const initialTeam = [
  { id: 't1', name: 'Carlos Ruiz García', email: 'carlos@inmobiliaria.com', phone: '+34 612 111 222', role: 'manager', office: 'Oficina Centro', assignedLeads: 24, closuresThisMonth: 5, performance: 92, active: true },
  { id: 't2', name: 'Laura Sánchez Pérez', email: 'laura@inmobiliaria.com', phone: '+34 623 222 333', role: 'comercial', office: 'Oficina Centro', assignedLeads: 18, closuresThisMonth: 3, performance: 78, active: true },
  { id: 't3', name: 'Marta Pérez López', email: 'marta@inmobiliaria.com', phone: '+34 634 333 444', role: 'comercial', office: 'Oficina Centro', assignedLeads: 15, closuresThisMonth: 4, performance: 85, active: true },
  { id: 't4', name: 'Javier Mora Díaz', email: 'javier@inmobiliaria.com', phone: '+34 645 444 555', role: 'comercial', office: 'Oficina Centro', assignedLeads: 12, closuresThisMonth: 2, performance: 65, active: true },
  { id: 't5', name: 'Ana Beltrán Ruiz', email: 'ana@inmobiliaria.com', phone: '+34 656 555 666', role: 'ia_agent', office: 'Oficina Centro', assignedLeads: 0, closuresThisMonth: 0, performance: 0, active: true },
  { id: 't6', name: 'Roberto Medina Sánchez', email: 'roberto@inmobiliaria.com', phone: '+34 667 666 777', role: 'comercial', office: 'Oficina Norte', assignedLeads: 20, closuresThisMonth: 6, performance: 95, active: true },
  { id: 't7', name: 'Sofía Guerrero Torres', email: 'sofia@inmobiliaria.com', phone: '+34 678 777 888', role: 'comercial', office: 'Oficina Norte', assignedLeads: 14, closuresThisMonth: 2, performance: 72, active: true },
  { id: 't8', name: 'Diego Navarro Costa', email: 'diego@inmobiliaria.com', phone: '+34 689 888 999', role: 'manager', office: 'Oficina Norte', assignedLeads: 22, closuresThisMonth: 4, performance: 88, active: false },
  { id: 't9', name: 'Elena Rivas Martín', email: 'elena@inmobiliaria.com', phone: '+34 690 999 000', role: 'admin', office: 'Oficina Central', assignedLeads: 0, closuresThisMonth: 0, performance: 0, active: true },
]

const offices = ['Todas las oficinas', 'Oficina Centro', 'Oficina Norte', 'Oficina Central']

export default function TeamPage() {
  const [team, setTeam] = useState(initialTeam)
  const [officeFilter, setOfficeFilter] = useState('Todas las oficinas')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)

  const filtered = officeFilter === 'Todas las oficinas'
    ? team
    : team.filter(m => m.office === officeFilter)

  const activeMembers = filtered.filter(m => m.active)
  const totalClosures = filtered.reduce((sum, m) => sum + m.closuresThisMonth, 0)

  const container = {
    hidden: { opacity: 0 },
    show: { transition: { staggerChildren: 0.04 } }
  }

  const itemAnim = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 }
  }

  return (
    <PlanGate feature="team_management" fullPage>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="space-y-6"
      >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-500 flex items-center justify-center shadow-sm">
            <Users2 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink font-syne">Equipo</h1>
            <p className="text-sm text-muted">
              {activeMembers.length} miembros activos · {totalClosures} cierres este mes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={officeFilter}
              onChange={e => setOfficeFilter(e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2.5 text-sm bg-white border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
            >
              {offices.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted2 pointer-events-none" />
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all text-sm font-medium shadow-sm"
          >
            <UserPlus size={16} />
            Invitar miembro
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card bg-white rounded-2xl border border-border p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface2 flex items-center justify-center mb-4">
            <Users2 size={32} className="text-muted2" />
          </div>
          <h3 className="text-lg font-semibold text-ink mb-1">No hay miembros</h3>
          <p className="text-sm text-muted max-w-sm">Invita a tu primer miembro del equipo para empezar a colaborar.</p>
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((member, i) => {
              const role = roleConfig[member.role] || roleConfig.comercial
              const RoleIcon = role.icon
              const perfColor = member.performance >= 85 ? 'text-ok' : member.performance >= 65 ? 'text-warn' : 'text-err'

              return (
                <motion.div
                  key={member.id}
                  variants={itemAnim}
                  layout
                  className={`bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-card ${
                    member.active ? 'border-border' : 'border-border/60 opacity-60'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-500 flex items-center justify-center text-sm font-bold shadow-sm">
                          {getInitials(member.name)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-ink truncate">{member.name}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium border mt-0.5 ${role.color}`}>
                            <RoleIcon size={10} />
                            {role.label}
                          </span>
                        </div>
                      </div>
                      <button className="p-1 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Mail size={12} className="text-muted2 shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Phone size={12} className="text-muted2 shrink-0" />
                        <span>{member.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <MapPin size={12} className="text-muted2 shrink-0" />
                        <span>{member.office}</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="bg-surface/50 rounded-xl p-2.5 text-center">
                        <p className="text-lg font-bold text-ink">{member.assignedLeads}</p>
                        <p className="text-[10px] text-muted">Leads</p>
                      </div>
                      <div className="bg-surface/50 rounded-xl p-2.5 text-center">
                        <p className="text-lg font-bold text-ink">{member.closuresThisMonth}</p>
                        <p className="text-[10px] text-muted">Cierres</p>
                      </div>
                      <div className="bg-surface/50 rounded-xl p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {member.performance > 0 && (
                            member.performance >= 80
                              ? <TrendingUp size={14} className="text-ok" />
                              : <TrendingDown size={14} className="text-err" />
                          )}
                          <p className={`text-lg font-bold ${member.performance > 0 ? perfColor : 'text-muted2'}`}>
                            {member.performance > 0 ? member.performance : '—'}
                          </p>
                        </div>
                        <p className="text-[10px] text-muted">Rendim.</p>
                      </div>
                    </div>

                    {member.performance > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted">Rendimiento</span>
                          <span className={perfColor}>{member.performance}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              member.performance >= 85 ? 'bg-ok' :
                              member.performance >= 65 ? 'bg-warn' : 'bg-err'
                            }`}
                            style={{ width: `${member.performance}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-modal border border-border w-full max-w-lg p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold font-syne text-ink">Invitar miembro</h2>
                <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Nombre completo</label>
                  <input type="text" placeholder="Ej: Pedro Sánchez" className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Email</label>
                  <input type="email" placeholder="pedro@inmobiliaria.com" className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Rol</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                      className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 transition-all outline-none text-left flex items-center justify-between"
                    >
                      <span className="text-muted">Seleccionar rol</span>
                      <ChevronDown size={14} className="text-muted2" />
                    </button>
                    {showRoleDropdown && (
                      <div className="absolute top-full mt-1 w-full bg-white border border-border rounded-xl shadow-modal py-1 z-10">
                        {Object.entries(roleConfig).map(([key, config]) => {
                          const Icon = config.icon
                          return (
                            <button
                              key={key}
                              onClick={() => setShowRoleDropdown(false)}
                              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-ink hover:bg-surface2 transition-colors"
                            >
                              <Icon size={14} className={config.color.split(' ')[0]} />
                              {config.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Oficina</label>
                  <select className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none">
                    <option>Oficina Centro</option>
                    <option>Oficina Norte</option>
                    <option>Oficina Central</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <button onClick={() => setShowInviteModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-muted hover:text-ink bg-surface hover:bg-surface2 rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={() => { setShowInviteModal(false) }} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-all">
                  Enviar invitación
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </PlanGate>
  )
}
