import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { X } from 'lucide-react'
import { sendPushNotification } from '../utils/notification'
import ClientIdentityForm from './ClientIdentityForm'
import toast from 'react-hot-toast'
import useAvailableSlots from '../hooks/useAvailableSlots'
export { computeAvailableSlots } from '../utils/slotUtils'

const EMPTY_ARRAY = []

// 0 = Domingo ... 6 = Sábado — idêntico a subscription_plan_days.
const WEEK_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// services: lista de todos os serviços do salão para seleção múltipla.
// service: serviço pré-selecionado (compat com uso de serviço singular e reagendamento).
// Quando services não é fornecido, usa [service] como lista — mantendo compat retroativa.
// inline=true: renderiza o corpo embutido na página, sem overlay, sem bottom-sheet, sem header/X.
// inline=false (padrão): comportamento modal inalterado (overlay position:fixed, gating por isOpen).
function BookingEngine({ isOpen, onClose, salonId, service, services = EMPTY_ARRAY, clientId, clientName = 'Cliente', professionals = EMPTY_ARRAY, existingAppointmentId = null, onSuccess, loginByPhone = null, slotIntervalMinutes = null, inline = false }) {
  const effectiveIsOpen = inline ? true : isOpen
  const availableServices = services.length > 0 ? services : (service ? [service] : [])

  const [selectedServiceIds, setSelectedServiceIds] = useState(() => service ? [service.id] : [])
  const [selectedProfessional, setSelectedProfessional] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showIdentity, setShowIdentity] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [activeSubscriptions, setActiveSubscriptions] = useState(EMPTY_ARRAY)

  const selectedServices = availableServices.filter(s => selectedServiceIds.includes(s.id))
  const totalDurationMinutes = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0)
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0)

  useEffect(() => {
    if (effectiveIsOpen) {
      setSelectedDate(new Date().toLocaleDateString('en-CA'))
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
  }, [effectiveIsOpen, professionals, service])

  useEffect(() => {
    setSelectedSlot(null)
  }, [selectedDate, totalDurationMinutes, effectiveIsOpen, selectedProfessional, professionals])

  const { availableSlots } = useAvailableSlots({
    salonId,
    selectedDate: effectiveIsOpen ? selectedDate : '',
    selectedProfessional,
    professionals,
    totalDurationMinutes,
    slotIntervalMinutes,
    existingAppointmentId,
  })

  // Carrega assinaturas ativas do cliente neste salão — usadas só para o alerta
  // informativo de "fora do dia do plano" (não bloqueia o agendamento).
  useEffect(() => {
    let mounted = true
    if (!effectiveIsOpen || !clientId || !salonId) {
      setActiveSubscriptions(EMPTY_ARRAY)
      return
    }
    const loadSubs = async () => {
      try {
        const res = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list_client_subscriptions', salon_id: salonId, client_id: clientId })
        })
        if (res.ok) {
          const data = await res.json()
          if (mounted) setActiveSubscriptions(data.subscriptions || EMPTY_ARRAY)
        }
      } catch (_) {
        // Falha de rede: sem alerta (não crítico).
      }
    }
    loadSubs()
    return () => { mounted = false }
  }, [effectiveIsOpen, clientId, salonId])

  // Alerta não-bloqueante: cliente tem plano que cobre um serviço selecionado, mas a
  // data escolhida cai num dia FORA dos subscription_plan_days do plano (plano sem dias
  // = vale todos os dias). Nesse caso o backend trata como avulso (não desconta cota).
  const outOfPlanDayAlert = (() => {
    if (!selectedDate || selectedServiceIds.length === 0 || activeSubscriptions.length === 0) return null
    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()

    const coveringSubs = activeSubscriptions.filter(sub => {
      const planServices = sub.subscription_plans?.subscription_plan_services || []
      return planServices.some(ps => selectedServiceIds.includes(ps.service_id))
    })
    if (coveringSubs.length === 0) return null

    const planDaysOf = (sub) => (sub.subscription_plans?.subscription_plan_days || []).map(d => d.day_of_week)
    const validOnDay = coveringSubs.filter(sub => {
      const days = planDaysOf(sub)
      return days.length === 0 || days.includes(dayOfWeek)
    })
    if (validOnDay.length > 0) return null // algum plano cobre este dia → desconta normalmente

    // Nenhum plano cobre este dia → mostra os dias válidos (união dos planos que cobrem o serviço).
    const daysUnion = [...new Set(coveringSubs.flatMap(planDaysOf))].sort((a, b) => a - b)
    const daysLabel = daysUnion.length > 0 ? daysUnion.map(d => WEEK_DAY_LABELS[d]).join(', ') : 'todos os dias'
    return `Seu plano vale apenas ${daysLabel} — este agendamento será cobrado à parte, sem descontar da cota.`
  })()

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

  if (!effectiveIsOpen || availableServices.length === 0) return null

  const bodyContent = showIdentity ? (
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
      <div style={{ padding: inline ? '0' : '1.5rem', overflowY: inline ? 'visible' : 'auto', flex: inline ? 'none' : 1 }}>

        {/* Seleção de serviços com checkboxes à esquerda */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label className="ds-label" style={{ display: 'block', marginBottom: '8px' }}>
            {availableServices.length === 1 ? 'Serviço:' : 'Selecione os serviços:'}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {availableServices.map(s => {
              const isChecked = selectedServiceIds.includes(s.id)
              return (
                <label
                  key={s.id}
                  className="ds-card ds-card-interactive"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    backgroundColor: isChecked ? 'var(--ds-primary-soft)' : 'var(--ds-surface-2)',
                    border: isChecked ? '2px solid var(--ds-primary)' : '2px solid transparent',
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
                    style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0, accentColor: 'var(--ds-primary)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: '600', color: isChecked ? 'var(--ds-primary)' : 'var(--ds-text)', fontSize: '14px' }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--ds-text-2)', marginLeft: '8px' }}>
                      {s.duration_minutes} min
                    </span>
                  </div>
                  <span style={{ fontWeight: '700', color: isChecked ? 'var(--ds-primary)' : 'var(--ds-text)', fontSize: '14px', whiteSpace: 'nowrap' }}>
                    R$ {Number(s.price).toFixed(2).replace('.', ',')}
                  </span>
                </label>
              )
            })}
          </div>

          {selectedServiceIds.length > 1 && (
            <div className="ds-card ds-card-surface-2" style={{ marginTop: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', color: 'var(--ds-primary)', fontWeight: '600', fontSize: '14px' }}>
              <span>Total: {totalDurationMinutes} min</span>
              <span>R$ {totalPrice.toFixed(2).replace('.', ',')}</span>
            </div>
          )}
        </div>

        {professionals && professionals.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="ds-label" style={{ display: 'block', marginBottom: '6px' }}>Escolha o Profissional:</label>
            <select
              value={selectedProfessional}
              onChange={(e) => setSelectedProfessional(e.target.value)}
              className="ds-select"
            >
              <option value="" disabled>Selecione um profissional</option>
              {professionals.map(prof => (
                <option key={prof.id} value={prof.id}>{prof.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label className="ds-label" style={{ display: 'block', marginBottom: '6px' }}>Escolha a Data:</label>
          <input
            type="date"
            className="ds-input"
            value={selectedDate}
            min={new Date().toLocaleDateString('en-CA')}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        {outOfPlanDayAlert && (
          <div className="ds-card" style={{ marginBottom: '1.5rem', padding: '12px 16px', backgroundColor: 'var(--ds-warning-soft)', color: 'var(--ds-warning)', fontSize: '13px' }}>
            {outOfPlanDayAlert}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label className="ds-label" style={{ display: 'block', marginBottom: '8px' }}>Horários Disponíveis:</label>

          {selectedServiceIds.length === 0 ? (
            <p style={{ color: 'var(--ds-text-3)', fontSize: '13px' }}>Selecione ao menos um serviço.</p>
          ) : !selectedDate ? (
            <p style={{ color: 'var(--ds-text-3)', fontSize: '13px' }}>Selecione uma data primeiro.</p>
          ) : availableSlots.length === 0 ? (
            <div className="ds-card" style={{ padding: '12px 16px', backgroundColor: 'var(--ds-warning-soft)', color: 'var(--ds-warning)', fontSize: '13px' }}>
              Nenhum horário disponível para esta data.
            </div>
          ) : (
            <div className="ds-slot-grid">
              {availableSlots.map(slot => (
                <button
                  key={slot}
                  onClick={() => setSelectedSlot(slot)}
                  className={`ds-slot-button ${selectedSlot === slot ? 'active' : ''}`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={inline
        ? { paddingTop: '1rem', borderTop: '1px solid var(--ds-surface-2)' }
        : { padding: '1rem 1.5rem', borderTop: '1px solid var(--ds-surface-2)', backgroundColor: 'var(--ds-surface)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }
      }>
        <button
          className="ds-btn ds-btn-primary ds-btn-full ds-btn-pill"
          style={{ padding: '14px 24px', fontSize: '15px' }}
          disabled={!selectedSlot || loading || selectedServiceIds.length === 0}
          onClick={handleConfirm}
        >
          {loading ? 'Confirmando...' : 'Confirmar Horário'}
        </button>
      </div>
    </>
  )

  if (inline) {
    return (
      <div className="ds-card" style={{ padding: '20px', marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1.5rem', color: 'var(--ds-text)' }}>
          {existingAppointmentId ? 'Reagendar Horário' : 'Agendar Horário'}
        </h2>
        {bodyContent}
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
      <div className="ds-animate-slide-up" style={{ width: '100%', maxWidth: '600px', backgroundColor: 'var(--ds-surface)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header Fixo */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--ds-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--ds-text)', margin: 0 }}>
            {existingAppointmentId ? 'Reagendar Horário' : 'Agendar Horário'}
          </h2>
          <button onClick={onClose} className="ds-btn ds-btn-ghost ds-btn-pill" style={{ padding: '6px' }}>
            <X size={22} />
          </button>
        </div>

        {bodyContent}

      </div>
    </div>
  )
}

export default BookingEngine
