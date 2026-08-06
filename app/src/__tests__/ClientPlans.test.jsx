import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// Dados dos planos servidos pela query Supabase (subscription_plans).
let plansData = []

// Mock do Supabase: builder encadeável e thenable. A cadeia usada por ClientPlans é
// from().select().eq().eq().order() — order() encerra a cadeia sendo awaitado no Promise.all.
function makeBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: plansData, error: null }),
    then: (resolve) => resolve({ data: plansData, error: null })
  }
  return builder
}

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => makeBuilder())
  }
}))

// Contexto de rota e sessão leve do cliente.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useOutletContext: () => ({ salon: { id: 'salon-1' } }),
    useParams: () => ({ slug: 'meu-salao' })
  }
})

vi.mock('../contexts/ClientSessionContext', () => ({
  useClientSession: () => ({ clientSession: { client_id: 'client-1', name: 'Ana', phone: '11999999999' } })
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

import ClientPlans from '../pages/client/ClientPlans'

// Os fetches auxiliares (subscriptions, appointments, payment options, contact) retornam
// listas vazias para que nenhum plano seja marcado como já assinado.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ subscriptions: [], appointments: [], mp_connected: false, phone: null })
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ClientPlans — valor cheio riscado no card de planos disponíveis', () => {
  it('renderiza o valor cheio riscado (fullValue) quando o preço do plano gera economia', async () => {
    // 2x serviço de R$ 30 = R$ 60 de valor cheio; plano R$ 40 → mostra "R$ 60,00" riscado
    plansData = [
      {
        id: 'plan-1',
        name: 'Plano Barba',
        description: null,
        price: 40,
        is_active: true,
        subscription_plan_services: [
          { service_id: 1, monthly_quota: 2, services: { id: 1, name: 'Barba', price: 30 } }
        ],
        subscription_plan_days: []
      }
    ]

    render(<ClientPlans />)

    const fullValue = await screen.findByText('R$ 60,00', { exact: false, selector: '.client-plan-card-full-value' })
    expect(fullValue).toBeInTheDocument()
    expect(fullValue.className).toContain('client-plan-card-full-value')
    // A linha de economia existente permanece.
    expect(screen.getByText('Economize R$ 20,00 por mês')).toBeInTheDocument()
  })

  it('não renderiza o valor cheio riscado quando não há economia (fullValue <= planPrice)', async () => {
    // 1x serviço de R$ 30 = R$ 30 de valor cheio; plano R$ 50 → sem economia
    plansData = [
      {
        id: 'plan-2',
        name: 'Plano Caro',
        description: null,
        price: 50,
        is_active: true,
        subscription_plan_services: [
          { service_id: 1, monthly_quota: 1, services: { id: 1, name: 'Barba', price: 30 } }
        ],
        subscription_plan_days: []
      }
    ]

    render(<ClientPlans />)

    expect(await screen.findByText('Plano Caro')).toBeInTheDocument()
    expect(document.querySelector('.client-plan-card-full-value')).toBeNull()
  })
})
