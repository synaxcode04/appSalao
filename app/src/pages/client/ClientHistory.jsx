import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { History, Calendar, Clock } from 'lucide-react'
import { useClientSession } from '../../contexts/ClientSessionContext'

function ClientHistory() {
  const { salon } = useOutletContext()
  const { clientSession } = useClientSession()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!salon) return

    let mounted = true

    const fetchHistory = async () => {
      if (mounted) setLoading(true)

      const clientId = clientSession?.client_id
      if (clientId) {
        const res = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list_history', salon_id: salon.id, client_id: clientId })
        })
        if (mounted && res.ok) {
          const data = await res.json()
          setHistory(data.appointments || [])
        }
      }

      if (mounted) setLoading(false)
    }

    fetchHistory()
    return () => { mounted = false }
  }, [salon?.id, clientSession?.client_id])

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando seu histórico...</div>
  }

  return (
    <div className="page-content" style={{ paddingBottom: '100px' }}>
      <header className="page-header">
        <h1>Histórico</h1>
        <p className="subtitle">Revise seus atendimentos neste salão.</p>
      </header>

      <section>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <History size={20} color="var(--primary-green)" /> Últimos Atendimentos
        </h2>

        {history.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
            <History size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <p>Você ainda não possui atendimentos concluídos.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {history.map(appt => {
              const dtParts = appt.appointment_date.split('-')
              const dateBr = `${dtParts[2]}/${dtParts[1]}/${dtParts[0]}`
              return (
                <div key={appt.id} className="card" style={{ padding: '1rem', borderLeft: '4px solid var(--primary-green)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{appt.services?.name}</h3>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{appt.salons?.name}</p>
                    </div>
                    <span style={{ fontWeight: 'bold', color: 'var(--dark-green)' }}>
                      R$ {Number(appt.services?.price || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={14} /> {dateBr}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={14} /> {appt.start_time}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default ClientHistory
