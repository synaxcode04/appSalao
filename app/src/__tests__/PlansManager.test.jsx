import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

// Mock do Supabase: builder encadeável. Cada método retorna o próprio builder
// (thenable), e `single()` resolve o registro único. `from(table)` despacha os
// dados conforme a tabela consultada — populados por cada teste via setTableData.
let tableData = {}

function makeBuilder(table) {
  const resolved = { data: tableData[table] ?? null, error: null }
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve({ data: tableData[table]?.[0] ?? tableData[table] ?? null, error: null }),
    then: (resolve) => resolve(resolved)
  }
  return builder
}

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null })
    },
    from: vi.fn((table) => makeBuilder(table))
  }
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

import PlansManager, { PlanDescription, PlanServicesList } from '../pages/owner/PlansManager'

function setTableData(data) {
  tableData = data
}

// jsdom não faz layout, então scrollHeight/clientHeight são sempre 0.
// Mockamos as duas propriedades no protótipo para simular texto que "excede" ou "cabe" o clamp.
function mockMeasurements({ scrollHeight, clientHeight }) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return scrollHeight }
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return clientHeight }
  })
}

beforeEach(() => {
  setTableData({
    salons: { id: 'salon-1' },
    services: [],
    client_subscriptions: []
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete HTMLElement.prototype.scrollHeight
  delete HTMLElement.prototype.clientHeight
})

describe('PlanDescription', () => {
  it('mostra "ver mais" quando o texto excede o clamp e alterna expandir/recolher', () => {
    mockMeasurements({ scrollHeight: 100, clientHeight: 40 })
    render(<PlanDescription text="Descrição bem longa que passa de duas linhas no card do dono" />)

    const toggle = screen.getByRole('button', { name: 'ver mais' })
    expect(toggle).toBeInTheDocument()

    const paragraph = screen.getByText(/Descrição bem longa/)
    expect(paragraph.className).toContain('plan-description--clamped')

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'ver menos' })).toBeInTheDocument()
    expect(paragraph.className).not.toContain('plan-description--clamped')

    fireEvent.click(screen.getByRole('button', { name: 'ver menos' }))
    expect(screen.getByRole('button', { name: 'ver mais' })).toBeInTheDocument()
    expect(paragraph.className).toContain('plan-description--clamped')
  })

  it('não mostra botão quando o texto cabe no clamp', () => {
    mockMeasurements({ scrollHeight: 40, clientHeight: 40 })
    render(<PlanDescription text="Curta" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Curta')).toBeInTheDocument()
  })
})

describe('PlanServicesList', () => {
  it('renderiza cada serviço em um item próprio com o texto "Nome (Nx)"', () => {
    render(
      <PlanServicesList
        services={[
          { service_id: 1, services: { name: 'Barba' }, monthly_quota: 2 },
          { service_id: 2, services: { name: 'Terapia com Ozônio' }, monthly_quota: 4 }
        ]}
      />
    )

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Barba (2x)')
    expect(items[1]).toHaveTextContent('Terapia com Ozônio (4x)')
  })

  it('mostra "nenhum" e não renderiza lista quando vazio', () => {
    render(<PlanServicesList services={[]} />)

    expect(screen.getByText('nenhum')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('usa fallback "Serviço" quando o nome não vem do banco', () => {
    render(<PlanServicesList services={[{ service_id: 9, services: null, monthly_quota: 1 }]} />)

    expect(screen.getByRole('listitem')).toHaveTextContent('Serviço (1x)')
  })
})

describe('PlansManager — economia no card "Seus Planos"', () => {
  it('renderiza "Economize R$ ... por mês" quando o valor dos serviços supera o preço do plano', async () => {
    // 2x serviço de R$ 30 = R$ 60 de valor cheio; plano R$ 40 → economia R$ 20,00
    setTableData({
      salons: { id: 'salon-1' },
      services: [],
      client_subscriptions: [],
      subscription_plans: [
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
    })

    render(<PlansManager />)

    expect(await screen.findByText('Economize R$ 20,00 por mês')).toBeInTheDocument()
  })

  it('renderiza o valor cheio riscado (fullValue) quando há economia real', async () => {
    // 2x serviço de R$ 30 = R$ 60 de valor cheio; plano R$ 40 → mostra "De R$ 60,00" riscado
    setTableData({
      salons: { id: 'salon-1' },
      services: [],
      client_subscriptions: [],
      subscription_plans: [
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
    })

    render(<PlansManager />)

    const fullValue = await screen.findByText('De R$ 60,00')
    expect(fullValue).toBeInTheDocument()
    expect(fullValue.className).toContain('plan-full-value')
  })

  it('renderiza a linha "Valor total avulso: R$ ..." quando fullValue > planPrice', async () => {
    // 2x serviço de R$ 30 = R$ 60 de valor cheio; plano R$ 40 → linha adicional "R$ 60,00"
    setTableData({
      salons: { id: 'salon-1' },
      services: [],
      client_subscriptions: [],
      subscription_plans: [
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
    })

    render(<PlansManager />)

    expect(await screen.findByText('Valor total avulso: R$ 60,00')).toBeInTheDocument()
    // A linha do valor riscado existente permanece.
    expect(screen.getByText('De R$ 60,00')).toBeInTheDocument()
  })

  it('não renderiza o valor cheio riscado quando não há economia (fullValue <= planPrice)', async () => {
    setTableData({
      salons: { id: 'salon-1' },
      services: [],
      client_subscriptions: [],
      subscription_plans: [
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
    })

    render(<PlansManager />)

    expect(await screen.findByText('Plano Caro')).toBeInTheDocument()
    expect(screen.queryByText(/^De R\$/)).not.toBeInTheDocument()
  })

  it('não renderiza linha de economia quando o preço do plano não gera economia', async () => {
    // 1x serviço de R$ 30 = R$ 30 de valor cheio; plano R$ 50 → economia 0
    setTableData({
      salons: { id: 'salon-1' },
      services: [],
      client_subscriptions: [],
      subscription_plans: [
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
    })

    render(<PlansManager />)

    // Espera o plano aparecer antes de afirmar ausência da economia.
    expect(await screen.findByText('Plano Caro')).toBeInTheDocument()
    expect(screen.queryByText(/Economize R\$/)).not.toBeInTheDocument()
  })
})
