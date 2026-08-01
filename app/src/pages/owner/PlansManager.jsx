import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { Trash2, Edit2, ToggleLeft, ToggleRight } from 'lucide-react'

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

function PlansManager() {
  const [salonId, setSalonId] = useState(null)
  const [plans, setPlans] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
          await Promise.all([loadServices(salonData.id), loadPlans(salonData.id)])
        }
      }
      setLoading(false)
    }
    fetchSalonData()
  }, [])

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
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>{editId ? 'Editar Plano' : 'Novo Plano'}</h3>
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

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Salvando...' : (editId ? 'Atualizar Plano' : 'Adicionar Plano')}
            </button>
            {editId && (
              <button type="button" className="btn-outline" onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

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
                    {plan.description && (
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{plan.description}</p>
                    )}
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
    </div>
  )
}

export default PlansManager
