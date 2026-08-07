import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { History, Calendar, Clock } from 'lucide-react'
import { useClientSession } from '../../contexts/ClientSessionContext'
import { getAppointmentServices, getAppointmentTotal, formatBRL } from '../../utils/appointmentServices'
import { isAppointmentExpired } from '../../utils/appointmentExpiry'

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
          // Fonte única de verdade de expiração: o MESMO util usado pela agenda
          // ativa (ClientAppointments), no fuso local do browser — sem divergência
          // com o servidor (Node roda em UTC na Vercel). O histórico mantém todos
          // os 'completed' e apenas os 'scheduled' JÁ EXPIRADOS (>15 min após o
          // início); scheduled recentes/futuros continuam só na agenda ativa.
          const all = data.appointments || []
          const visible = all.filter(a => a.status === 'completed' || isAppointmentExpired(a))
          setHistory(visible)
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
              const services = getAppointmentServices(appt)
              return (
                <div key={appt.id} className="card" style={{ padding: '1rem', borderLeft: '4px solid var(--primary-green)' }}>
                  <div style={{ marginBottom: '0.8rem' }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{appt.salons?.name}</p>
                    {services.map((s, i) => (
                      <div key={s.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                        <span>{s.name}</span>
                        <span style={{ color: 'var(--dark-green)' }}>{formatBRL(s.price)}</span>
                      </div>
                    ))}
                    {services.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border-color)', fontWeight: 'bold', color: 'var(--dark-green)' }}>
                        <span>Total</span>
                        <span>{formatBRL(getAppointmentTotal(appt))}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={14} /> {dateBr}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={14} /> {appt.start_time.substring(0, 5)}
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
