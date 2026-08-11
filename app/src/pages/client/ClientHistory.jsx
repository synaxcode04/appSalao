import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { History, Calendar, Clock, CheckCircle } from 'lucide-react'
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
          // ativa (ClientAppointments), no fuso local do browser.
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
    return (
      <div className="page-content" style={{ paddingBottom: '100px', textAlign: 'center', paddingTop: '2rem' }}>
        <span className="ds-badge ds-badge-primary">Carregando seu histórico...</span>
      </div>
    )
  }

  return (
    <div className="page-content ds-animate-fade-up" style={{ paddingBottom: '100px' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '600', color: 'var(--ds-text)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
          Histórico de Atendimentos
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', margin: 0 }}>
          Revise seus atendimentos realizados neste salão.
        </p>
      </header>

      <section>
        <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--ds-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <History size={18} style={{ color: 'var(--ds-primary)' }} /> Útimos Atendimentos
        </h2>

        {history.length === 0 ? (
          <div className="ds-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <History size={36} style={{ color: 'var(--ds-text-3)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', margin: 0 }}>Você ainda não possui atendimentos concluídos no histórico.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map(appt => {
              const dtParts = appt.appointment_date.split('-')
              const dateBr = `${dtParts[2]}/${dtParts[1]}/${dtParts[0]}`
              const servicesList = getAppointmentServices(appt)
              return (
                <div key={appt.id} className="ds-card" style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--ds-text-2)' }}>
                      {appt.salons?.name}
                    </span>
                    <span className="ds-badge ds-badge-success">
                      <CheckCircle size={12} /> Concluído
                    </span>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    {servicesList.map((s, i) => (
                      <div key={s.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '14px', color: 'var(--ds-text)', padding: '2px 0' }}>
                        <span>{s.name}</span>
                        <span style={{ fontWeight: '600', color: 'var(--ds-primary)' }}>{formatBRL(s.price)}</span>
                      </div>
                    ))}
                    {servicesList.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--ds-surface-2)', fontWeight: '600', color: 'var(--ds-text)' }}>
                        <span>Total</span>
                        <span style={{ color: 'var(--ds-primary)' }}>{formatBRL(getAppointmentTotal(appt))}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--ds-text-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} style={{ color: 'var(--ds-primary)' }} /> {dateBr}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={14} style={{ color: 'var(--ds-primary)' }} /> {appt.start_time.substring(0, 5)}
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
