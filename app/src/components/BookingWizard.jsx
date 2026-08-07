import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'
import { sendPushNotification } from '../utils/notification'
import ClientIdentityForm from './ClientIdentityForm'
import ServiceStep from './booking-wizard/ServiceStep'
import DateTimeStep from './booking-wizard/DateTimeStep'
import SummaryStep from './booking-wizard/SummaryStep'

const EMPTY_ARRAY = []

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// Modal wizard (3 ou 4 etapas, conforme o fluxo) para o novo fluxo de agendamento do cliente:
// 1) Serviços  2) Data/horário  3) Identificação (condicional)  4) Resumo/confirmação.
// Reaproveita o mecanismo visual do wizard do PlansManager (track/panel + altura medida via ref).
function BookingWizard({
  isOpen,
  onClose,
  salonId,
  services = EMPTY_ARRAY,
  clientId,
  clientName = 'Cliente',
  professionals = EMPTY_ARRAY,
  onSuccess,
  loginByPhone = null,
  slotIntervalMinutes = null,
}) {
  const [step, setStep] = useState(1)
  const [selectedServiceIds, setSelectedServiceIds] = useState([])
  const [selectedProfessional, setSelectedProfessional] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [resolvedClientId, setResolvedClientId] = useState(clientId)

  const [wizardHeight, setWizardHeight] = useState(null)
  const wizardPanelRefs = useRef([])

  const selectedServices = services.filter(s => selectedServiceIds.includes(s.id))
  const totalDurationMinutes = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0)
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0)

  // Reset total do estado interno ao abrir o modal.
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setSelectedServiceIds([])
      setSelectedDate(new Date().toLocaleDateString('en-CA'))
      setSelectedSlot(null)
      setLoading(false)
      setResolvedClientId(clientId)
      if (professionals.length > 0) {
        setSelectedProfessional(professionals[0].id)
      } else {
        setSelectedProfessional('')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    setSelectedSlot(null)
  }, [selectedDate, totalDurationMinutes, selectedProfessional])

  // O client_id chega via ClientSessionContext (prop clientId do pai) só depois que
  // loginByPhone/linkClientToSalon resolvem dentro do ClientIdentityForm — sincroniza
  // aqui em vez de depender do valor de retorno de onIdentified.
  useEffect(() => {
    if (clientId && !resolvedClientId) setResolvedClientId(clientId)
  }, [clientId, resolvedClientId])

  // Mede a altura do painel ativo e re-mede sempre que o conteúdo cresce/encolhe.
  // Sem o ResizeObserver, conteúdo que chega de forma assíncrona (ex: os slots de
  // horário da etapa 2, buscados dentro do filho DateTimeStep) trava a viewport numa
  // altura antiga com overflow:hidden — as linhas extras só apareciam após um clique
  // que redisparava a medição. O observer garante a re-medição sem enumerar deps.
  useEffect(() => {
    if (!isOpen) return
    const activePanel = wizardPanelRefs.current[step - 1]
    if (!activePanel) return

    // Medição imediata ao trocar de step, evita flash na transição entre etapas.
    setWizardHeight(activePanel.offsetHeight)

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setWizardHeight(activePanel.offsetHeight)
    })
    observer.observe(activePanel)
    return () => observer.disconnect()
  }, [step, selectedServiceIds, selectedDate, selectedSlot, selectedProfessional, isOpen])

  if (!isOpen) return null

  const toggleService = (serviceId) => {
    setSelectedServiceIds(prev =>
      prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]
    )
  }

  const goNext = () => {
    if (step === 1) {
      if (selectedServiceIds.length === 0) return
      setStep(2)
      return
    }
    if (step === 2) {
      if (!selectedSlot) return
      // Cliente já identificado: salta a etapa de identificação direto para o resumo.
      setStep(resolvedClientId ? 4 : 3)
    }
  }

  const goBack = () => {
    if (step === 4 && !resolvedClientId) {
      setStep(3)
      return
    }
    setStep(s => Math.max(1, s === 4 ? 2 : s - 1))
  }

  const handleIdentified = () => {
    setStep(4)
  }

  const handleConfirm = async () => {
    if (!selectedSlot || selectedServiceIds.length === 0) return
    if (!resolvedClientId) {
      toast.error('Ainda estamos confirmando sua identificação. Aguarde um instante e tente novamente.')
      return
    }
    setLoading(true)

    const startMin = timeToMinutes(selectedSlot)
    const endMin = startMin + totalDurationMinutes
    const endTimeStr = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const authHeaders = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`
      }
      const checkResponse = await fetch('/api/client-identity', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: 'check_active', salon_id: salonId, client_id: resolvedClientId })
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
        client_id: resolvedClientId,
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
      onClose()
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

  const canGoNext = (step === 1 && selectedServiceIds.length > 0) || (step === 2 && !!selectedSlot)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card booking-wizard-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className="modal-title" style={{ margin: 0 }}>Agendar Horário</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={22} />
          </button>
        </div>

        <div
          className="plan-wizard-viewport"
          style={wizardHeight ? { height: `${wizardHeight}px` } : undefined}
        >
          <div
            className="plan-wizard-track"
            style={{ transform: `translateX(calc(-${step - 1} * 100%))` }}
          >
            <div className="plan-wizard-panel" ref={(el) => { wizardPanelRefs.current[0] = el }}>
              <ServiceStep
                services={services}
                selectedServiceIds={selectedServiceIds}
                onToggleService={toggleService}
                totalDurationMinutes={totalDurationMinutes}
                totalPrice={totalPrice}
              />
            </div>

            <div className="plan-wizard-panel" ref={(el) => { wizardPanelRefs.current[1] = el }}>
              <DateTimeStep
                salonId={salonId}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                professionals={professionals}
                selectedProfessional={selectedProfessional}
                onProfessionalChange={setSelectedProfessional}
                totalDurationMinutes={totalDurationMinutes}
                slotIntervalMinutes={slotIntervalMinutes}
                selectedSlot={selectedSlot}
                onSelectSlot={setSelectedSlot}
              />
            </div>

            <div className="plan-wizard-panel" ref={(el) => { wizardPanelRefs.current[2] = el }}>
              {step === 3 && !resolvedClientId && (
                <ClientIdentityForm
                  salonId={salonId}
                  loginByPhone={loginByPhone}
                  onIdentified={handleIdentified}
                  onCancel={goBack}
                />
              )}
            </div>

            <div className="plan-wizard-panel" ref={(el) => { wizardPanelRefs.current[3] = el }}>
              {step === 4 && (
                <SummaryStep
                  selectedServices={selectedServices}
                  selectedDate={selectedDate}
                  selectedSlot={selectedSlot}
                  totalDurationMinutes={totalDurationMinutes}
                  totalPrice={totalPrice}
                  loading={loading}
                  onConfirm={handleConfirm}
                />
              )}
            </div>
          </div>
        </div>

        {step !== 3 && (
          <div className="plan-wizard-nav">
            {step > 1 && (
              <button type="button" onClick={goBack} className="modal-cancel" style={{ marginTop: 0 }}>
                Voltar
              </button>
            )}
            {step < 3 && (
              <button type="button" onClick={goNext} disabled={!canGoNext} className="btn-primary">
                Próximo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default BookingWizard
