import React, { useEffect, useState } from 'react'
import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

function ProtectedRoute({ children, requiredRole }) {
  const outletContext = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    let mounted = true

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!mounted) return
      setSession(session)

      if (session && requiredRole) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()

        if (!mounted) return

        if (profile && profile.role === requiredRole) {
          setIsAuthorized(true)
        }
      } else if (session) {
        setIsAuthorized(true)
      }

      if (mounted) setLoading(false)
    }

    checkSession()

    return () => { mounted = false }
  }, [requiredRole])

  if (loading) return <div className="loading-screen">Carregando...</div>

  if (!session) return <Navigate to="/login" replace />

  if (requiredRole && !isAuthorized) return <Navigate to="/" replace />

  return children ?? <Outlet context={outletContext} />
}

export default ProtectedRoute
