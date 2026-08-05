import React, { useEffect, useRef, useState } from 'react'
import { useOutletContext, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase'
import { MessageCircle, AlertCircle, X } from 'lucide-react'
import BookingEngine from '../../components/BookingEngine'
import WeekDaySelector from '../../components/WeekDaySelector'
import DayTimeline from '../../components/DayTimeline'
import AppointmentActionsModal from '../../components/AppointmentActionsModal'
import BlockSlotModal from '../../components/BlockSlotModal'
import { sendPushNotification } from '../../utils/notification'
import toast from 'react-hot-toast'

// Data LOCAL no formato 'YYYY-MM-DD' (evita o shift de fuso do toISOString, que é UTC).
function localDateStr(d = new Date()) {
  return d.toLocaleDateString('en-CA')
}

function DashboardHome() {
  const { salon } = useOutletContext()
  const location = useLocation()
  const [avisoPagamento, setAvisoPagamento] = useState(location.state?.avisoPagamento || null)

  const todayStr = localDateStr()
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const [appointments, setAppointments] = useState([])
  const [timeBlocks, setTimeBlocks] = useState([])
  const [professionalsList, setProfessionalsList] = useState([])
  const [workingHours, setWorkingHours] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // Modais
  const [actionsAppt, setActionsAppt] = useState(null)
  const [blockPrefill, setBlockPrefill] = useState(null)

  // Reagendamento via BookingEngine (mantido como já era)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState(null)

  // Protege setState assíncrono (reloadDay) contra componente desmontado.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!salon) return
    let mounted = true

    const fetchProfessionals = async () => {
      const { data } = await supabase
        .from('professionals')
        .select('id, name')
        .eq('salon_id', salon.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (data && mounted) setProfessionalsList(data)
    }

    fetchProfessionals()
    return () => { mounted = false }
  }, [salon])

  useEffect(() => {
    if (!salon) return
    let mounted = true

    const fetchDay = async () => {
      setLoading(true)

      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()

      const apptQuery = supabase
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
        .eq('appointment_date', selectedDate)
        .neq('status', 'canceled')
        .order('start_time', { ascending: true })

      const blocksQuery = supabase
        .from('time_blocks')
        .select('id, professional_id, start_time, end_time, reason')
        .eq('salon_id', salon.id)
        .eq('block_date', selectedDate)

      const whQuery = supabase
        .from('working_hours')
        .select('start_time, end_time, break_start_time, break_end_time')
        .eq('salon_id', salon.id)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle()

      const [apptRes, blocksRes, whRes] = await Promise.all([apptQuery, blocksQuery, whQuery])

      if (!mounted) return

      if (apptRes.error) {
        setFetchError('Não foi possível carregar a agenda. Tente novamente.')
      } else {
        setFetchError(null)
        setAppointments(apptRes.data || [])
      }
      setTimeBlocks(blocksRes.data || [])
      setWorkingHours(whRes.data || null)
      setLoading(false)
    }

    fetchDay()
    return () => { mounted = false }
  }, [salon, selectedDate])

  // Refetch manual do dia atual (após cancelar, concluir, reagendar ou bloquear).
  const reloadDay = async () => {
    if (!salon) return
    setLoading(true)
    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()

    const [apptRes, blocksRes, whRes] = await Promise.all([
      supabase
        .from('appointments')
        .select(`
          id, appointment_date, start_time, end_time, status, client_id, service_id, professional_id,
          clients ( full_name, phone ),
          services ( id, name, price, duration_minutes ),
          professionals ( id, name )
        `)
        .eq('salon_id', salon.id)
        .eq('appointment_date', selectedDate)
        .neq('status', 'canceled')
        .order('start_time', { ascending: true }),
      supabase
        .from('time_blocks')
        .select('id, professional_id, start_time, end_time, reason')
        .eq('salon_id', salon.id)
        .eq('block_date', selectedDate),
      supabase
        .from('working_hours')
        .select('start_time, end_time, break_start_time, break_end_time')
        .eq('salon_id', salon.id)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle()
    ])

    if (!isMountedRef.current) return

    if (apptRes.error) {
      setFetchError('Não foi possível carregar a agenda. Tente novamente.')
    } else {
      setFetchError(null)
      setAppointments(apptRes.data || [])
    }
    setTimeBlocks(blocksRes.data || [])
    setWorkingHours(whRes.data || null)
    setLoading(false)
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento do cliente?')) return

    const { error: cancelError } = await supabase.from('appointments').update({ status: 'canceled' }).eq('id', id)
    if (cancelError) {
      toast.error('Erro ao cancelar agendamento.')
      return
    }

    const appt = appointments.find(a => a.id === id)
    if (appt && appt.client_id) {
      await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify_client',
          client_id: appt.client_id,
          salon_id: salon.id,
          title: 'Agendamento Cancelado',
          message: `O salão cancelou o seu agendamento de ${appt.services?.name ?? 'serviço'}.`
        })
      })
      await sendPushNotification('owner_canceled', appt.client_id, 'Agendamento Cancelado', `O salão cancelou o seu agendamento de ${appt.services?.name ?? 'serviço'}.`)
    }

    setActionsAppt(null)
    await reloadDay()
    toast.success('Agendamento cancelado.')
  }

  const handleComplete = async (appt) => {
    if (!window.confirm('Marcar este agendamento como concluído?')) return

    const { error: completeError } = await supabase.from('appointments').update({ status: 'completed' }).eq('id', appt.id)
    if (completeError) {
      toast.error('Erro ao concluir agendamento.')
      return
    }

    if (appt.client_id) {
      await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify_client',
          client_id: appt.client_id,
          salon_id: salon.id,
          title: 'Serviço Concluído',
          message: `O salão marcou o seu serviço de ${appt.services?.name ?? 'serviço'} como concluído.`
        })
      })
      await sendPushNotification('completed_by_owner', appt.client_id, 'Serviço Concluído', `O salão marcou o seu serviço de ${appt.services?.name ?? 'serviço'} como concluído.`)
    }

    setActionsAppt(null)
    await reloadDay()
    toast.success('Serviço concluído!')
  }

  const canMarkAsCompleted = (appt) => {
    if (!appt || appt.status !== 'scheduled') return false

    const today = localDateStr()
    if (appt.appointment_date > today) return false

    if (appt.appointment_date === today) {
      const nowStr = new Date().toTimeString().substring(0, 5)
      if (nowStr < appt.start_time.substring(0, 5)) return false
    }

    const apptDate = new Date(appt.appointment_date + 'T00:00:00')
    const todayObj = new Date(today + 'T00:00:00')
    const diffDays = (todayObj - apptDate) / (1000 * 60 * 60 * 24)
    return diffDays >= 0 && diffDays <= 2
  }

  const handleOpenReschedule = (appt) => {
    setActionsAppt(null)
    setSelectedAppointment(appt)
    setIsRescheduling(true)
  }

  const handleRescheduleSuccess = () => {
    setIsRescheduling(false)
    setSelectedAppointment(null)
    reloadDay()
  }

  const handleWhatsApp = (appt) => {
    if (!appt.clients || !appt.clients.phone) {
      toast.error('Cliente sem telefone cadastrado.')
      return
    }
    const clientPhone = appt.clients.phone.replace(/\D/g, '')
    const clientName = appt.clients.full_name.split(' ')[0]
    const serviceName = appt.services.name
    const timeStr = appt.start_time.substring(0, 5)

    const dateParts = appt.appointment_date.split('-')
    const formattedDate = `${dateParts[2]}/${dateParts[1]}`

    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = localDateStr(tomorrow)

    const dayText = appt.appointment_date === tomorrowStr ? 'Amanhã' : `No dia ${formattedDate}`

    const message = `Olá ${clientName}, tudo bem?\n\n${dayText} você tem um agendamento de *${serviceName}* com a gente às *${timeStr}*.\n\nCaso não consiga comparecer, lembre-se de cancelar ou nos avisar com antecedência. Até lá!\n\nAtenciosamente,\n*${salon.name}*`

    const waUrl = `https://wa.me/55${clientPhone}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank')
  }

  const handleBlockSaved = () => {
    setBlockPrefill(null)
    reloadDay()
  }

  if (!salon) return <div>Carregando...</div>

  return (
    <div className="agenda-page">
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

      <header className="agenda-header">
        <h1>Agenda</h1>
        <p className="subtitle">Toque em horário vazio para bloquear e no agendamento para interagir</p>
      </header>

      <WeekDaySelector selectedDate={selectedDate} onSelectDay={setSelectedDate} />

      {loading ? (
        <p style={{ padding: '1rem' }}>Buscando agenda...</p>
      ) : fetchError ? (
        <div className="card fetch-error" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <p style={{ color: '#d32f2f', fontWeight: 'bold' }}>{fetchError}</p>
          <button
            onClick={reloadDay}
            style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: '8px', cursor: 'pointer' }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <DayTimeline
          appointments={appointments}
          professionals={professionalsList}
          timeBlocks={timeBlocks}
          workingHours={workingHours}
          date={selectedDate}
          onAppointmentClick={setActionsAppt}
          onEmptySlotClick={setBlockPrefill}
          slotMinutes={salon?.slot_interval_minutes ?? 60}
        />
      )}

      {actionsAppt && (
        <AppointmentActionsModal
          appointment={actionsAppt}
          onClose={() => setActionsAppt(null)}
          onReschedule={handleOpenReschedule}
          onWhatsApp={handleWhatsApp}
          onCancel={handleCancel}
          onComplete={handleComplete}
          canComplete={canMarkAsCompleted(actionsAppt)}
        />
      )}

      {blockPrefill && (
        <BlockSlotModal
          salonId={salon.id}
          professionals={professionalsList}
          prefill={blockPrefill}
          onClose={() => setBlockPrefill(null)}
          onSaved={handleBlockSaved}
        />
      )}

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
