import React, { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useClientSession } from '../../contexts/ClientSessionContext'
import { CheckCircle, XCircle, CalendarDays, Package, Clock, CreditCard, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { computePlanSavings } from '../../utils/planSavings'

// Convenção de dia da semana idêntica a working_hours e subscription_plan_days:
// 0 = Domingo ... 6 = Sábado.
const WEEK_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

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
  // (app/api/appointments.js). A cota de cada serviço vale por um ciclo de 30 dias
  // contado da DATA DE ASSINATURA (started_at, fallback created_at), sem mês-calendário
  // e sem acúmulo. Retorna as bordas como 'YYYY-MM-DD' para comparar com appointment_date.
  const computeCycleWindow = (subscriptionDateIso) => {
    const DAY_MS = 24 * 60 * 60 * 1000
    const CYCLE_MS = 30 * DAY_MS

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

  // Conta agendamentos 'scheduled' do cliente neste salão, para um serviço, DENTRO da
  // janela [cycleStart, cycleEnd) do ciclo corrente da assinatura. Considera tanto o
  // service_id direto quanto os serviços em appointment_services (múltiplos serviços).
  const usedInCycle = (serviceId, cycleStart, cycleEnd) => {
    return appointments.filter(appt => {
      if (appt.status !== 'scheduled') return false
      const d = appt.appointment_date // 'YYYY-MM-DD' — comparação de string ordenável
      if (d < cycleStart || d >= cycleEnd) return false

      const directMatch = appt.service_id === serviceId
      const multiMatch = Array.isArray(appt.appointment_services) &&
        appt.appointment_services.some(as => as.service_id === serviceId)
      return directMatch || multiMatch
    }).length
  }

  // Opção (a): pagar pelo app via Mercado Pago (Checkout Pro).
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
        // Salão não conectado ao MP (ou já assinado/aprovado) — esconde a opção do app.
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

    // Guarda o slug do salão para a página de retorno (/s/pagamento) reconstruir o
    // link "voltar aos planos" — as back_urls do MP não carregam o slug.
    try {
      window.localStorage.setItem('mp_return_slug', slug)
    } catch {
      // localStorage indisponível não impede o checkout.
    }

    window.location.href = data.initPoint
  }

  // Opção (b): pagar direto com o dono. Cria a assinatura como pendente (payment_method
  // 'external') e abre o WhatsApp do salão para combinar o pagamento.
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

    // Abre o WhatsApp do salão com a mensagem padrão (mesmo padrão de ClientAppointments).
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

  // Ids dos planos que o cliente já assina (ativos OU pendentes) — evita re-oferta.
  const subscribedPlanIds = new Set(subscriptions.map(s => s.plan_id))

  if (loading) {
    return (
      <div className="page-content" style={{ paddingBottom: '100px' }}>
        <p>Carregando planos...</p>
      </div>
    )
  }

  return (
    <div className="page-content" style={{ paddingBottom: '100px' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Planos de Assinatura</h1>
        <p className="subtitle" style={{ marginTop: '0.2rem' }}>Assine um pacote mensal e economize nos seus serviços favoritos.</p>
      </header>

      {/* Assinaturas ativas (pagas/aprovadas) do cliente com contador de uso */}
      {activeSubs.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={20} color="var(--primary-green)" /> Seu plano ativo
          </h2>
          {activeSubs.map(sub => {
            const plan = sub.subscription_plans
            if (!plan) return null
            const planServices = plan.subscription_plan_services || []
            const { start: cycleStart, end: cycleEnd } = computeCycleWindow(sub.started_at || sub.created_at)
            return (
              <div key={sub.id} className="card" style={{ padding: '1.2rem', marginBottom: '1rem', borderLeft: '4px solid var(--primary-green)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.8rem' }}>
                  <div>
                    <h3 style={{ color: 'var(--dark-green)', fontSize: '1.2rem' }}>{plan.name}</h3>
                    <p style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      R$ {Number(plan.price).toFixed(2).replace('.', ',')} / mês
                    </p>
                  </div>
                  <span style={{ backgroundColor: 'var(--light-green)', color: 'var(--dark-green)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    Ativo
                  </span>
                </div>

                {plan.description && (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>{plan.description}</p>
                )}

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.8rem' }}>
                  <CalendarDays size={16} /> Válido: {formatDays(plan.subscription_plan_days)}
                </p>

                {/* Contador de uso por ciclo (30 dias rolantes) por serviço */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {planServices.map(ps => {
                    const used = usedInCycle(ps.service_id, cycleStart, cycleEnd)
                    const quota = ps.monthly_quota
                    const remaining = Math.max(0, quota - used)
                    const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0
                    return (
                      <div key={ps.service_id} style={{ padding: '0.7rem 0.9rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{ps.services?.name || 'Serviço'}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {used} / {quota} no ciclo atual{remaining > 0 ? ` (${remaining} restantes)` : ' (esgotado)'}
                          </span>
                        </div>
                        <div style={{ height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: remaining > 0 ? 'var(--primary-green)' : '#d32f2f' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => handleCancel(sub.id)}
                  disabled={busy}
                  style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: '500' }}
                >
                  <XCircle size={16} /> Cancelar plano
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Assinaturas pendentes (aguardando pagamento) — não consomem cota ainda */}
      {pendingSubs.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={20} color="#b26a00" /> Aguardando pagamento
          </h2>
          {pendingSubs.map(sub => {
            const plan = sub.subscription_plans
            if (!plan) return null
            return (
              <div key={sub.id} className="card" style={{ padding: '1.2rem', marginBottom: '1rem', borderLeft: '4px solid #f0ad4e' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.6rem' }}>
                  <div>
                    <h3 style={{ color: 'var(--dark-green)', fontSize: '1.2rem' }}>{plan.name}</h3>
                    <p style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      R$ {Number(plan.price).toFixed(2).replace('.', ',')} / mês
                    </p>
                  </div>
                  <span style={{ backgroundColor: '#fff3cd', color: '#8a6d00', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    Aguardando pagamento
                  </span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>
                  {sub.payment_method === 'external'
                    ? 'Combine o pagamento com o salão. Assim que o salão confirmar, o plano será ativado.'
                    : 'Estamos confirmando o seu pagamento. O plano será ativado automaticamente após a aprovação.'}
                </p>
                <button
                  onClick={() => handleCancel(sub.id)}
                  disabled={busy}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: 'transparent', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: '500' }}
                >
                  <XCircle size={16} /> Cancelar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Planos ofertados (não assinados) */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Package size={20} /> Planos disponíveis
      </h2>

      {plans.filter(p => !subscribedPlanIds.has(p.id)).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            {plans.length === 0
              ? 'Este salão ainda não oferece planos de assinatura.'
              : 'Você já assina todos os planos disponíveis deste salão.'}
          </p>
        </div>
      ) : (
        <div className="client-plans-available-list">
          {plans.filter(p => !subscribedPlanIds.has(p.id)).map(plan => {
            const { savings, fullValue, planPrice } = computePlanSavings({
              price: plan.price,
              services: (plan.subscription_plan_services || []).map(ps => ({
                monthly_quota: ps.monthly_quota,
                price: ps.services?.price
              }))
            })
            return (
            <div key={plan.id} className="card client-plan-card">
              <div className="client-plan-card-header">
                <h3 className="client-plan-card-name">{plan.name}</h3>
                <span className="client-plan-card-price">
                  {fullValue > planPrice && (
                    <span className="client-plan-card-full-value">R$ {Number(fullValue).toFixed(2).replace('.', ',')} </span>
                  )}
                  R$ {Number(plan.price).toFixed(2).replace('.', ',')}<span className="client-plan-card-price-suffix">/mês</span>
                </span>
              </div>

              {savings > 0 && (
                <p className="client-plan-card-savings">
                  Economize R$ {savings.toFixed(2).replace('.', ',')} por mês
                </p>
              )}

              {fullValue > planPrice && (
                <p className="client-plan-card-full-value-line" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Valor total avulso: R$ {Number(fullValue).toFixed(2).replace('.', ',')}
                </p>
              )}

              {plan.description && (
                <p className="client-plan-card-description">{plan.description}</p>
              )}

              <div className="client-plan-card-services">
                {(plan.subscription_plan_services || []).map(ps => (
                  <p key={ps.service_id} className="client-plan-card-service-item">
                    <CheckCircle size={14} color="var(--primary-green)" /> {ps.services?.name || 'Serviço'} — {ps.monthly_quota}x por ciclo de 30 dias
                  </p>
                ))}
              </div>

              <p className="client-plan-card-days">
                <CalendarDays size={16} /> Válido: {formatDays(plan.subscription_plan_days)}
              </p>

              <button
                onClick={() => setPayingPlan(plan)}
                disabled={busy}
                className="btn-primary client-plan-card-subscribe"
              >
                Assinar
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
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ padding: '1.5rem', maxWidth: '420px', width: '100%', backgroundColor: 'var(--surface-color)' }}
          >
            <h3 style={{ color: 'var(--dark-green)', marginBottom: '0.3rem' }}>Assinar {payingPlan.name}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
              R$ {Number(payingPlan.price).toFixed(2).replace('.', ',')} / mês. Escolha como deseja pagar:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {mpConnected && (
                <button
                  onClick={() => handlePayApp(payingPlan)}
                  disabled={busy}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.9rem 1rem' }}
                >
                  <CreditCard size={18} /> {busy ? 'Processando...' : 'Pagar pelo app'}
                </button>
              )}

              <button
                onClick={() => handlePayExternal(payingPlan)}
                disabled={busy}
                className="btn-outline"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.9rem 1rem', width: '100%' }}
              >
                <MessageCircle size={18} /> {busy ? 'Processando...' : 'Pagar direto com o salão'}
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
              {mpConnected
                ? 'No pagamento pelo app, o plano é ativado automaticamente após a aprovação. No pagamento direto, o salão confirma o pagamento e ativa o plano.'
                : 'Este salão recebe o pagamento diretamente. Combine com o salão pelo WhatsApp para ativar o plano.'}
            </p>

            <button
              onClick={() => setPayingPlan(null)}
              disabled={busy}
              style={{ marginTop: '1rem', width: '100%', padding: '0.6rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '500' }}
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
