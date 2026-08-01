import React from 'react'
import { Navigate, Outlet, useParams, useOutletContext } from 'react-router-dom'
import { useClientSession } from '../contexts/ClientSessionContext'

function ClientRoute() {
  const { slug } = useParams()
  const outletContext = useOutletContext()
  const { clientSession } = useClientSession()

  if (!clientSession) {
    return <Navigate to={`/s/${slug}`} replace />
  }

  return <Outlet context={outletContext} />
}

export default ClientRoute
