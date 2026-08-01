import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { X } from 'lucide-react'
import { sendPushNotification } from '../utils/notification'
import ClientIdentityForm from './ClientIdentityForm'
import toast from 'react-hot-toast'

const EMPTY_ARRAY = []

function generateTimeSlots(start, end, intervalMin) {
  const slots = []
  let [h, m] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)

  while (h < endH || (h === endH && m <= endM)) {
    slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    m += intervalMin
    if (m >= 60) {
      h += Math.floor(m / 60)
      m = m % 60
    }
  }
  return slots
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// Função pura exportável para testes Vitest — não faz fetch, recebe dados prontos.
// now é opcional; quando omitido usa new Date() (útil em testes para fixar a hora).
export function computeAvailableSlots({ workingHours, appointments, totalDurationMinutes, slotIntervalMinutes, selectedDate, now }) {
  const step = slotIntervalMinutes && slotIntervalMinutes >= 15 ? slotIntervalMinutes : totalDurationMinutes
  if (!step || step <= 0) return []

  const allSlots = generateTimeSlots(
    workingHours.start_time.substring(0, 5),
    workingHours.end_time.substring(0, 5),
    step
  )
  const breakStart = workingHours.break_start_time ? timeToMinutes(workingHours.break_start_time.substring(0, 5)) : null
  const breakEnd = workingHours.break_end_time ? timeToMinutes(workingHours.break_end_time.substring(0, 5)) : null
  const currentDate = now || new Date()

  return allSlots.filter(slot => {
    const slotStartMin = timeToMinutes(slot)
    const slotEndMin = slotStartMin + totalDurationMinutes

    if (slotEndMin > timeToMinutes(workingHours.end_time.substring(0, 5))) return false

    if (breakStart && breakEnd) {
      if (slotStartMin < breakEnd && slotEndMin > breakStart) return false
    }

    for (const appt of appointments) {
      const apptStartMin = timeToMinutes(appt.start_time.substring(0, 5))
      const apptEndMin = timeToMinutes(appt.end_time.substring(0, 5))
      if (slotStartMin < apptEndMin && slotEndMin > apptStartMin) return false
    }

    const todayStr = currentDate.toLocaleDateString('en-CA')
    if (selectedDate === todayStr) {
      const nowMin = currentDate.getHours() * 60 + currentDate.getMinutes()
      if (slotStartMin <= nowMin) return false
    }

    return true
  })
}

