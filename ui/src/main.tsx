import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import AppShell from './app/AppShell.tsx'
import WorkspaceProvider from './app/providers/WorkspaceProvider.tsx'
import './index.css'

// Fase 0 preview: opt-in via ?workspace=1. The classic UI stays the default
// until every surface has been migrated (Fase 1/2).
const workspacePreview = new URLSearchParams(window.location.search).get('workspace') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {workspacePreview ? (
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)

// Any expired/absent session sends the user back to the login page.
const originalFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await originalFetch(input, init)
  if (response.status === 401 && !String(input).includes('/api/auth/login')) {
    window.location.href = '/login.html'
    throw new Error('Sessão expirada — faça login novamente')
  }
  return response
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is best-effort; the app works normally without it.
    })
  })
}
