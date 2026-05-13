import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Settings, LayoutDashboard, Zap, Menu, X } from 'lucide-react'
import { useStore } from '../lib/store'
import styles from './Navbar.module.css'

export default function Navbar() {
  const { pathname } = useLocation()
  const { plan, auditsRemaining } = useStore()
  const remaining = auditsRemaining()
  const [open, setOpen] = useState(false)

  const nav = [
    { to: '/', label: 'Agencia', icon: Zap },
    { to: '/dashboard', label: 'Historial', icon: LayoutDashboard },
    { to: '/studio', label: 'Studio', icon: Zap },
    { to: '/propbot', label: 'Chatbots', icon: Zap },
    { to: '/settings', label: 'Ajustes', icon: Settings },
  ]

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark}>P</span>
          <span className={styles.logoText}>PropAI</span>
          <span className={styles.logoBeta}>BETA</span>
        </Link>

        <nav className={`${styles.nav} ${open ? styles.navOpen : ''}`}>
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`${styles.navLink} ${pathname === to ? styles.active : ''}`}
              onClick={() => setOpen(false)}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>

        <div className={styles.right}>
          {plan === 'free' && (
            <Link to="/pricing" className={styles.usagePill}>
              <span className={styles.usageDots}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className={`${styles.dot} ${i >= remaining ? styles.dotUsed : ''}`}
                  />
                ))}
              </span>
              <span>{remaining} gratis</span>
            </Link>
          )}
          {plan !== 'free' && (
            <span className={styles.planBadge}>{plan.toUpperCase()}</span>
          )}
          <Link to="/pricing" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
            {plan === 'free' ? 'Activar Pro' : 'Mi Plan'}
          </Link>
          <button className={styles.menuBtn} onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  )
}
