import React, { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useClientSession } from '../../contexts/ClientSessionContext'
import { CheckCircle, XCircle, CalendarDays, Package, Clock, CreditCard, MessageCircle, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { computePlanSavings } from '../../utils/planSavings'

// Convenção de dia da semana idêntica a working_hours e subscription_plan_days:
// 0 = Domingo ... 6 = Sábado.
const WEEK_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const DAY_MS = 24 * 60 * 60 * 1000
const CYCLE_MS = 30 * DAY_MS

// Dias restantes até a renovação do ciclo corrente. Reaproveita EXATAMENTE o mesmo
// cálculo de anchor/CYCLE_MS/cyclesElapsed de computeCycleWindow — a cota renova a cada
// 30 dias contados da data de assinatura (started_at, fallback created_at). Ex: assinou
// há 10 dias → 20 restantes; há 29 → 1; há 30 → 30 (ciclo já renovou); hoje → 30.
// Exportada em escopo de módulo para ser exercitada diretamente nos testes (sem duplicar
// a fórmula no arquivo de teste).
export function cycleDaysRemaining(subscriptionDateIso) {
  const anchor = new Date(subscriptionDateIso)
  anchor.setUTCHours(0, 0, 0, 0)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cyclesElapsed = Math.max(0, Math.floor((today.getTime() - anchor.getTime()) / CYCLE_MS))
  const endMs = anchor.getTime() + (cyclesElapsed + 1) * CYCLE_MS

  return Math.ceil((endMs - today.getTime()) / DAY_MS)
}

function ClientPlans() {
  const { salon } = useOutletContext()
  const { slug } = useParams()
  const { clientSession } = useClientSession()
  const clientId = clientSession?.client_id ?? null

  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Formas de pagamento do salão
  const [mpConnected, setMpConnected] = useState(false)
  const [salonPhone, setSalonPhone] = useState(null)

  // Plano em processo de assinatura (abre o modal de escolha de forma de pagamento)
  const [payingPlan, setPayingPlan] = useState(null)

  useEffect(() => {
    if (clientId && salon?.id) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, salon?.id])

  const loadData = async () => {
    setLoading(true)

    // Planos ofertados pelo salão (SELECT público via anon key — RLS permite)
    const plansPromise = supabase
      .from('subscription_plans')
      .select('id, name, description, price, is_active, subscription_plan_services(service_id, monthly_quota, services(id, name, price)), subscription_plan_days(day_of_week)')
      .eq('salon_id', salon.id)
      .eq('is_active', true)
      .order('price', { ascending: true })

    // Assinaturas do cliente NESTE salão (via Vercel Function service_role) — ativas e pendentes
    const subsPromise = fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_client_subscriptions', salon_id: salon.id, client_id: clientId })
    })

    // Agendamentos do cliente no salão — usados para derivar o uso mensal por serviço
    const apptsPromise = fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_by_client', salon_id: salon.id, client_id: clientId })
    })

    // O salão aceita pagamento pelo app (Mercado Pago conectado)?
    const payOptsPromise = fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_salon_payment_options', salon_id: salon.id })
    })

    // Telefone do salão para o pagamento direto via WhatsApp
    const contactPromise = fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_salon_contact', salon_id: salon.id })
    })

    const [plansRes, subsRes, apptsRes, payOptsRes, contactRes] = await Promise.all([
      plansPromise, subsPromise, apptsPromise, payOptsPromise, contactPromise
    ])

    if (plansRes.data) setPlans(plansRes.data)

    if (subsRes.ok) {
      const data = await subsRes.json()
      setSubscriptions(data.subscriptions || [])
    }

    if (apptsRes.ok) {
      const data = await apptsRes.json()
      setAppointments(data.appointments || [])
    }

    if (payOptsRes.ok) {
      const data = await payOptsRes.json()
      setMpConnected(!!data.mp_connected)
    }

    if (contactRes.ok) {
      const data = await contactRes.json()
      setSalonPhone(data.phone || null)
    }

    setLoading(false)
  }

  // Uma assinatura só concede cota (é "ativa" de verdade) quando o pagamento foi
  // aprovado — ver decisão C em mp_marketplace.sql. Pendentes aparecem como
  // "aguardando pagamento" e não consomem cota.
  const isApproved = (sub) => sub.status === 'active' && sub.payment_status === 'approved'

  const activeSubs = subscriptions.filter(isApproved)
  const pendingSubs = subscriptions.filter(sub => !isApproved(sub))

  // Janela do ciclo rolante de 30 dias — ESPELHA computeCycleWindow do backend
  const computeCycleWindow = (subscriptionDateIso) => {
    const anchor = new Date(subscriptionDateIso)
    anchor.setUTCHours(0, 0, 0, 0)

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const cyclesElapsed = Math.max(0, Math.floor((today.getTime() - anchor.getTime()) / CYCLE_MS))
    const startMs = anchor.getTime() + cyclesElapsed * CYCLE_MS
    const endMs = startMs + CYCLE_MS

    return {
      start: new Date(startMs).toISOString().slice(0, 10),
      end: new Date(endMs).toISOString().slice(0, 10)
    }
  }

  // Conta agendamentos 'scheduled' do cliente neste salão, para um serviço, DENTRO da janela do ciclo
  const usedInCycle = (serviceId, cycleStart, cycleEnd) => {
    return appointments.filter(appt => {
      if (appt.status !== 'scheduled') return false
      const d = appt.appointment_date
      if (d < cycleStart || d >= cycleEnd) return false

      const directMatch = appt.service_id === serviceId
      const multiMatch = Array.isArray(appt.appointment_services) &&
        appt.appointment_services.some(as => as.service_id === serviceId)
      return directMatch || multiMatch
    }).length
  }

  const handlePayApp = async (plan) => {
    if (!clientId) {
      toast.error('Identifique-se para assinar um plano.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/criar-preferencia-plano', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salon_id: salon.id, plan_id: plan.id, client_id: clientId })
    })

    if (!res.ok) {
      setBusy(false)
      if (res.status === 409) {
        setMpConnected(false)
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Pagamento pelo app indisponível. Use o pagamento direto com o salão.')
        return
      }
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Não foi possível iniciar o pagamento.')
      return
    }

    const data = await res.json().catch(() => ({}))
    if (!data.initPoint) {
      setBusy(false)
      toast.error('Não foi possível iniciar o pagamento.')
      return
    }

    try {
      window.localStorage.setItem('mp_return_slug', slug)
    } catch {
      // localStorage indisponível não impede o checkout.
    }

    window.location.href = data.initPoint
  }

  const handlePayExternal = async (plan) => {
    if (!clientId) {
      toast.error('Identifique-se para assinar um plano.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'subscribe',
        salon_id: salon.id,
        client_id: clientId,
        plan_id: plan.id,
        payment_method: 'external'
      })
    })
    setBusy(false)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Erro ao registrar o plano.')
      return
    }

    setPayingPlan(null)
    toast.success('Plano registrado! Combine o pagamento com o salão para ativá-lo.')

    if (salonPhone) {
      const cleanPhone = salonPhone.replace(/\D/g, '')
      const msg = `Olá! Acabei de adquirir o plano ${plan.name} pelo app e gostaria de realizar o pagamento. Como faço?`
      window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank')
    } else {
      toast.error('O telefone do salão não está disponível. Entre em contato com o salão para pagar.')
    }

    loadData()
  }

  const handleCancel = async (subscriptionId) => {
    if (!window.confirm('Tem certeza que deseja cancelar este plano?')) return
    setBusy(true)
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_subscription', subscription_id: subscriptionId, client_id: clientId, salon_id: salon.id })
    })
    setBusy(false)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Erro ao cancelar o plano.')
      return
    }
    toast.success('Plano cancelado.')
    loadData()
  }

  const formatDays = (planDays) => {
    if (!planDays || planDays.length === 0) return 'Todos os dias'
    return planDays
      .map(d => d.day_of_week)
      .sort((a, b) => a - b)
      .map(d => WEEK_DAY_LABELS[d])
      .join(', ')
  }

  const subscribedPlanIds = new Set(subscriptions.map(s => s.plan_id))

  if (loading) {
    return (
      <div className="page-content" style={{ paddingBottom: '100px', textAlign: 'center', paddingTop: '2rem' }}>
        <span className="ds-badge ds-badge-primary">Carregando planos...</span>
      </div>
    )
  }

  return (
    <div className="page-content ds-animate-fade-up" style={{ paddingBottom: '100px' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: '600', color: 'var(--ds-text)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
          Planos de Assinatura
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', margin: 0 }}>
          Assine um pacote mensal e economize nos seus serviços favoritos.
        </p>
      </header>

      {/* Assinaturas ativas */}
      {activeSubs.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--ds-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={18} style={{ color: 'var(--ds-primary)' }} /> Seu plano ativo
          </h2>
          {activeSubs.map(sub => {
            const plan = sub.subscription_plans
            if (!plan) return null
            const planServices = plan.subscription_plan_services || []
            const { start: cycleStart, end: cycleEnd } = computeCycleWindow(sub.started_at || sub.created_at)
            const daysRemaining = cycleDaysRemaining(sub.started_at || sub.created_at)
            return (
              <div key={sub.id} className="ds-card" style={{ padding: '20px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ color: 'var(--ds-text)', fontSize: '1.1rem', fontWeight: '600', margin: '0 0 4px 0' }}>{plan.name}</h3>
                    <p style={{ fontWeight: '700', color: 'var(--ds-primary)', fontSize: '15px', margin: 0 }}>
                      R$ {Number(plan.price).toFixed(2).replace('.', ',')} / mês
                    </p>
                  </div>
                  <span className="ds-badge ds-badge-success">Ativo</span>
                </div>

                {plan.description && (
                  <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', marginBottom: '12px' }}>{plan.description}</p>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '14px', fontSize: '12px', color: 'var(--ds-text-2)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CalendarDays size={14} style={{ color: 'var(--ds-primary)' }} /> Válido: {formatDays(plan.subscription_plan_days)}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} style={{ color: 'var(--ds-primary)' }} /> Renova em {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
                  </span>
                </div>

                {/* Contador de uso por ciclo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {planServices.map(ps => {
                    const used = usedInCycle(ps.service_id, cycleStart, cycleEnd)
                    const quota = ps.monthly_quota
                    const remaining = Math.max(0, quota - used)
                    const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0
                    return (
                      <div key={ps.service_id} className="ds-card ds-card-surface-2" style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '13px' }}>
                          <span style={{ fontWeight: '500', color: 'var(--ds-text)' }}>{ps.services?.name || 'Serviço'}</span>
                          <span style={{ fontSize: '12px', color: 'var(--ds-text-2)' }}>
                            {used} / {quota} no ciclo{remaining > 0 ? ` (${remaining} restantes)` : ' (esgotado)'}
                          </span>
                        </div>
                        <div style={{ height: '6px', backgroundColor: 'var(--ds-surface-3)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: remaining > 0 ? 'var(--ds-primary)' : 'var(--ds-danger)', transition: 'width var(--ds-transition-normal)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => handleCancel(sub.id)}
                  disabled={busy}
                  className="ds-btn ds-btn-danger ds-btn-pill"
                  style={{ marginTop: '16px', padding: '8px 16px', fontSize: '13px' }}
                >
                  <XCircle size={14} /> Cancelar plano
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Assinaturas pendentes */}
      {pendingSubs.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--ds-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={18} style={{ color: 'var(--ds-warning)' }} /> Aguardando pagamento
          </h2>
          {pendingSubs.map(sub => {
            const plan = sub.subscription_plans
            if (!plan) return null
            return (
              <div key={sub.id} className="ds-card" style={{ padding: '20px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <h3 style={{ color: 'var(--ds-text)', fontSize: '1.1rem', fontWeight: '600', margin: '0 0 4px 0' }}>{plan.name}</h3>
                    <p style={{ fontWeight: '700', color: 'var(--ds-text)', fontSize: '14px', margin: 0 }}>
                      R$ {Number(plan.price).toFixed(2).replace('.', ',')} / mês
                    </p>
                  </div>
                  <span className="ds-badge ds-badge-warning">Pendente</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', marginBottom: '14px' }}>
                  {sub.payment_method === 'external'
                    ? 'Combine o pagamento com o salão. Assim que o salão confirmar, o plano será ativado.'
                    : 'Estamos confirmando o seu pagamento. O plano será ativado automaticamente após a aprovação.'}
                </p>
                <button
                  onClick={() => handleCancel(sub.id)}
                  disabled={busy}
                  className="ds-btn ds-btn-danger ds-btn-pill"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  <XCircle size={14} /> Cancelar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Planos disponíveis */}
      <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--ds-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Package size={18} style={{ color: 'var(--ds-primary)' }} /> Planos disponíveis
      </h2>

      {plans.filter(p => !subscribedPlanIds.has(p.id)).length === 0 ? (
        <div className="ds-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <p style={{ color: 'var(--ds-text-2)', fontSize: '14px', margin: 0 }}>
            {plans.length === 0
              ? 'Este salão ainda não oferece planos de assinatura.'
              : 'Você já assina todos os planos disponíveis deste salão.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {plans.filter(p => !subscribedPlanIds.has(p.id)).map(plan => {
            const { savings, fullValue, planPrice } = computePlanSavings({
              price: plan.price,
              services: (plan.subscription_plan_services || []).map(ps => ({
                monthly_quota: ps.monthly_quota,
                price: ps.services?.price
              }))
            })
            return (
              <div key={plan.id} className="ds-card client-plan-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                  <h3 className="client-plan-card-name" style={{ fontSize: '1.15rem', fontWeight: '600', color: 'var(--ds-text)', margin: 0 }}>
                    {plan.name}
                  </h3>
                  <span className="client-plan-card-price" style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--ds-primary)', whiteSpace: 'nowrap' }}>
                    R$ {Number(plan.price).toFixed(2).replace('.', ',')}<span style={{ fontSize: '12px', color: 'var(--ds-text-2)' }}>/mês</span>
                  </span>
                </div>

                {savings > 0 && (
                  <span className="ds-badge ds-badge-success" style={{ marginBottom: '8px' }}>
                    Economize R$ {savings.toFixed(2).replace('.', ',')} por mês
                  </span>
                )}

                {fullValue > planPrice && (
                  <p className="client-plan-card-full-value-line" style={{ fontSize: '12px', color: 'var(--ds-text-3)', margin: '4px 0 8px 0' }}>
                    Valor total avulso: R$ {Number(fullValue).toFixed(2).replace('.', ',')}
                  </p>
                )}

                {plan.description && (
                  <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', lineHeight: '1.5', marginBottom: '12px' }}>
                    {plan.description}
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                  {(plan.subscription_plan_services || []).map(ps => (
                    <div key={ps.service_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ds-text)' }}>
                      <CheckCircle size={14} style={{ color: 'var(--ds-primary)', flexShrink: 0 }} />
                      <span>{ps.services?.name || 'Serviço'} — <strong>{ps.monthly_quota}x</strong> por ciclo de 30 dias</span>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: '12px', color: 'var(--ds-text-2)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px' }}>
                  <CalendarDays size={14} style={{ color: 'var(--ds-primary)' }} /> Válido: {formatDays(plan.subscription_plan_days)}
                </p>

                <button
                  onClick={() => setPayingPlan(plan)}
                  disabled={busy}
                  className="ds-btn ds-btn-primary ds-btn-full ds-btn-pill client-plan-card-subscribe"
                  style={{ padding: '10px 20px', fontSize: '14px' }}
                >
                  <Sparkles size={16} /> Assinar Plano
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de escolha de forma de pagamento */}
      {payingPlan && (
        <div
          onClick={() => !busy && setPayingPlan(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ds-card ds-animate-scale-in"
            style={{ padding: '24px', maxWidth: '400px', width: '100%' }}
          >
            <h3 style={{ color: 'var(--ds-text)', fontSize: '1.2rem', fontWeight: '600', marginBottom: '4px' }}>
              Assinar {payingPlan.name}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--ds-text-2)', marginBottom: '20px' }}>
              R$ {Number(payingPlan.price).toFixed(2).replace('.', ',')} / mês. Escolha a forma de pagamento:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mpConnected && (
                <button
                  onClick={() => handlePayApp(payingPlan)}
                  disabled={busy}
                  className="ds-btn ds-btn-primary ds-btn-full ds-btn-pill"
                >
                  <CreditCard size={16} /> {busy ? 'Processando...' : 'Pagar pelo app'}
                </button>
              )}

              <button
                onClick={() => handlePayExternal(payingPlan)}
                disabled={busy}
                className="ds-btn ds-btn-outline ds-btn-full ds-btn-pill"
              >
                <MessageCircle size={16} /> {busy ? 'Processando...' : 'Pagar direto com o salão'}
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--ds-text-3)', marginTop: '16px', lineHeight: '1.4' }}>
              {mpConnected
                ? 'No pagamento pelo app, o plano é ativado automaticamente após a aprovação. No pagamento direto, o salão confirma o pagamento e ativa o plano.'
                : 'Este salão recebe o pagamento diretamente. Combine com o salão pelo WhatsApp para ativar o plano.'}
            </p>

            <button
              onClick={() => setPayingPlan(null)}
              disabled={busy}
              className="ds-btn ds-btn-ghost ds-btn-full"
              style={{ marginTop: '12px', fontSize: '13px' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientPlans
