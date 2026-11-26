import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import AppShell from './app/AppShell.tsx'
import WorkspaceProvider from './app/providers/WorkspaceProvider.tsx'
import './index.css'

// Fase 3: the tabbed workspace is now the default. The previous UI stays
// reachable via ?classic=1 for comparison until it is removed in a later change.
const classic = new URLSearchParams(window.location.search).get('classic') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {classic ? (
      <App />
    ) : (
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
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
