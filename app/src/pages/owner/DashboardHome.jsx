import React, { useEffect, useState } from 'react'
import { useOutletContext, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase'
import { MessageCircle, Clock, User, XCircle, RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react'
import BookingEngine from '../../components/BookingEngine'
import { sendPushNotification } from '../../utils/notification'
import toast from 'react-hot-toast'

function DashboardHome() {
  const { salon } = useOutletContext()
  const location = useLocation()
  const [avisoPagamento, setAvisoPagamento] = useState(location.state?.avisoPagamento || null)
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const todayStr = new Date().toISOString().split('T')[0]
  const [filterDate, setFilterDate] = useState(todayStr) // Padrão: Hoje
  const [filterProfessional, setFilterProfessional] = useState('')
  const [showCanceled, setShowCanceled] = useState(false)
  const [showOnlyOpen, setShowOnlyOpen] = useState(true)
  const [professionalsList, setProfessionalsList] = useState([])
  const [stats, setStats] = useState({ today: 0, upcoming: 0 })
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    if (filterDate === todayStr) {
      setShowOnlyOpen(true)
    }
  }, [filterDate])

  // Booking Engine States
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState(null)

  useEffect(() => {
    if (salon) {
      fetchProfessionals()
      fetchStats()
    }
  }, [salon])

  useEffect(() => {
    if (salon) {
      fetchAppointments()
    }
  }, [salon, filterDate, filterProfessional, showCanceled, showOnlyOpen])

  const fetchProfessionals = async () => {
    const { data } = await supabase
      .from('professionals')
      .select('id, name')
      .eq('salon_id', salon.id)
      .eq('is_active', true)
    
    if (data) setProfessionalsList(data)
  }

  const fetchStats = async () => {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('appointments')
      .select('appointment_date, status, services(price)')
      .eq('salon_id', salon.id)
      .gte('appointment_date', today)
      .neq('status', 'canceled')
    
    if (data) {
      const todayAppointments = data.filter(a => a.appointment_date === today)
      const upcomingAppointments = data.filter(a => a.appointment_date !== today)
      
      const upcomingCount = upcomingAppointments.length
      const upcomingRevenue = upcomingAppointments.reduce((acc, curr) => acc + Number(curr.services?.price || 0), 0)
      
      const estimatedRevenue = todayAppointments.reduce((acc, curr) => acc + Number(curr.services?.price || 0), 0)
      const realRevenue = todayAppointments.filter(a => a.status === 'completed').reduce((acc, curr) => acc + Number(curr.services?.price || 0), 0)
      
      setStats({ 
        todayCount: todayAppointments.length, 
        upcoming: upcomingCount,
        upcomingRevenue,
        estimatedRevenue,
        realRevenue
      })
    }
  }

  const fetchAppointments = async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'
    
    let query = supabase
      .from('appointments')
      .select(`
        id,
        appointment_date,
        start_time,
        end_time,
        status,
        client_id,
        service_id,
        professional_id,
        clients ( full_name, phone ),
        services ( id, name, price, duration_minutes ),
        professionals ( id, name )
      `)
      .eq('salon_id', salon.id)

    if (filterDate) {
      query = query.eq('appointment_date', filterDate)
    } else {
      query = query.gt('appointment_date', today)
    }

    if (filterProfessional) {
      query = query.eq('professional_id', filterProfessional)
    }

    if (!showCanceled) {
      query = query.neq('status', 'canceled')
    }

    if (showOnlyOpen) {
      query = query.neq('status', 'completed')
    }

    query = query.order('appointment_date', { ascending: true })
                 .order('start_time', { ascending: true })

    const { data, error } = await query
    if (error) {
      console.error('Erro ao buscar agenda:', error)
      setFetchError('Não foi possível carregar a agenda. Tente novamente.')
    } else {
      setFetchError(null)
      setAppointments(data)
    }
    setLoading(false)
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento do cliente?')) return
    setLoading(true)

    await supabase.from('appointments').update({ status: 'canceled' }).eq('id', id)
    
    // Notificar cliente
    const appt = appointments.find(a => a.id === id)
    if (appt && appt.client_id) {
      await supabase.from('notifications').insert([{
        client_id: appt.client_id,
        salon_id: salon.id,
        title: 'Agendamento Cancelado',
        message: `O salão cancelou o seu agendamento de ${appt.services.name}.`
      }])
      await sendPushNotification('owner_canceled', appt.client_id, 'Agendamento Cancelado', `O salão cancelou o seu agendamento de ${appt.services.name}.`)
    }

    await fetchAppointments()
    await fetchStats()
    toast.success('Agendamento cancelado.')
  }

  const handleComplete = async (appt) => {
    if (!window.confirm('Marcar este agendamento como concluído?')) return
    setLoading(true)

    await supabase.from('appointments').update({ status: 'completed' }).eq('id', appt.id)
    
    // Notificar cliente
    if (appt.client_id) {
      await supabase.from('notifications').insert([{
        client_id: appt.client_id,
        salon_id: salon.id,
        title: 'Serviço Concluído',
        message: `O salão marcou o seu serviço de ${appt.services.name} como concluído.`
      }])
      await sendPushNotification('completed_by_owner', appt.client_id, 'Serviço Concluído', `O salão marcou o seu serviço de ${appt.services.name} como concluído.`)
    }

    await fetchAppointments()
    await fetchStats()
    toast.success('Serviço concluído!')
  }

  const canMarkAsCompleted = (appt) => {
    if (appt.status !== 'scheduled') return false

    const todayStr = new Date().toISOString().split('T')[0]
    if (appt.appointment_date > todayStr) return false // Futuro

    if (appt.appointment_date === todayStr) {
      const nowStr = new Date().toTimeString().substring(0, 5) // "HH:MM"
      if (nowStr < appt.start_time.substring(0, 5)) {
        return false // Hoje, mas o horário ainda não passou
      }
    }

    const apptDate = new Date(appt.appointment_date + 'T00:00:00')
    const todayObj = new Date(todayStr + 'T00:00:00')
    const diffDays = (todayObj - apptDate) / (1000 * 60 * 60 * 24)
    
    return diffDays >= 0 && diffDays <= 2
  }

  const handleOpenReschedule = (appt) => {
    setSelectedAppointment(appt)
    setIsRescheduling(true)
  }

  const handleRescheduleSuccess = () => {
    setIsRescheduling(false)
    setSelectedAppointment(null)
    fetchAppointments()
    fetchStats()
  }

  const handleWhatsApp = (appt) => {
    if (!appt.clients || !appt.clients.phone) {
      alert('Cliente sem telefone cadastrado.')
      return
    }
    const clientPhone = appt.clients.phone.replace(/\D/g, '')
    const clientName = appt.clients.full_name.split(' ')[0]
    const serviceName = appt.services.name
    const timeStr = appt.start_time.substring(0, 5) // "14:00"

    // Formata a data (de YYYY-MM-DD para DD/MM)
    const dateParts = appt.appointment_date.split('-')
    const formattedDate = `${dateParts[2]}/${dateParts[1]}`
    
    // Verifica se é amanhã
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    let dayText = appt.appointment_date === tomorrowStr ? 'Amanhã' : `No dia ${formattedDate}`
    
    const message = `Olá ${clientName}, tudo bem?\n\n${dayText} você tem um agendamento de *${serviceName}* com a gente às *${timeStr}*.\n\nCaso não consiga comparecer, lembre-se de cancelar ou nos avisar com antecedência. Até lá!\n\nAtenciosamente,\n*${salon.name}*`

    const waUrl = `https://wa.me/55${clientPhone}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank')
  }

  if (!salon) return <div>Carregando...</div>

  // O resumo já está sendo calculado pelo fetchStats

  return (
    <div className="page-content">
      {avisoPagamento && (
        <div className="aviso-banner" role="status">
          <AlertCircle size={22} className="aviso-banner-icon" />
          <div className="aviso-banner-content">
            <p className="aviso-banner-text">{avisoPagamento}</p>
            <a
              href="https://wa.me/5531997452809"
              target="_blank"
              rel="noopener noreferrer"
              className="aviso-banner-link"
            >
              <MessageCircle size={16} /> Falar no WhatsApp
            </a>
          </div>
          <button
            type="button"
            className="aviso-banner-close"
            aria-label="Fechar aviso"
            onClick={() => setAvisoPagamento(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
        {salon.logo_url && (
          <img 
            src={salon.logo_url} 
            alt="Logo" 
            style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
          />
        )}
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '0.2rem' }}>Agenda do Salão</h1>
          <p className="subtitle" style={{ fontSize: '1.1rem' }}>Bem-vindo ao {salon.name}</p>
        </div>
      </header>

      {/* Resumo */}
      <section className="dashboard-cards" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div 
          className="card stat-card"
          style={{ flex: 1, minWidth: '150px', cursor: 'pointer', border: filterDate === todayStr ? '2px solid var(--primary-green)' : '1px solid var(--border-color)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column' }}
          onClick={() => setFilterDate(todayStr)}
        >
          <h3>Agendamentos Hoje</h3>
          <div style={{ marginTop: 'auto' }}>
            <p className="stat-number">{stats.todayCount || 0}</p>
          </div>
        </div>
        <div 
          className="card stat-card"
          style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column' }}
        >
          <h3>Faturamento Real</h3>
          <div style={{ marginTop: 'auto' }}>
            <p className="stat-number" style={{ color: 'var(--dark-green)' }}>R$ {stats.realRevenue?.toFixed(2).replace('.', ',') || '0,00'}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Serviços Concluídos Hoje</p>
          </div>
        </div>
        <div 
          className="card stat-card"
          style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column' }}
        >
          <h3>Faturamento Estimado</h3>
          <div style={{ marginTop: 'auto' }}>
            <p className="stat-number" style={{ color: 'var(--text-secondary)' }}>R$ {stats.estimatedRevenue?.toFixed(2).replace('.', ',') || '0,00'}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Projetado p/ Hoje</p>
          </div>
        </div>
        <div 
          className="card stat-card"
          style={{ flex: 1, minWidth: '150px', cursor: 'pointer', border: !filterDate ? '2px solid var(--primary-green)' : '1px solid var(--border-color)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column' }}
          onClick={() => setFilterDate('')}
        >
          <h3>Próximos Dias</h3>
          <div style={{ marginTop: 'auto' }}>
            <p className="stat-number" style={{ color: 'var(--text-secondary)' }}>{stats.upcoming || 0}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.5rem' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--dark-green)' }}>
                Est: R$ {stats.upcomingRevenue?.toFixed(2).replace('.', ',') || '0,00'}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Clique para ver</p>
            </div>
          </div>
        </div>
      </section>

      {/* Lista de Agendamentos */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', margin: 0 }}>Sua Agenda</h2>
        </div>

        {/* Filtros */}
        <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', backgroundColor: 'var(--surface-color)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Filtrar por Data</label>
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
            />
          </div>

          {professionalsList.length > 0 && (
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Filtrar por Profissional</label>
              <select 
                value={filterProfessional}
                onChange={(e) => setFilterProfessional(e.target.value)}
                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}
              >
                <option value="">Todos os profissionais</option>
                {professionalsList.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.4rem' }}>
            <input 
              type="checkbox" 
              id="showCanceled"
              checked={showCanceled}
              onChange={(e) => setShowCanceled(e.target.checked)}
              style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
            />
            <label htmlFor="showCanceled" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Exibir Cancelados
            </label>
          </div>

          <div style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.4rem' }}>
            <input 
              type="checkbox" 
              id="showOnlyOpen"
              checked={showOnlyOpen}
              onChange={(e) => setShowOnlyOpen(e.target.checked)}
              style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
            />
            <label htmlFor="showOnlyOpen" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Somente em aberto
            </label>
          </div>

          {(filterDate !== todayStr || filterProfessional || showCanceled || !showOnlyOpen) && (
            <div style={{ marginTop: '1.4rem' }}>
              <button 
                onClick={() => { setFilterDate(todayStr); setFilterProfessional(''); setShowCanceled(false); setShowOnlyOpen(true); }} 
                style={{ padding: '0.7rem 1rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                Limpar Filtros
              </button>
            </div>
          )}
        </div>
        
        {loading ? (
          <p>Buscando agenda...</p>
        ) : fetchError ? (
          <div className="card fetch-error" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p style={{ color: '#d32f2f', fontWeight: 'bold' }}>{fetchError}</p>
            <button
              onClick={fetchAppointments}
              style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: '8px', cursor: 'pointer' }}
            >
              Tentar novamente
            </button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Nenhum agendamento encontrado para estes filtros.</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Se houverem agendamentos, eles aparecerão aqui.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {appointments.map(appt => (
              <div key={appt.id} className="card" style={{ padding: '1.2rem', borderLeft: `4px solid ${appt.status === 'canceled' ? '#d32f2f' : appt.status === 'completed' ? '#10b981' : (appt.appointment_date === todayStr ? 'var(--primary-green)' : 'var(--border-color)')}`, opacity: appt.status === 'canceled' ? 0.7 : 1 }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={16} color="var(--text-secondary)" />
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: appt.status === 'canceled' ? '#d32f2f' : 'var(--text-primary)', textDecoration: appt.status === 'canceled' ? 'line-through' : 'none' }}>
                      {appt.appointment_date.split('-').reverse().join('/')} às {appt.start_time.substring(0, 5)}
                    </span>
                  </div>
                  <div>
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
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--dark-green)', fontWeight: 'bold' }}>
                      <User size={18} />
                      <span style={{ wordBreak: 'break-word' }}>{appt.clients.full_name}</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                      {appt.clients.phone}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    <span style={{ fontSize: '0.85rem' }}>Serviço:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                      {appt.services.name} (R$ {Number(appt.services.price).toFixed(2).replace('.', ',')})
                    </span>
                    {appt.professionals && (
                      <span style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                        Profissional: {appt.professionals.name}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', flexWrap: 'wrap' }}>
                  {appt.status !== 'canceled' && (
                    <button 
                      onClick={() => handleWhatsApp(appt)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: '#e8f5e9', border: 'none', color: '#2e7d32', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      <MessageCircle size={16} /> WhatsApp
                    </button>
                  )}
                  
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
                  
                  {canMarkAsCompleted(appt) && (
                    <button 
                      onClick={() => handleComplete(appt)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: '#10b981', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Marcar como Concluído
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Booking Engine para Reagendamento do Proprietário */}
      {selectedAppointment && (
        <BookingEngine 
          isOpen={isRescheduling}
          onClose={() => setIsRescheduling(false)}
          salonId={salon.id}
          service={{
            id: selectedAppointment.services.id || selectedAppointment.service_id, 
            name: selectedAppointment.services.name, 
            duration_minutes: selectedAppointment.services.duration_minutes, 
            price: selectedAppointment.services.price
          }}
          clientId={selectedAppointment.client_id}
          existingAppointmentId={selectedAppointment.id}
          onSuccess={handleRescheduleSuccess}
          slotIntervalMinutes={salon?.slot_interval_minutes ?? null}
        />
      )}

    </div>
  )
}

export default DashboardHome
