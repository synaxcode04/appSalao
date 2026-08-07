import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import BookingWizard from '../components/BookingWizard'

// Fixa new Date() em 2099-12-31 — mesma técnica de BookingEngine.test.jsx — para que
// selectedDate default seja determinístico e slots futuros não sejam filtrados.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2099-12-31T00:00:00'))
})

afterAll(() => {
  vi.useRealTimers()
})

const workingHoursData = {
  start_time: '08:00:00',
  end_time: '18:00:00',
  break_start_time: null,
  break_end_time: null,
}

const s1 = { id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }
const s2 = { id: 's2', name: 'Escova', duration_minutes: 90, price: 80 }

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  }
}))

vi.mock('../utils/notification', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../utils/clientIdentity', () => ({
  formatPhone: (v) => v,
  lookupClient: vi.fn(),
  linkClientToSalon: vi.fn(),
}))

import { supabase } from '../supabase'

function makeChain(resolveValue, resolveError = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolveValue, error: resolveError }),
    then: (resolve) => resolve({ data: resolveValue, error: resolveError }),
  }
}

function mockFetchForSlots(appointmentsData = []) {
  global.fetch = vi.fn().mockImplementation(async (url, opts) => {
    const body = JSON.parse(opts?.body || '{}')
    if (body.action === 'list_scheduled') {
      return { ok: true, json: async () => ({ appointments: appointmentsData }) }
    }
    return { ok: true, json: async () => ({}) }
  })
}

describe('BookingWizard — etapa 1 (serviços)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])
  })

  it('selecionar 2 serviços exibe a soma correta de duração e valor', async () => {
    const { getByText } = render(
      <BookingWizard
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        services={[s1, s2]}
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    fireEvent.click(getByText('Corte'))
    fireEvent.click(getByText('Escova'))

    await waitFor(() => {
      expect(getByText('Total: 150 min')).toBeTruthy()
      expect(getByText('R$ 130,00')).toBeTruthy()
    })
  })

  it('botão Próximo fica desabilitado com 0 serviços selecionados', () => {
    const { getByText } = render(
      <BookingWizard
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        services={[s1, s2]}
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    expect(getByText('Próximo')).toBeDisabled()
  })
})

describe('BookingWizard — salto da identificação quando cliente já identificado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])
  })

  it('com clientId presente, avançar da etapa 2 nunca renderiza ClientIdentityForm — vai direto ao resumo', async () => {
    const { getByText, queryByText, queryAllByRole } = render(
      <BookingWizard
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        services={[s1]}
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    fireEvent.click(getByText('Corte'))
    fireEvent.click(getByText('Próximo'))

    await waitFor(() => {
      const slots = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slots.length).toBeGreaterThan(0)
    })
    fireEvent.click(queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))[0])
    fireEvent.click(getByText('Próximo'))

    await waitFor(() => {
      expect(queryByText('Identifique-se para agendar')).toBeNull()
      expect(getByText('Confirmar Agendamento')).toBeTruthy()
    })
  })

  it('com clientId ausente, avançar da etapa 2 renderiza a etapa de identificação', async () => {
    const { getByText, queryAllByRole } = render(
      <BookingWizard
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        services={[s1]}
        clientId={null}
        professionals={[]}
        onSuccess={vi.fn()}
        loginByPhone={vi.fn()}
      />
    )

    fireEvent.click(getByText('Corte'))
    fireEvent.click(getByText('Próximo'))

    await waitFor(() => {
      const slots = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slots.length).toBeGreaterThan(0)
    })
    fireEvent.click(queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))[0])
    fireEvent.click(getByText('Próximo'))

    await waitFor(() => {
      expect(getByText('Identifique-se para agendar')).toBeTruthy()
    })
  })
})

describe('BookingWizard — título do modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])
  })

  it('o header exibe apenas "Agendar Horário" sem indicador de etapa', () => {
    const { getByText, queryByText } = render(
      <BookingWizard
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        services={[s1]}
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    expect(getByText('Agendar Horário')).toBeTruthy()
    expect(queryByText(/Etapa/)).toBeNull()
  })

  it('o título permanece "Agendar Horário" ao navegar entre etapas (avançar e voltar)', async () => {
    const { getByText, queryByText, queryAllByRole } = render(
      <BookingWizard
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        services={[s1]}
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    fireEvent.click(getByText('Corte'))
    fireEvent.click(getByText('Próximo'))

    await waitFor(() => {
      const slots = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slots.length).toBeGreaterThan(0)
    })
    expect(getByText('Agendar Horário')).toBeTruthy()
    expect(queryByText(/Etapa/)).toBeNull()

    fireEvent.click(getByText('Voltar'))

    await waitFor(() => {
      expect(getByText('Próximo')).toBeTruthy()
    })
    expect(getByText('Agendar Horário')).toBeTruthy()
    expect(queryByText(/Etapa/)).toBeNull()
  })
})

describe('BookingWizard — data padrão ao abrir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])
  })

  it('a data exibida na etapa 2 é a data de hoje', async () => {
    const { getByText, container } = render(
      <BookingWizard
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        services={[s1]}
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    fireEvent.click(getByText('Corte'))
    fireEvent.click(getByText('Próximo'))

    await waitFor(() => {
      const dateInput = container.querySelector('input[type="date"]')
      expect(dateInput).not.toBeNull()
      expect(dateInput.value).toBe('2099-12-31')
    })
  })
})
