import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './client-ds.css'
import App from './App.jsx'

async function bootstrap() {
  // MOCK DEV-ONLY / DESCARTÁVEL: instala o interceptor de fetch que popula a
  // casca do módulo cliente com dados fictícios (sem backend/serverless).
  // Gated por import.meta.env.DEV + VITE_CLIENT_MOCK: o import dinâmico é
  // tree-shaken/eliminado no build de produção. Ver app/src/dev/clientMock.js.
  if (import.meta.env.DEV && (import.meta.env.VITE_CLIENT_MOCK === '1' || import.meta.env.VITE_USE_MOCKS === 'true')) {
    const { installClientMock } = await import('./dev/clientMock.js')
    installClientMock()
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
