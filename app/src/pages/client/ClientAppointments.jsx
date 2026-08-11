import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useClientSession } from '../../contexts/ClientSessionContext'
import { Calendar, Clock, MapPin, XCircle, RefreshCw, Navigation, MessageCircle, User, Bell } from 'lucide-react'
import BookingEngine from '../../components/BookingEngine'
import { getAppointmentServices, getAppointmentTotal, formatBRL } from '../../utils/appointmentServices'
import { isAppointmentExpired } from '../../utils/appointmentExpiry'
import { sendPushNotification } from '../../utils/notification'
import toast from 'react-hot-toast'

function ClientAppointments() {
  const { salon, profile } = useOutletContext()
  const { clientSession } = useClientSession()
  const clientId = clientSession?.client_id ?? null
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCanceled, setShowCanceled] = useState(false)

  // Booking Engine States
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState(null)

  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    if (clientId) fetchAppointments()
  }, [clientId, showCanceled])

  useEffect(() => {
    if (!clientId) return

    let mounted = true

    const poll = async () => {
      try {
        const res = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list_notifications', client_id: clientId })
        })
        if (res.ok && mounted) {
          const data = await res.json()
          const filtered = (data.notifications || []).filter(n => n.salon_id === salon.id)
          setNotifications(filtered)
        }
      } catch {
        // falha de rede silenciosa — próximo poll tentará novamente
      }
    }

    poll()
    const intervalId = setInterval(poll, 45000)

    return () => {
      mounted = false
      clearInterval(intervalId)
    }
  }, [clientId, salon?.id])

  const unreadCount = notifications.filter(n => !n.is_read).length

  const markAsRead = async (id) => {
    await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_notifications_read', client_id: clientId, id })
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllAsRead = async () => {
    await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_notifications_read', client_id: clientId })
    })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const fetchAppointments = async () => {
    if (!clientId) return
    setLoading(true)

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_by_client', salon_id: salon.id, client_id: clientId })
    })

    if (res.ok) {
      const data = await res.json()
      const allAppts = data.appointments || []
      // Oculta da agenda ativa os agendamentos 'scheduled' já expirados
      // (>15 min após o horário de início) — eles migram para o histórico
      // sem mudar de status no banco. Cancelados seguem o checkbox abaixo.
      const notExpired = allAppts.filter(a => !isAppointmentExpired(a))
      const filtered = showCanceled
        ? notExpired
        : notExpired.filter(a => a.status !== 'canceled')
      setAppointments(filtered)
    }

    setLoading(false)
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) return
    setLoading(true)

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', appointment_id: id, client_id: clientId })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setLoading(false)
      toast.error(err.error || 'Erro ao cancelar agendamento.')
      return
    }

    const cancelData = await res.json().catch(() => ({}))
    const appt = appointments.find(a => a.id === id)
    if (appt && cancelData.owner_id) {
      await sendPushNotification('client_canceled', cancelData.owner_id, 'Agendamento Cancelado', `O cliente cancelou o serviço de ${getAppointmentServices(appt).map(s => s.name).join(', ')}.`)
    }

    await fetchAppointments()
    toast.success('Agendamento cancelado.')
  }

  const handleOpenReschedule = (appt) => {
    setSelectedAppointment(appt)
    setIsRescheduling(true)
  }

  const handleRescheduleSuccess = () => {
    setIsRescheduling(false)
    setSelectedAppointment(null)
    fetchAppointments()
  }

  const handleDirections = (salonData) => {
    if (salonData.latitude && salonData.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${salonData.latitude},${salonData.longitude}`, '_blank');
    } else if (salonData.address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salonData.address)}`, '_blank');
    } else {
      toast.error('Endereço do salão não disponível.');
    }
  }

  const handleWhatsApp = async (salonId) => {
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_salon_contact', salon_id: salonId })
      })
      if (!res.ok) {
        toast.error('O telefone do salão não está disponível no momento.')
        return
      }
      const { phone } = await res.json()
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, '')
        window.open(`https://wa.me/55${cleanPhone}`, '_blank')
      } else {
        toast.error('O telefone do salão não está disponível no momento.')
      }
    } catch (e) {
      toast.error('Erro ao buscar telefone do salão.')
    }
  }

  const clientName = profile?.full_name || clientSession?.full_name

  return (
    <div className="page-content ds-animate-fade-up" style={{ paddingBottom: '100px' }}>
      
      {/* Header Flat */}
      <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--ds-primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-primary)', flexShrink: 0, overflow: 'hidden' }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={22} />
            )}
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: '600', color: 'var(--ds-text)', margin: 0, letterSpacing: '-0.02em' }}>
              Bem-vindo(a){clientName ? `, ${clientName.split(' ')[0]}` : ''}
            </h1>
            <p style={{ marginTop: '2px', fontSize: '13px', color: 'var(--ds-text-2)', margin: 0 }}>
              Acompanhe seus serviços agendados.
            </p>
          </div>
        </div>

        {/* Notificações do Cliente */}
        <div style={{ position: 'relative' }}>
          <button 
            className="ds-btn ds-btn-ghost ds-btn-pill"
            style={{ padding: '8px', position: 'relative' }}
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notificações"
          >
            <Bell size={22} style={{ color: 'var(--ds-text-2)' }} />
            {unreadCount > 0 && (
              <span className="ds-badge ds-badge-danger" style={{ position: 'absolute', top: '2px', right: '2px', padding: '2px 6px', fontSize: '10px' }}>
                {unreadCount}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <div className="ds-card" style={{ position: 'absolute', top: '48px', right: '0', width: '320px', padding: 0, zIndex: 100, border: '1px solid var(--ds-surface-2)', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ds-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--ds-surface-2)' }}>
                <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--ds-text)' }}>Notificações</span>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="ds-btn ds-btn-ghost" style={{ padding: '2px 6px', fontSize: '12px', color: 'var(--ds-primary)' }}>
                    Marcar lidas
                  </button>
                )}
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ds-text-3)', fontSize: '13px' }}>
                    Nenhuma notificação no momento.
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => !n.is_read && markAsRead(n.id)} 
                      style={{ padding: '12px 16px', borderBottom: '1px solid var(--ds-surface-2)', backgroundColor: n.is_read ? 'var(--ds-surface)' : 'var(--ds-primary-soft)', cursor: n.is_read ? 'default' : 'pointer' }}
                    >
                      <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '13px', color: 'var(--ds-text)' }}>{n.title}</p>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--ds-text-2)' }}>{n.message}</p>
                      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--ds-text-3)' }}>{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Filtro Cancelados */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '0 4px' }}>
        <input 
          type="checkbox" 
          id="showCanceledClient"
          checked={showCanceled}
          onChange={(e) => setShowCanceled(e.target.checked)}
          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--ds-primary)' }}
        />
        <label htmlFor="showCanceledClient" style={{ fontSize: '13px', color: 'var(--ds-text-2)', cursor: 'pointer', userSelect: 'none' }}>
          Exibir agendamentos cancelados
        </label>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <span className="ds-badge ds-badge-primary">Buscando agendamentos...</span>
        </div>
      ) : appointments.length === 0 ? (
        <div className="ds-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Calendar size={36} style={{ color: 'var(--ds-text-3)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', margin: 0 }}>Você não possui agendamentos ativos nesta agenda.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {appointments.map(appt => {
            const servicesList = getAppointmentServices(appt)
            const isCanceled = appt.status === 'canceled'
            const isCompleted = appt.status === 'completed'

            return (
              <div 
                key={appt.id} 
                className="ds-card" 
                style={{ opacity: isCanceled ? 0.65 : 1, padding: '20px' }}
              >
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--ds-text)', margin: '0 0 4px 0' }}>
                      {appt.salons.name}
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                      <MapPin size={14} style={{ color: 'var(--ds-primary)' }} /> {appt.salons.address || 'Endereço não informado'}
                    </p>
                  </div>
                  
                  {isCanceled && (
                    <span className="ds-badge ds-badge-danger">Cancelado</span>
                  )}
                  {isCompleted && (
                    <span className="ds-badge ds-badge-success">Concluído</span>
                  )}
                  {!isCanceled && !isCompleted && (
                    <span className="ds-badge ds-badge-primary">Agendado</span>
                  )}
                </div>

                {/* Detalhes da Data e Serviço */}
                <div className="ds-card ds-card-surface-2" style={{ padding: '14px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', fontWeight: '600', color: 'var(--ds-primary)', fontSize: '14px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={16} /> {appt.appointment_date.split('-').reverse().join('/')}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={16} /> {appt.start_time.substring(0, 5)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ds-text-2)', fontSize: '13px' }}>
                    {servicesList.map((s, i) => (
                      <div key={s.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '2px 0' }}>
                        <span>{s.name}</span>
                        <span style={{ fontWeight: '500', color: 'var(--ds-text)' }}>{formatBRL(s.price)}</span>
                      </div>
                    ))}
                    {servicesList.length > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--ds-surface-3)', fontWeight: '600', color: 'var(--ds-text)' }}>
                        <span>Total</span>
                        <span>{formatBRL(getAppointmentTotal(appt))}</span>
                      </div>
                    )}
                    {appt.professionals && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ds-text-3)' }}>
                        Profissional: <strong style={{ color: 'var(--ds-text)' }}>{appt.professionals.name}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações do Agendamento */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    <button 
                      onClick={() => handleDirections(appt.salons)}
                      className="ds-btn ds-btn-secondary ds-btn-pill"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    >
                      <Navigation size={15} /> Como chegar
                    </button>
                    <button 
                      onClick={() => handleWhatsApp(appt.salon_id)}
                      className="ds-btn ds-btn-soft ds-btn-pill"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                    >
                      <MessageCircle size={15} /> WhatsApp
                    </button>
                  </div>

                  {appt.status === 'scheduled' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                      <button 
                        onClick={() => handleCancel(appt.id)}
                        className="ds-btn ds-btn-danger ds-btn-pill"
                        style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                      >
                        <XCircle size={15} /> Cancelar
                      </button>
                      <button 
                        onClick={() => handleOpenReschedule(appt)}
                        className="ds-btn ds-btn-primary ds-btn-pill"
                        style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                      >
                        <RefreshCw size={15} /> Reagendar
                      </button>
                    </div>
                  )}
                </div>

              </div>
            )
          })}
        </div>
      )}

      {/* Booking Engine para Reagendamento */}
      {selectedAppointment && (
        <BookingEngine
          isOpen={isRescheduling}
          onClose={() => setIsRescheduling(false)}
          salonId={selectedAppointment.salons?.id || selectedAppointment.salon_id}
          service={{
            id: selectedAppointment.services?.id || selectedAppointment.service_id,
            name: selectedAppointment.services?.name,
            duration_minutes: selectedAppointment.services?.duration_minutes,
            price: selectedAppointment.services?.price
          }}
          clientId={clientId}
          clientName={clientSession?.full_name || profile?.full_name || 'Cliente'}
          existingAppointmentId={selectedAppointment.id}
          onSuccess={handleRescheduleSuccess}
          slotIntervalMinutes={salon?.slot_interval_minutes ?? null}
        />
      )}

    </div>
  )
}

export default ClientAppointments
