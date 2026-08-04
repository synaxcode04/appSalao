import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

// Exceção aprovada em 2026-08-01: Context de identidade leve do cliente.
// A regra "sem Context global" do react.md é dispensada exclusivamente para
// este domínio. Não introduza Context para outros fins.

const ClientSessionContext = createContext(null)

const storageKey = (slug) => `client_session:${slug}`

export function ClientSessionProvider({ slug, children }) {
  const [clientSession, setClientSession] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey(slug))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  // A sessão inicial gravada aqui contém apenas { client_id, phone, full_name }.
  // Os campos birth_date e avatar_url são preenchidos progressivamente via
  // updateSession — chamado no mount do ClientProfile (lookup) e após salvar o perfil.
  const loginByPhone = useCallback(async (phone, full_name, salon_id) => {
    const res = await fetch('/api/client-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link_to_salon', phone, full_name, salon_id }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Erro ao identificar cliente')
    }

    const data = await res.json()
    const session = { client_id: data.client_id, phone, full_name }
    localStorage.setItem(storageKey(slug), JSON.stringify(session))
    setClientSession(session)
    return session
  }, [slug])

  useEffect(() => {
    if (!clientSession?.client_id) return
    window.OneSignalDeferred = window.OneSignalDeferred || []

    let removePushListener = null;

    window.OneSignalDeferred.push(async function(OneSignal) {
      const attemptLogin = async () => {
        try {
          await OneSignal.login(clientSession.client_id)
        } catch {
          try {
            await OneSignal.logout()
            await OneSignal.login(clientSession.client_id)
          } catch {
            // device will not receive push — alias conflict unresolvable client-side
          }
        }
      }

      await attemptLogin()

      const handler = async (event) => {
        const cur = event?.current ?? event
        if (cur?.optedIn && (cur?.token || cur?.id)) {
          await attemptLogin()
        }
      }
      OneSignal.User.PushSubscription.addEventListener('change', handler)
      removePushListener = () => {
        OneSignal.User.PushSubscription.removeEventListener('change', handler)
      }
    })

    return () => {
      if (removePushListener) removePushListener()
    }
  }, [clientSession?.client_id])

  const updateSession = useCallback((patch) => {
    setClientSession(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem(storageKey(slug), JSON.stringify(next))
      return next
    })
  }, [slug])

  const logout = useCallback(() => {
    localStorage.removeItem(storageKey(slug))
    setClientSession(null)
  }, [slug])

  return (
    <ClientSessionContext.Provider value={{ clientSession, loginByPhone, updateSession, logout }}>
      {children}
    </ClientSessionContext.Provider>
  )
}

export function useClientSession() {
  return useContext(ClientSessionContext)
}

export default ClientSessionContext
