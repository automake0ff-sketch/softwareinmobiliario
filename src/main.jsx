import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import api from './lib/api'
import './index.css'

const STORE_KEY = 'crm-inmobiliario-store'
const stored = localStorage.getItem(STORE_KEY)
let storedUser = null
if (stored) {
  try {
    const parsed = JSON.parse(stored)
    storedUser = parsed.state?.user
  } catch {}
}

if (storedUser) {
  api.setAuth(
    storedUser.token || 'demo-token-dev',
    storedUser.id,
    storedUser.role || 'manager',
    storedUser.agency_id,
    storedUser.office_id
  )
}

if (!api.authHeaders['x-auth-token']) {
  const demoUser = {
    id: 'demo-user-id',
    name: 'Carlos Martínez',
    email: 'manager@inmotech.es',
    role: 'manager',
    agency_id: 'demo-agency-id',
    office_id: 'demo-office-id',
    token: 'demo-token-dev',
  }
  api.setAuth('demo-token-dev', 'demo-user-id', 'manager', 'demo-agency-id', 'demo-office-id')
  const existing = stored ? JSON.parse(stored) : { state: {} }
  existing.state = { ...existing.state, ...existing.state?.user ? {} : { user: demoUser } }
  localStorage.setItem(STORE_KEY, JSON.stringify(existing))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#ffffff',
            color: '#0c1222',
            border: '1px solid #dbd8d0',
            fontFamily: 'DM Sans, sans-serif',
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#156840', secondary: '#ffffff' },
          },
          error: {
            iconTheme: { primary: '#8b1a1a', secondary: '#ffffff' },
          },
        }}
      />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
