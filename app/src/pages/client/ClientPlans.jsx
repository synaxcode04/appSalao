import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useClientSession } from '../../contexts/ClientSessionContext'
import { CheckCircle, XCircle, CalendarDays, Package } from 'lucide-react'
import toast from 'react-hot-toast'

// Convenção de dia da semana idêntica a working_hours e subscription_plan_days:
// 0 = Domingo ... 6 = Sábado.
const WEEK_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function ClientPlans() {
  const { salon } = useOutletContext()
  const { clientSession } = useClientSession()
  const clientId = clientSession?.client_id ?? null

  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (clientId && salon?.id) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, salon?.id])

  const loadData = async () => {
    setLoading(true)

    // Planos ofertados pelo salão (SELECT público via anon key — RLS permite)
    const plansPromise = supabase
      .from('subscription_plans')
      .select('id, name, description, price, is_active, subscription_plan_services(service_id, monthly_quota, services(id, name)), subscription_plan_days(day_of_week)')
      .eq('salon_id', salon.id)
      .eq('is_active', true)
      .order('price', { ascending: true })

    // Assinaturas ativas do cliente NESTE salão (via Vercel Function service_role)
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

    const [plansRes, subsRes, apptsRes] = await Promise.all([plansPromise, subsPromise, apptsPromise])

    if (plansRes.data) setPlans(plansRes.data)

    if (subsRes.ok) {
      const data = await subsRes.json()
      setSubscriptions(data.subscriptions || [])
    }

    if (apptsRes.ok) {
      const data = await apptsRes.json()
      setAppointments(data.appointments || [])
    }

    setLoading(false)
  }

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

  const handleSubscribe = async (planId) => {
    if (!clientId) {
      toast.error('Identifique-se para assinar um plano.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'subscribe', salon_id: salon.id, client_id: clientId, plan_id: planId })
    })
    setBusy(false)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Erro ao assinar o plano.')
      return
    }
    toast.success('Plano assinado com sucesso!')
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

  // Ids dos planos que o cliente já assina (ativos) — evita re-oferta.
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

      {/* Assinaturas ativas do cliente com contador de uso */}
      {subscriptions.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={20} color="var(--primary-green)" /> Seu plano ativo
          </h2>
          {subscriptions.map(sub => {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {plans.filter(p => !subscribedPlanIds.has(p.id)).map(plan => (
            <div key={plan.id} className="card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.6rem' }}>
                <h3 style={{ color: 'var(--dark-green)', fontSize: '1.2rem' }}>{plan.name}</h3>
                <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  R$ {Number(plan.price).toFixed(2).replace('.', ',')}<span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>/mês</span>
                </span>
              </div>

              {plan.description && (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>{plan.description}</p>
              )}

              <div style={{ marginBottom: '0.6rem' }}>
                {(plan.subscription_plan_services || []).map(ps => (
                  <p key={ps.service_id} style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle size={14} color="var(--primary-green)" /> {ps.services?.name || 'Serviço'} — {ps.monthly_quota}x por ciclo de 30 dias
                  </p>
                ))}
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                <CalendarDays size={16} /> Válido: {formatDays(plan.subscription_plan_days)}
              </p>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={busy}
                className="btn-primary"
                style={{ width: 'auto', padding: '0.7rem 1.4rem' }}
              >
                {busy ? 'Processando...' : 'Assinar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ClientPlans
