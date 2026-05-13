import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import AuditApp from './AuditApp'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000, style: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border2)', fontFamily: 'var(--font-body)', borderRadius: 'var(--radius)' }, success: { iconTheme: { primary: 'var(--gold)', secondary: 'var(--bg)' } }, error: { iconTheme: { primary: 'var(--red)', secondary: 'var(--bg)' } } }} />
      <AuditApp />
    </BrowserRouter>
  </React.StrictMode>,
)
