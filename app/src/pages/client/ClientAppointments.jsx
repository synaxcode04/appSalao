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

  const handleDirections = (salon) => {
    if (salon.latitude && salon.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`, '_blank');
    } else if (salon.address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.address)}`, '_blank');
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

  return (
    <div className="page-content" style={{ paddingBottom: '100px' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'var(--light-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dark-green)', overflow: 'hidden', flexShrink: 0 }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            ) : (
              <User size={24} />
            )}
          </div>
          <div>
            <h1 style={{ fontSize: '1.8rem', margin: 0 }}>
              Bem vindo(a) {profile?.full_name ? profile.full_name.split(' ')[0] : ''}
            </h1>
            <p className="subtitle" style={{ marginTop: '0.2rem' }}>Acompanhe seus serviços agendados.</p>
          </div>
        </div>

        {/* Notificações do Cliente */}
        <div style={{ position: 'relative' }}>
          <div style={{ cursor: 'pointer', padding: '0.5rem' }} onClick={() => setShowNotifications(!showNotifications)}>
            <Bell size={24} color="var(--text-secondary)" />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '0px', right: '0px', backgroundColor: '#ef4444', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>
                {unreadCount}
              </span>
            )}
          </div>
          
          {showNotifications && (
            <div style={{ position: 'absolute', top: '45px', right: '0', width: '320px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 100, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Notificações</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: 'var(--primary-green)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
                    Marcar lidas
                  </button>
                )}
              </div>
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Nenhuma notificação.</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} onClick={() => !n.is_read && markAsRead(n.id)} style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: n.is_read ? '#fff' : '#f0fdf4', cursor: n.is_read ? 'default' : 'pointer', transition: 'background 0.2s' }}>
                      <p style={{ margin: '0 0 0.3rem 0', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{n.title}</p>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.message}</p>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0 0.5rem' }}>
        <input 
          type="checkbox" 
          id="showCanceledClient"
          checked={showCanceled}
          onChange={(e) => setShowCanceled(e.target.checked)}
          style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
        />
        <label htmlFor="showCanceledClient" style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Exibir agendamentos cancelados
        </label>
      </div>

      {loading ? (
        <p>Buscando agendamentos...</p>
      ) : appointments.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Você não possui nenhum agendamento registrado.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {appointments.map(appt => {
            const services = getAppointmentServices(appt)
            return (
            <div key={appt.id} className="card" style={{ padding: '1.2rem', borderLeft: `4px solid ${appt.status === 'canceled' ? '#d32f2f' : appt.status === 'completed' ? '#10b981' : 'var(--primary-green)'}`, opacity: appt.status === 'canceled' ? 0.6 : 1 }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>{appt.salons.name}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                    <MapPin size={14} /> {appt.salons.address || 'Endereço não informado'}
                  </p>
                </div>
                {appt.status === 'canceled' && (
                  <span style={{ backgroundColor: '#ffebee', color: '#d32f2f', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    Cancelado
                  </span>
                )}
                {appt.status === 'completed' && (
                  <span style={{ backgroundColor: '#e6f4ea', color: '#137333', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    Concluído
                  </span>
                )}
              </div>

              <div style={{ padding: '1rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold', color: 'var(--dark-green)' }}>
                  <Calendar size={18} /> {appt.appointment_date.split('-').reverse().join('/')}
                  <Clock size={18} style={{ marginLeft: '1rem' }} /> {appt.start_time.substring(0, 5)}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  {services.map((s, i) => (
                    <div key={s.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <span>{s.name}</span>
                      <span>{formatBRL(s.price)}</span>
                    </div>
                  ))}
                  {services.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border-color)', fontWeight: 'bold', color: 'var(--dark-green)' }}>
                      <span>Total</span>
                      <span>{formatBRL(getAppointmentTotal(appt))}</span>
                    </div>
                  )}
                  {appt.professionals && <div style={{ marginTop: '0.4rem' }}>Prof: {appt.professionals.name}</div>}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => handleDirections(appt.salons)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: '#e3f2fd', border: 'none', color: '#1976d2', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  <Navigation size={16} /> Como chegar
                </button>
                <button 
                  onClick={() => handleWhatsApp(appt.salon_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: '#e8f5e9', border: 'none', color: '#2e7d32', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  <MessageCircle size={16} /> WhatsApp
                </button>
                
                {appt.status === 'scheduled' && (
                  <>
                    <button 
                      onClick={() => handleCancel(appt.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                    >
                      <XCircle size={16} /> Cancelar
                    </button>
                    <button 
                      onClick={() => handleOpenReschedule(appt)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: 'transparent', border: '1px solid var(--primary-green)', color: 'var(--dark-green)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      <RefreshCw size={16} /> Reagendar
                    </button>
                  </>
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
