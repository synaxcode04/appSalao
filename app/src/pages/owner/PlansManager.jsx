import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabase'
import { Trash2, Edit2, ToggleLeft, ToggleRight, CheckCircle, Users, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { computePlanSavings } from '../../utils/planSavings'

// Descrição do plano com clamp de 2 linhas no card do dono, com botão "ver mais/ver menos".
// O botão só aparece quando o texto realmente excede o clamp (medido via scrollHeight > clientHeight).
// Named export para permitir teste isolado; export default do módulo continua sendo PlansManager.
export function PlanDescription({ text }) {
  const [expanded, setExpanded] = useState(false)
  const [isClamped, setIsClamped] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Mede no estado recolhido: se o conteúdo transborda o clamp, há o que expandir.
    setIsClamped(el.scrollHeight > el.clientHeight)
  }, [text])

  return (
    <div>
      <p
        ref={ref}
        className={`plan-description${expanded ? '' : ' plan-description--clamped'}`}
      >
        {text}
      </p>
      {isClamped && (
        <button
          type="button"
          className="plan-description-toggle"
          onClick={() => setExpanded(prev => !prev)}
        >
          {expanded ? 'ver menos' : 'ver mais'}
        </button>
      )}
    </div>
  )
}

// Lista de serviços do plano, um por linha, para não quebrar o nome no meio no mobile.
// Named export para permitir teste isolado; export default do módulo continua sendo PlansManager.
export function PlanServicesList({ services }) {
  const items = services || []
  return (
    <div className="plan-services">
      <p className="plan-services-label"><strong>Serviços:</strong></p>
      {items.length === 0 ? (
        <p className="plan-services-empty">nenhum</p>
      ) : (
        <ul className="plan-services-list">
          {items.map(sps => (
            <li className="plan-services-item" key={sps.service_id}>
              {`${sps.services?.name || 'Serviço'} (${sps.monthly_quota}x)`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Convenção de dia da semana idêntica a working_hours e subscription_plan_days:
// 0 = Domingo ... 6 = Sábado.
const WEEK_DAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' }
]

// Rótulos amigáveis de status de pagamento para o painel do dono.
const PAYMENT_STATUS_LABELS = {
  pending: 'Aguardando pagamento',
  approved: 'Pago',
  rejected: 'Recusado',
  in_process: 'Em processamento',
  refunded: 'Estornado',
  cancelled: 'Cancelado'
}

const PAYMENT_METHOD_LABELS = {
  mercado_pago: 'Mercado Pago (app)',
  external: 'Direto com o salão'
}

function PlansManager() {
  const [salonId, setSalonId] = useState(null)
  const [plans, setPlans] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  // Abas: gestão de planos x lista de assinantes
  const [activeTab, setActiveTab] = useState('planos')
  const [subscriptions, setSubscriptions] = useState([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [subBusy, setSubBusy] = useState(null)

  // Form states
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  // Mapa service_id -> { selected, quota }
  const [serviceQuotas, setServiceQuotas] = useState({})
  // Array de day_of_week selecionados
  const [selectedDays, setSelectedDays] = useState([])
  // Etapa atual do wizard do modal (1: dados básicos, 2: serviços/dias, 3: prévia)
  const [step, setStep] = useState(1)
  // Altura do painel ativo do wizard, medida via ref — evita que o container do
  // slide fique com a altura do painel mais alto entre os 3 (ver knowledge base).
  const [wizardHeight, setWizardHeight] = useState(null)
  const wizardPanelRefs = useRef([])

  useEffect(() => {
    const activePanel = wizardPanelRefs.current[step - 1]
    if (activePanel) setWizardHeight(activePanel.offsetHeight)
  }, [step, services, serviceQuotas, selectedDays, name, description, price, modalOpen])

  useEffect(() => {
    const fetchSalonData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: salonData } = await supabase
          .from('salons')
          .select('id')
          .eq('owner_id', user.id)
          .single()

        if (salonData) {
          setSalonId(salonData.id)
          await Promise.all([loadServices(salonData.id), loadPlans(salonData.id), loadSubscriptions(salonData.id)])
        }
      }
      setLoading(false)
    }
    fetchSalonData()
  }, [])

  // Assinantes do salão (via Supabase client autenticado — policy SELECT do dono).
  // Embute o nome/telefone do cliente (policy "Owners can view clients of their salons")
  // e o nome do plano.
  const loadSubscriptions = async (sId) => {
    setSubsLoading(true)
    const { data } = await supabase
      .from('client_subscriptions')
      .select('id, status, payment_status, payment_method, confirmed_by, started_at, created_at, clients(full_name, phone), subscription_plans(name)')
      .eq('salon_id', sId)
      .order('created_at', { ascending: false })

    if (data) setSubscriptions(data)
    setSubsLoading(false)
  }

  // Confirma manualmente o pagamento de uma assinatura paga direto com o dono
  // (payment_method='external'): ativa o plano. Escrita via Supabase client autenticado
  // (policy UPDATE do dono) — não usa service_role.
  const handleMarkAsPaid = async (sub) => {
    setSubBusy(sub.id)
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        payment_status: 'approved',
        status: 'active',
        started_at: new Date().toISOString(),
        confirmed_by: 'owner'
      })
      .eq('id', sub.id)

    if (error) {
      toast.error('Erro ao confirmar o pagamento. Tente novamente.')
      setSubBusy(null)
      return
    }
    toast.success('Pagamento confirmado. Plano ativado!')
    await loadSubscriptions(salonId)
    setSubBusy(null)
  }

  // Cancelamento pelo dono (não mexe em agendamentos futuros — decisão do CLAUDE.md).
  const handleCancelSubscription = async (sub) => {
    if (!window.confirm('Cancelar esta assinatura? Agendamentos futuros já marcados não são alterados automaticamente.')) return
    setSubBusy(sub.id)
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        canceled_by: 'owner'
      })
      .eq('id', sub.id)

    if (error) {
      toast.error('Erro ao cancelar a assinatura. Tente novamente.')
      setSubBusy(null)
      return
    }
    toast.success('Assinatura cancelada.')
    await loadSubscriptions(salonId)
    setSubBusy(null)
  }

  const loadServices = async (sId) => {
    const { data } = await supabase
      .from('services')
      .select('id, name, price')
      .eq('salon_id', sId)
      .order('name', { ascending: true })

    if (data) setServices(data)
  }

  const loadPlans = async (sId) => {
    const { data } = await supabase
      .from('subscription_plans')
      .select('id, name, description, price, is_active, subscription_plan_services(service_id, monthly_quota, services(id, name, price)), subscription_plan_days(day_of_week)')
      .eq('salon_id', sId)
      .order('created_at', { ascending: false })

    if (data) setPlans(data)
  }

  const resetForm = () => {
    setEditId(null)
    setName('')
    setDescription('')
    setPrice('')
    setServiceQuotas({})
    setSelectedDays([])
    setStep(1)
  }

  const closeModal = () => {
    setModalOpen(false)
    resetForm()
  }

  const toggleService = (serviceId) => {
    setServiceQuotas(prev => {
      const current = prev[serviceId]
      if (current?.selected) {
        return { ...prev, [serviceId]: { selected: false, quota: current.quota } }
      }
      return { ...prev, [serviceId]: { selected: true, quota: current?.quota || '1' } }
    })
  }

  const setServiceQuota = (serviceId, quota) => {
    setServiceQuotas(prev => ({
      ...prev,
      [serviceId]: { selected: true, quota }
    }))
  }

  const toggleDay = (dayValue) => {
    setSelectedDays(prev =>
      prev.includes(dayValue) ? prev.filter(d => d !== dayValue) : [...prev, dayValue]
    )
  }

  const validateStep1 = () => {
    if (!name.trim()) { toast.error('Informe o nome do plano.'); return false }
    if (!price || parseFloat(price) <= 0) { toast.error('Informe um preço mensal maior que zero.'); return false }
    return true
  }

  const validateStep2 = () => {
    const chosen = Object.entries(serviceQuotas)
      .filter(([, v]) => v.selected)
      .map(([, v]) => parseInt(v.quota, 10))
    if (chosen.length === 0) { toast.error('Selecione ao menos um serviço para o plano.'); return false }
    if (chosen.some(q => !q || q < 1)) { toast.error('A quantidade por ciclo de cada serviço deve ser no mínimo 1.'); return false }
    return true
  }

  const goNext = () => {
    if (step === 1) { if (validateStep1()) setStep(2); return }
    if (step === 2) { if (validateStep2()) setStep(3) }
  }

  const goBack = () => setStep(s => Math.max(1, s - 1))

  const handleSave = async (e) => {
    e.preventDefault()
    if (!salonId) return

    const chosenServices = Object.entries(serviceQuotas)
      .filter(([, v]) => v.selected)
      .map(([serviceId, v]) => ({ service_id: serviceId, monthly_quota: parseInt(v.quota, 10) }))

    if (chosenServices.length === 0) {
      window.alert('Selecione ao menos um serviço para o plano.')
      return
    }
    if (chosenServices.some(s => !s.monthly_quota || s.monthly_quota < 1)) {
      window.alert('A quantidade mensal de cada serviço deve ser no mínimo 1.')
      return
    }

    setSaving(true)

    const planPayload = {
      salon_id: salonId,
      name,
      description: description || null,
      price: parseFloat(price)
    }

    let planId = editId

    if (editId) {
      const { error: updateErr } = await supabase.from('subscription_plans').update(planPayload).eq('id', editId)
      if (updateErr) {
        window.alert('Erro ao atualizar o plano. Tente novamente.')
        setSaving(false)
        return
      }
      // Sincroniza filhos: delete + insert (não há transação multi-statement no Supabase JS).
      // Estratégia para minimizar a janela de inconsistência: as DUAS deleções das linhas-filhas
      // acontecem antes de qualquer insert, e os inserts (serviços e dias) vêm logo em seguida,
      // agrupados. Assim, se um insert falhar, o estrago fica confinado e o form NÃO é resetado,
      // permitindo ao usuário reenviar sem reconstruir os dados.
      const { error: delServicesErr } = await supabase.from('subscription_plan_services').delete().eq('plan_id', editId)
      if (delServicesErr) {
        window.alert('Erro ao atualizar os serviços do plano. Tente novamente.')
        setSaving(false)
        return
      }
      const { error: delDaysErr } = await supabase.from('subscription_plan_days').delete().eq('plan_id', editId)
      if (delDaysErr) {
        window.alert('Erro ao atualizar os dias do plano. Tente novamente.')
        setSaving(false)
        return
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('subscription_plans')
        .insert([planPayload])
        .select('id')
        .single()
      if (insertErr || !inserted?.id) {
        window.alert('Erro ao criar o plano. Tente novamente.')
        setSaving(false)
        return
      }
      planId = inserted.id
    }

    const serviceRows = chosenServices.map(s => ({
      plan_id: planId,
      service_id: s.service_id,
      salon_id: salonId,
      monthly_quota: s.monthly_quota
    }))
    const { error: insServicesErr } = await supabase.from('subscription_plan_services').insert(serviceRows)
    if (insServicesErr) {
      window.alert(
        editId
          ? 'Erro ao gravar os serviços do plano. Como as linhas antigas de serviços e dias já foram removidas, o plano pode estar sem serviços e sem dias. Os dados do formulário foram mantidos: salve novamente para reconstruir o plano.'
          : 'O plano foi criado, mas houve um erro ao gravar os serviços. Revise/reedite o plano antes de divulgá-lo.'
      )
      setSaving(false)
      return
    }

    if (selectedDays.length > 0) {
      const dayRows = selectedDays.map(d => ({
        plan_id: planId,
        salon_id: salonId,
        day_of_week: d
      }))
      const { error: insDaysErr } = await supabase.from('subscription_plan_days').insert(dayRows)
      if (insDaysErr) {
        window.alert(
          editId
            ? 'Os serviços do plano foram gravados, mas houve um erro ao gravar os dias permitidos. Os dados do formulário foram mantidos: salve novamente para completar o plano.'
            : 'O plano foi criado, mas houve um erro ao gravar os dias permitidos. Revise/reedite o plano antes de divulgá-lo.'
        )
        setSaving(false)
        return
      }
    }

    resetForm()
    setModalOpen(false)
    await loadPlans(salonId)
    setSaving(false)
  }

  const handleEdit = (plan) => {
    setEditId(plan.id)
    setName(plan.name)
    setDescription(plan.description || '')
    setPrice(plan.price)

    const quotas = {}
    for (const sps of plan.subscription_plan_services || []) {
      quotas[sps.service_id] = { selected: true, quota: String(sps.monthly_quota) }
    }
    setServiceQuotas(quotas)

    setSelectedDays((plan.subscription_plan_days || []).map(d => d.day_of_week))
    setStep(1)
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este plano? As linhas de serviços e dias vinculadas serão removidas.')) return
    setSaving(true)
    // ON DELETE CASCADE remove as linhas filhas automaticamente.
    const { error } = await supabase.from('subscription_plans').delete().eq('id', id)
    if (error) {
      window.alert('Erro ao excluir o plano. Tente novamente.')
      setSaving(false)
      return
    }
    if (editId === id) resetForm()
    await loadPlans(salonId)
    setSaving(false)
  }

  const handleToggleActive = async (plan) => {
    setSaving(true)
    const { error } = await supabase
      .from('subscription_plans')
      .update({ is_active: !plan.is_active })
      .eq('id', plan.id)
    if (error) {
      window.alert('Erro ao alterar o status do plano. Tente novamente.')
      setSaving(false)
      return
    }
    await loadPlans(salonId)
    setSaving(false)
  }

  const formatDays = (planDays) => {
    if (!planDays || planDays.length === 0) return 'Todos os dias'
    return planDays
      .map(d => d.day_of_week)
      .sort((a, b) => a - b)
      .map(d => WEEK_DAYS.find(w => w.value === d)?.label)
      .join(', ')
  }

  if (loading) {
    return (
      <div className="page-content">
        <p>Carregando planos...</p>
      </div>
    )
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Planos de Assinatura</h1>
        <p className="subtitle">Crie pacotes mensais de serviços para seus clientes recorrentes.</p>
      </header>

      {/* Abas: gestão de planos x assinantes */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('planos')}
          style={{ padding: '0.7rem 1.1rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'planos' ? '3px solid var(--primary-green)' : '3px solid transparent', color: activeTab === 'planos' ? 'var(--dark-green)' : 'var(--text-secondary)', fontWeight: activeTab === 'planos' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '0.95rem' }}
        >
          Planos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('assinantes')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.7rem 1.1rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'assinantes' ? '3px solid var(--primary-green)' : '3px solid transparent', color: activeTab === 'assinantes' ? 'var(--dark-green)' : 'var(--text-secondary)', fontWeight: activeTab === 'assinantes' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '0.95rem' }}
        >
          <Users size={16} /> Assinantes
        </button>
      </div>

      {activeTab === 'planos' && (
      <>
      <button
        type="button"
        className="btn-primary clients-toolbar"
        onClick={() => {
          resetForm()
          setModalOpen(true)
        }}
      >
        <Plus size={18} />
        Novo Plano
      </button>

      {modalOpen && (
      <div
        onClick={() => !saving && closeModal()}
        className="modal-overlay"
      >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card modal-card"
      >
        <h3 className="modal-title">{editId ? 'Editar Plano' : 'Novo Plano'} — Etapa {step} de 3</h3>
        <form onSubmit={handleSave} className="auth-form" style={{ marginTop: '1rem' }}>
          <div
            className="plan-wizard-viewport"
            style={wizardHeight ? { height: `${wizardHeight}px` } : undefined}
          >
            <div
              className="plan-wizard-track"
              style={{ transform: `translateX(calc(-${step - 1} * 100%))` }}
            >
              {/* Etapa 1 — dados básicos */}
              <div className="plan-wizard-panel" ref={(el) => { wizardPanelRefs.current[0] = el }}>
                <input
                  type="text"
                  placeholder="Nome do Plano (ex: Plano Barba & Cabelo)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <textarea
                  placeholder="Descrição / vantagens do plano (opcional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="plan-wizard-textarea"
                />
                <input
                  type="number"
                  placeholder="Preço mensal (R$)"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Etapa 2 — serviços + dias */}
              <div className="plan-wizard-panel" ref={(el) => { wizardPanelRefs.current[1] = el }}>
                <div>
                  <label className="plan-wizard-label">
                    Serviços incluídos e quantidade por ciclo (30 dias):
                  </label>
                  {services.length === 0 ? (
                    <p className="plan-wizard-hint">
                      Cadastre serviços antes de criar um plano.
                    </p>
                  ) : (
                    <div className="plan-wizard-service-list">
                      {services.map(s => {
                        const entry = serviceQuotas[s.id]
                        const isChecked = !!entry?.selected
                        return (
                          <div
                            key={s.id}
                            className={`plan-wizard-service-row${isChecked ? ' plan-wizard-service-row--checked' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleService(s.id)}
                              className="plan-wizard-checkbox"
                            />
                            <span className="plan-wizard-service-name">
                              {s.name}
                            </span>
                            {isChecked && (
                              <div className="plan-wizard-quota">
                                <span>Qtd/ciclo (30 dias):</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={entry.quota}
                                  onChange={(e) => setServiceQuota(s.id, e.target.value)}
                                  className="plan-wizard-quota-input"
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="plan-wizard-label">
                    Dias da semana permitidos:
                  </label>
                  <div className="plan-wizard-days">
                    {WEEK_DAYS.map(d => {
                      const isSel = selectedDays.includes(d.value)
                      return (
                        <button
                          type="button"
                          key={d.value}
                          onClick={() => toggleDay(d.value)}
                          className={`plan-wizard-day${isSel ? ' plan-wizard-day--selected' : ''}`}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="plan-wizard-hint">
                    Se nenhum dia for marcado, o plano vale para todos os dias da semana.
                  </p>
                </div>
              </div>

              {/* Etapa 3 — prévia */}
              <div className="plan-wizard-panel" ref={(el) => { wizardPanelRefs.current[2] = el }}>
                {(() => {
                  const previewServices = Object.entries(serviceQuotas)
                    .filter(([, v]) => v.selected)
                    .map(([serviceId, v]) => {
                      const svc = services.find(s => String(s.id) === String(serviceId))
                      return { name: svc?.name || 'Serviço', monthly_quota: Number(v.quota), price: svc?.price }
                    })
                  const savingsData = computePlanSavings({ price, services: previewServices })
                  return (
                    <div className="plan-preview">
                      <p className="plan-preview-hint">Assim o cliente verá seu plano:</p>
                      <h4 style={{ color: 'var(--dark-green)' }}>{name || 'Nome do plano'}</h4>
                      <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                        R$ {(parseFloat(price) || 0).toFixed(2).replace('.', ',')} / mês
                      </p>
                      {description && (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.3rem' }}>{description}</p>
                      )}
                      <p className="plan-services-label" style={{ marginTop: '0.6rem' }}><strong>Serviços:</strong></p>
                      {previewServices.length === 0 ? (
                        <p className="plan-services-empty">nenhum</p>
                      ) : (
                        <ul className="plan-services-list">
                          {previewServices.map((s, i) => (
                            <li className="plan-services-item" key={i}>
                              {`${s.name} — ${s.monthly_quota}x por ciclo de 30 dias`}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        <strong>Dias válidos:</strong>{' '}
                        {selectedDays.length === 0
                          ? 'Todos os dias'
                          : WEEK_DAYS.filter(w => selectedDays.includes(w.value)).map(w => w.label).join(', ')}
                      </p>
                      {savingsData.savings > 0 && (
                        <p className="plan-preview-savings">
                          Economize R$ {savingsData.savings.toFixed(2).replace('.', ',')} por mês
                        </p>
                      )}
                      {savingsData.fullValue > savingsData.planPrice && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          Valor total avulso: R$ {Number(savingsData.fullValue).toFixed(2).replace('.', ',')}
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          <div className="plan-wizard-nav">
            {step > 1 && (
              <button type="button" onClick={goBack} disabled={saving} className="modal-cancel" style={{ marginTop: 0 }}>
                Voltar
              </button>
            )}
            {step < 3 && (
              <button type="button" onClick={goNext} className="btn-primary">
                Avançar
              </button>
            )}
            {step === 3 && (
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Salvando...' : (editId ? 'Atualizar Plano' : 'Confirmar')}
              </button>
            )}
          </div>
        </form>

        <button
          type="button"
          onClick={closeModal}
          disabled={saving}
          className="modal-cancel"
        >
          Cancelar
        </button>
      </div>
      </div>
      )}

      <div className="card">
        <h3>Seus Planos</h3>
        {plans.length === 0 ? (
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Nenhum plano cadastrado ainda.</p>
        ) : (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {plans.map(plan => {
              const { savings, fullValue, planPrice } = computePlanSavings({
                price: plan.price,
                services: (plan.subscription_plan_services || []).map(ps => ({
                  monthly_quota: ps.monthly_quota,
                  price: ps.services?.price
                }))
              })
              return (
              <div key={plan.id} className="plan-card" style={{ opacity: plan.is_active ? 1 : 0.6 }}>
                <div className="plan-card-header">
                  <h4 className="plan-card-title">
                    {plan.name}
                    {!plan.is_active && (
                      <span className="plan-card-inactive-badge">
                        Inativo
                      </span>
                    )}
                  </h4>
                  <div className="plan-card-actions">
                    <button
                      onClick={() => handleToggleActive(plan)}
                      title={plan.is_active ? 'Desativar plano' : 'Ativar plano'}
                      className="plan-card-action-toggle"
                      style={{ color: plan.is_active ? 'var(--primary-green)' : 'var(--text-secondary)' }}
                    >
                      {plan.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                    <button onClick={() => handleEdit(plan)} className="plan-card-action-edit" title="Editar plano">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(plan.id)} className="plan-card-action-delete" title="Excluir plano">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                {plan.description && <PlanDescription text={plan.description} />}
                <p style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.4rem' }}>
                  R$ {Number(plan.price).toFixed(2).replace('.', ',')} / mês
                </p>
                <PlanServicesList services={plan.subscription_plan_services} />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  <strong>Dias:</strong> {formatDays(plan.subscription_plan_days)}
                </p>
                {savings > 0 && (
                  <p className="plan-preview-savings">
                    Economize R$ {savings.toFixed(2).replace('.', ',')} por mês
                  </p>
                )}
                {fullValue > planPrice && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Valor total avulso: R$ {Number(fullValue).toFixed(2).replace('.', ',')}
                  </p>
                )}
              </div>
              )
            })}
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'assinantes' && (
        <div className="card">
          <h3>Assinantes</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            Assinaturas dos seus clientes. Para pagamentos combinados diretamente com você, confirme o pagamento para ativar o plano.
          </p>

          {subsLoading ? (
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Carregando assinantes...</p>
          ) : subscriptions.length === 0 ? (
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Nenhum assinante ainda.</p>
          ) : (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {subscriptions.map(sub => {
                const isCanceled = sub.status === 'canceled'
                const isPaid = sub.payment_status === 'approved'
                const canConfirm = sub.payment_status === 'pending' && sub.payment_method === 'external' && !isCanceled
                return (
                  <div key={sub.id} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', opacity: isCanceled ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <h4 style={{ color: 'var(--dark-green)' }}>{sub.clients?.full_name || 'Cliente'}</h4>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                          {sub.subscription_plans?.name || 'Plano'}
                        </p>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                          Pagamento: {PAYMENT_METHOD_LABELS[sub.payment_method] || 'Não informado'}
                        </p>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: isPaid ? 'var(--light-green)' : '#fff3cd', color: isPaid ? 'var(--dark-green)' : '#8a6d00' }}>
                            {PAYMENT_STATUS_LABELS[sub.payment_status] || sub.payment_status || 'Sem status'}
                          </span>
                          {isCanceled && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#ffebee', color: '#d32f2f' }}>
                              Cancelada
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
                        {canConfirm && (
                          <button
                            onClick={() => handleMarkAsPaid(sub)}
                            disabled={subBusy === sub.id}
                            className="btn-primary"
                            style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                          >
                            <CheckCircle size={16} /> {subBusy === sub.id ? 'Salvando...' : 'Marcar como pago'}
                          </button>
                        )}
                        {!isCanceled && (
                          <button
                            onClick={() => handleCancelSubscription(sub)}
                            disabled={subBusy === sub.id}
                            style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: '500', fontSize: '0.9rem' }}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PlansManager
