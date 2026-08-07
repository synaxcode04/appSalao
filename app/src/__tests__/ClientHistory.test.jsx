import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// Contexto de rota e sessão leve do cliente.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useOutletContext: () => ({ salon: { id: 'salon-1', name: 'Salão Teste' } })
  }
})

vi.mock('../contexts/ClientSessionContext', () => ({
  useClientSession: () => ({ clientSession: { client_id: 'client-1' } })
}))

import ClientHistory from '../pages/client/ClientHistory'

let appointmentsData = []

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ appointments: appointmentsData })
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ClientHistory — exibição de múltiplos serviços num único card', () => {
  it('renderiza todos os serviços e o total quando há 2+ serviços', async () => {
    appointmentsData = [{
      id: 'a1',
      appointment_date: '2026-08-01',
      start_time: '10:00:00',
      status: 'completed',
      salons: { name: 'Salão Teste' },
      services: { id: 1, name: 'Barba', price: 40 },
      appointment_services: [
        { services: { id: 1, name: 'Barba', price: 40 } },
        { services: { id: 2, name: 'Corte de Cabelo', price: 50 } }
      ]
    }]

    render(<ClientHistory />)

    await waitFor(() => expect(screen.getByText('Barba')).toBeInTheDocument())
    expect(screen.getByText('Corte de Cabelo')).toBeInTheDocument()
    expect(screen.getByText('R$ 40,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument()
    // Total somado (40 + 50)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument()
  })

  it('renderiza o serviço único (legado) sem linha de total quando não há appointment_services', async () => {
    appointmentsData = [{
      id: 'a2',
      appointment_date: '2026-08-01',
      start_time: '10:00:00',
      status: 'completed',
      salons: { name: 'Salão Teste' },
      services: { id: 7, name: 'Manicure', price: 30 }
    }]

    render(<ClientHistory />)

    await waitFor(() => expect(screen.getByText('Manicure')).toBeInTheDocument())
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })
})