// services: lista de todos os serviços do salão para seleção múltipla.
// service: serviço pré-selecionado (compat com uso de serviço singular e reagendamento).
// Quando services não é fornecido, usa [service] como lista — mantendo compat retroativa.
function BookingEngine({ isOpen, onClose, salonId, service, services = EMPTY_ARRAY, clientId, clientName = 'Cliente', professionals = EMPTY_ARRAY, existingAppointmentId = null, onSuccess, loginByPhone = null, slotIntervalMinutes = null }) {
  const availableServices = services.length > 0 ? services : (service ? [service] : [])

  const [selectedServiceIds, setSelectedServiceIds] = useState(() => service ? [service.id] : [])
  const [selectedProfessional, setSelectedProfessional] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showIdentity, setShowIdentity] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)

  const selectedServices = availableServices.filter(s => selectedServiceIds.includes(s.id))
  const totalDurationMinutes = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0)
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0)

  useEffect(() => {
    if (isOpen) {
      const tmrw = new Date()
      tmrw.setDate(tmrw.getDate() + 1)
      setSelectedDate(tmrw.toLocaleDateString('en-CA'))
      setSelectedSlot(null)
      setShowIdentity(false)
      setPendingConfirm(false)
      setSelectedServiceIds(service ? [service.id] : [])
      if (professionals.length > 0) {
        setSelectedProfessional(professionals[0].id)
      } else {
        setSelectedProfessional('')
      }
    }
  }, [isOpen, professionals, service])

  useEffect(() => {
    if (isOpen && selectedDate && totalDurationMinutes > 0 && (professionals.length === 0 || selectedProfessional)) {
      calculateAvailableSlots()
    } else {
      setAvailableSlots([])
    }
    setSelectedSlot(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, totalDurationMinutes, isOpen, selectedProfessional, professionals])

  const calculateAvailableSlots = async () => {
    setAvailableSlots([])

    const dateObj = new Date(selectedDate + 'T00:00:00')
    const dayOfWeek = dateObj.getDay()

    // maybeSingle retorna data: null (sem HTTP 406) quando não há linha para o dia.
    const { data: workingHours, error: workingHoursError } = await supabase
      .from('working_hours')
      .select('*')
      .eq('salon_id', salonId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (workingHoursError || !workingHours) return

    const apptBody = { action: 'list_scheduled', salon_id: salonId, appointment_date: selectedDate }
    if (selectedProfessional) {
      apptBody.professional_id = selectedProfessional
    } else if (professionals.length > 0) {
      return
    }
    if (existingAppointmentId) apptBody.exclude_id = existingAppointmentId

    let appointments = []
    try {
      const apptRes = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apptBody)
      })
      if (apptRes.ok) {
        const apptData = await apptRes.json()
        appointments = apptData.appointments || []
      }
    } catch (_) {
      // Falha de rede: prossegue sem appointments (banco valida no create)
    }

    const freeSlots = computeAvailableSlots({
      workingHours,
      appointments,
      totalDurationMinutes,
      slotIntervalMinutes,
      selectedDate
    })

    setAvailableSlots(freeSlots)
  }

  const handleConfirm = async () => {
    if (!selectedSlot || selectedServiceIds.length === 0) return
    if (!clientId) {
      if (loginByPhone) {
        setShowIdentity(true)
      } else {
        toast.error('Você precisa se identificar para agendar.')
      }
      return
    }
    setLoading(true)

    const startMin = timeToMinutes(selectedSlot)
    const endMin = startMin + totalDurationMinutes
    const endTimeStr = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`

    if (existingAppointmentId) {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reschedule',
          appointment_id: existingAppointmentId,
          client_id: clientId,
          appointment_date: selectedDate,
          start_time: selectedSlot,
          end_time: endTimeStr
        })
      })

      if (res.ok) {
        const resData = await res.json().catch(() => ({}))
        const dt = selectedDate.split('-').reverse().join('/')
        const firstName = clientName.split(' ')[0]
        const firstServiceName = selectedServices[0]?.name || service?.name || 'Serviço'
        if (resData.owner_id) {
          await sendPushNotification('client_rescheduled', resData.owner_id, 'Agendamento Remarcado', `${firstName} remarcou ${firstServiceName} para ${dt} às ${selectedSlot}.`)
        }
        setLoading(false)
        toast.success('Horário reagendado com sucesso!')
        onSuccess()
      } else {
        const errData = await res.json().catch(() => ({}))
        setLoading(false)
        toast.error(errData.error || 'Erro ao reagendar. Tente novamente.')
      }
    } else {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const authHeaders = { 'Content-Type': 'application/json' }
        if (session?.access_token) {
          authHeaders['Authorization'] = `Bearer ${session.access_token}`
        }
        const checkResponse = await fetch('/api/client-identity', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ action: 'check_active', salon_id: salonId, client_id: clientId })
        })
        if (checkResponse.ok) {
          const checkData = await checkResponse.json()
          if (checkData.blocked === true) {
            setLoading(false)
            toast.error('Não é possível agendar no momento. Entre em contato com o salão.')
            return
          }
        }
      } catch (_) {
        // Falha de rede no check: prossegue para o insert (banco é o enforcement real)
      }

      const createRes = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          salon_id: salonId,
          client_id: clientId,
          service_id: selectedServiceIds[0],
          service_ids: selectedServiceIds,
          professional_id: selectedProfessional || null,
          appointment_date: selectedDate,
          start_time: selectedSlot,
          end_time: endTimeStr
        })
      })

      if (createRes.ok) {
        const createData = await createRes.json().catch(() => ({}))
        const dt = selectedDate.split('-').reverse().join('/')
        const firstName = clientName.split(' ')[0]
        const serviceNamesStr = selectedServices.map(s => s.name).join(', ')
        if (createData.owner_id) {
          await sendPushNotification('new_appointment', createData.owner_id, 'Novo Agendamento', `${firstName} agendou ${serviceNamesStr} para ${dt} às ${selectedSlot}.`)
        }
        setLoading(false)
        toast.success('Horário agendado com sucesso!')
        onSuccess()
      } else {
        const errData = await createRes.json().catch(() => ({}))
        setLoading(false)
        if (createRes.status === 409) {
          toast.error('Horário indisponível. Por favor, escolha outro horário.')
        } else if (createRes.status >= 400 && createRes.status < 500 && errData.error) {
          toast.error(errData.error)
        } else {
          toast.error('Não é possível agendar no momento. Entre em contato com o salão.')
        }
      }
    }
  }

  const handleIdentified = () => {
    setShowIdentity(false)
    setPendingConfirm(true)
  }

  useEffect(() => {
    if (pendingConfirm && clientId) {
      setPendingConfirm(false)
      handleConfirm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConfirm, clientId])

  if (!isOpen || availableServices.length === 0) return null

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: '600px', backgroundColor: 'var(--surface-color)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header Fixo */}
        <div style={{ padding: '1.5rem 1.5rem 1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{existingAppointmentId ? 'Reagendar Horário' : 'Agendar Horário'}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={24} />
          </button>
        </div>

        {showIdentity ? (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <ClientIdentityForm
              salonId={salonId}
              loginByPhone={loginByPhone}
              onIdentified={handleIdentified}
              onCancel={() => setShowIdentity(false)}
            />
          </div>
        ) : (
        <>
        {/* Conteúdo Rolável */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>

          {/* Seleção de serviços com checkboxes à esquerda */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
              {availableServices.length === 1 ? 'Serviço:' : 'Selecione os serviços:'}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {availableServices.map(s => {
                const isChecked = selectedServiceIds.includes(s.id)
                return (
                  <label
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.8rem 1rem',
                      borderRadius: '8px',
                      border: isChecked ? '2px solid var(--primary-green)' : '1px solid var(--border-color)',
                      backgroundColor: isChecked ? 'var(--light-green)' : 'var(--surface-color)',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedServiceIds(prev =>
                          prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                        )
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: '500', color: isChecked ? 'var(--dark-green)' : 'var(--text-primary)' }}>
                        {s.name}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                        {s.duration_minutes} min
                      </span>
                    </div>
                    <span style={{ fontWeight: 'bold', color: isChecked ? 'var(--dark-green)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      R$ {Number(s.price).toFixed(2).replace('.', ',')}
                    </span>
                  </label>
                )
              })}
            </div>

            {selectedServiceIds.length > 1 && (
              <div style={{ marginTop: '0.8rem', padding: '0.75rem 1rem', backgroundColor: 'var(--light-green)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', color: 'var(--dark-green)', fontWeight: '500', fontSize: '0.95rem' }}>
                <span>Total: {totalDurationMinutes} min</span>
                <span>R$ {totalPrice.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
          </div>

          {professionals && professionals.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Escolha o Profissional:</label>
              <select
                value={selectedProfessional}
                onChange={(e) => setSelectedProfessional(e.target.value)}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '1rem', color: 'var(--text-primary)', backgroundColor: 'var(--surface-color)' }}
              >
                <option value="" disabled>Selecione um profissional</option>
                {professionals.map(prof => (
                  <option key={prof.id} value={prof.id}>{prof.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Escolha a Data:</label>
            <input
              type="date"
              value={selectedDate}
              min={new Date().toLocaleDateString('en-CA')}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '1rem', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Horários Disponíveis:</label>

            {selectedServiceIds.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>Selecione ao menos um serviço.</p>
            ) : !selectedDate ? (
              <p style={{ color: 'var(--text-secondary)' }}>Selecione uma data primeiro.</p>
            ) : availableSlots.length === 0 ? (
              <div style={{ padding: '1rem', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '8px', fontSize: '0.9rem' }}>
                Nenhum horário disponível para esta data.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.8rem' }}>
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: '0.8rem',
                      borderRadius: '8px',
                      border: selectedSlot === slot ? '2px solid var(--primary-green)' : '1px solid var(--border-color)',
                      backgroundColor: selectedSlot === slot ? 'var(--light-green)' : 'var(--surface-color)',
                      color: selectedSlot === slot ? 'var(--dark-green)' : 'var(--text-primary)',
                      fontWeight: selectedSlot === slot ? 'bold' : 'normal',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Fixo */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem' }}
            disabled={!selectedSlot || loading || selectedServiceIds.length === 0}
            onClick={handleConfirm}
          >
            {loading ? 'Confirmando...' : 'Confirmar Horário'}
          </button>
        </div>
        </>
        )}

      </div>
    </div>
  )
}

export default BookingEngine
