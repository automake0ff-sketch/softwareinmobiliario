import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import api from './lib/api'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

let storedUser = null
try {
  const STORE_KEY = 'crm-inmobiliario-store'
  const stored = localStorage.getItem(STORE_KEY)
  if (stored) {
    const parsed = JSON.parse(stored)
    storedUser = parsed.state?.user
  }
} catch {
  console.warn('localStorage no disponible, iniciando sin sesión previa')
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
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
  </React.StrictMode>
  </ErrorBoundary>,
)
