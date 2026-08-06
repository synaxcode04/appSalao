import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabase'
import { Trash2, Edit2, ToggleLeft, ToggleRight, CheckCircle, Users, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

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
      .select('id, name, description, price, is_active, subscription_plan_services(service_id, monthly_quota, services(id, name)), subscription_plan_days(day_of_week)')
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
        <h3 className="modal-title">{editId ? 'Editar Plano' : 'Novo Plano'}</h3>
        <form onSubmit={handleSave} className="auth-form" style={{ marginTop: '1rem' }}>
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
            style={{ width: '100%', padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', minHeight: '70px', fontFamily: 'inherit', fontSize: '1rem' }}
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

          {/* Seleção de serviços com cota */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
              Serviços incluídos e quantidade por ciclo (30 dias):
            </label>
            {services.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Cadastre serviços antes de criar um plano.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {services.map(s => {
                  const entry = serviceQuotas[s.id]
                  const isChecked = !!entry?.selected
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.7rem 0.9rem',
                        borderRadius: 'var(--radius-md)',
                        border: isChecked ? '2px solid var(--primary-green)' : '1px solid var(--border-color)',
                        backgroundColor: isChecked ? 'var(--light-green)' : 'transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleService(s.id)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontWeight: '500', color: isChecked ? 'var(--dark-green)' : 'var(--text-primary)' }}>
                        {s.name}
                      </span>
                      {isChecked && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Qtd/ciclo (30 dias):</span>
                          <input
                            type="number"
                            min="1"
                            value={entry.quota}
                            onChange={(e) => setServiceQuota(s.id, e.target.value)}
                            style={{ width: '70px', padding: '0.4rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Seleção de dias da semana */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
              Dias da semana permitidos:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {WEEK_DAYS.map(d => {
                const isSel = selectedDays.includes(d.value)
                return (
                  <button
                    type="button"
                    key={d.value}
                    onClick={() => toggleDay(d.value)}
                    style={{
                      padding: '0.5rem 0.9rem',
                      borderRadius: 'var(--radius-md)',
                      border: isSel ? '2px solid var(--primary-green)' : '1px solid var(--border-color)',
                      backgroundColor: isSel ? 'var(--light-green)' : 'transparent',
                      color: isSel ? 'var(--dark-green)' : 'var(--text-primary)',
                      fontWeight: isSel ? 'bold' : 'normal',
                      cursor: 'pointer'
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Se nenhum dia for marcado, o plano vale para todos os dias da semana.
            </p>
          </div>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Salvando...' : (editId ? 'Atualizar Plano' : 'Adicionar Plano')}
          </button>
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
            {plans.map(plan => (
              <div key={plan.id} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', opacity: plan.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ color: 'var(--dark-green)' }}>
                      {plan.name}
                      {!plan.is_active && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#d32f2f', backgroundColor: '#ffebee', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                          Inativo
                        </span>
                      )}
                    </h4>
                    {plan.description && <PlanDescription text={plan.description} />}
                    <p style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.4rem' }}>
                      R$ {Number(plan.price).toFixed(2).replace('.', ',')} / mês
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                      <strong>Serviços:</strong>{' '}
                      {(plan.subscription_plan_services || []).length === 0
                        ? 'nenhum'
                        : plan.subscription_plan_services
                            .map(sps => `${sps.services?.name || 'Serviço'} (${sps.monthly_quota}x)`)
                            .join(', ')}
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      <strong>Dias:</strong> {formatDays(plan.subscription_plan_days)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggleActive(plan)}
                      title={plan.is_active ? 'Desativar plano' : 'Ativar plano'}
                      style={{ padding: '0.5rem', color: plan.is_active ? 'var(--primary-green)' : 'var(--text-secondary)', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {plan.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                    <button onClick={() => handleEdit(plan)} style={{ padding: '0.5rem', color: 'var(--primary-green)', backgroundColor: 'var(--light-green)', borderRadius: 'var(--radius-md)' }}>
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(plan.id)} style={{ padding: '0.5rem', color: '#d32f2f', backgroundColor: '#ffebee', borderRadius: 'var(--radius-md)' }}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
