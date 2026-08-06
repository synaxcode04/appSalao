import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PlanDescription, PlanServicesList } from '../pages/owner/PlansManager'

// jsdom não faz layout, então scrollHeight/clientHeight são sempre 0.
// Mockamos as duas propriedades no protótipo para simular texto que "excede" ou "cabe" o clamp.
// clientHeight fixo; scrollHeight controla se transborda.
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

afterEach(() => {
  cleanup()
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
