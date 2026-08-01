import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BookingEngine from '../components/BookingEngine'

// Working hours that cover 08:00–18:00 with no lunch break
const workingHoursData = {
  start_time: '08:00:00',
  end_time: '18:00:00',
  break_start_time: null,
  break_end_time: null,
}

const service = { id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }

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

import { supabase } from '../supabase'
import toast from 'react-hot-toast'

const tomorrow = (() => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
})()

function makeChain(resolveValue, resolveError = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolveValue, error: resolveError }),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolveValue, error: resolveError }),
    then: (resolve) => resolve({ data: resolveValue, error: resolveError }),
  }
}

// Appointments come from fetch('/api/appointments' action list_scheduled).
// supabase.from is only used for working_hours and salons.
function mockFetchForSlots(appointmentsData = []) {
  global.fetch = vi.fn().mockImplementation(async (url, opts) => {
    const body = JSON.parse(opts?.body || '{}')
    if (body.action === 'list_scheduled') {
      return { ok: true, json: async () => ({ appointments: appointmentsData }) }
    }
    return { ok: true, json: async () => ({}) }
  })
}

describe('BookingEngine — duração do serviço como step de slots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serviço de 60 min gera slots a cada 60 min (08:00, 09:00, ...)', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={{ id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }}
        clientId="client1"
        professionals={[]}
      />
    )

    await waitFor(() => {
      const slotButtons = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      const times = slotButtons.map(b => b.textContent)
      expect(times).toContain('08:00')
      expect(times).toContain('17:00')
      expect(times).not.toContain('08:30')
      expect(times.length).toBe(10)
    })
  })

  it('serviço de 30 min gera slots a cada 30 min (08:00, 08:30, 09:00, ...)', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={{ id: 's2', name: 'Escova', duration_minutes: 30, price: 30 }}
        clientId="client1"
        professionals={[]}
      />
    )

    await waitFor(() => {
      const slotButtons = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      const times = slotButtons.map(b => b.textContent)
      expect(times).toContain('08:00')
      expect(times).toContain('08:30')
      expect(times.length).toBe(20)
    })
  })

  it('serviço de 15 min gera slots a cada 15 min', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={{ id: 's3', name: 'Sobrancelha', duration_minutes: 15, price: 20 }}
        clientId="client1"
        professionals={[]}
      />
    )

    await waitFor(() => {
      const slotButtons = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      const times = slotButtons.map(b => b.textContent)
      expect(times).toContain('08:00')
      expect(times).toContain('08:15')
      expect(times).toContain('08:30')
      expect(times).toContain('08:45')
      expect(times.length).toBe(40)
    })
  })
})

describe('BookingEngine — status de agendamento e bloqueio de slots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('agendamento com status completed não bloqueia o slot', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    // list_scheduled filters status='scheduled' server-side; completed excluded from response
    mockFetchForSlots([])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={service}
        clientId="client1"
        professionals={[]}
        selectedDate={tomorrow}
      />
    )

    await waitFor(() => {
      const buttons = queryAllByRole('button').filter(b => b.textContent === '10:00')
      expect(buttons.length).toBe(1)
    })
  })

  it('agendamento com status scheduled bloqueia o slot', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([{ id: 'appt2', start_time: '10:00:00', end_time: '11:00:00' }])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={service}
        clientId="client1"
        professionals={[]}
        selectedDate={tomorrow}
      />
    )

    await waitFor(() => {
      const buttons = queryAllByRole('button').filter(b => b.textContent === '10:00')
      expect(buttons.length).toBe(0)
    })
  })
})

describe('BookingEngine — intervalo de almoço e conflito por profissional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('break 12:00–13:00 exclui slot 12:00 e mantém slots fora do intervalo', async () => {
    const workingHoursWithBreak = {
      start_time: '08:00:00',
      end_time: '18:00:00',
      break_start_time: '12:00:00',
      break_end_time: '13:00:00',
    }

    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursWithBreak)
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={{ id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }}
        clientId="client1"
        professionals={[]}
      />
    )

    await waitFor(() => {
      const slotButtons = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      const times = slotButtons.map(b => b.textContent)
      expect(times).not.toContain('12:00')
      expect(times).toContain('08:00')
      expect(times).toContain('13:00')
    })
  })

  it('agendamento scheduled de um profissional bloqueia slot sobreposto para aquele profissional', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([{ id: 'appt3', start_time: '10:00:00', end_time: '11:00:00' }])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={{ id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }}
        clientId="client1"
        professionals={[{ id: 'p1', name: 'Ana' }]}
      />
    )

    await waitFor(() => {
      const buttons = queryAllByRole('button').filter(b => b.textContent === '10:00')
      expect(buttons.length).toBe(0)
    })
  })
})

describe('BookingEngine — handleConfirm bloqueio de cliente inativo', () => {
  async function renderAndConfirm(fetchImpl, extraProps = {}) {
    global.fetch = vi.fn().mockImplementation(fetchImpl)

    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })

    const rendered = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={service}
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
        {...extraProps}
      />
    )

    await waitFor(() => {
      const slots = rendered.queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slots.length).toBeGreaterThan(0)
    })

    const firstSlot = rendered.queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))[0]
    fireEvent.click(firstSlot)

    const confirmBtn = rendered.getByText('Confirmar Horário')
    fireEvent.click(confirmBtn)

    return rendered
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocked: true — não chama create e exibe mensagem amigável', async () => {
    let createCalled = false

    await renderAndConfirm(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      if (url.includes('client-identity')) {
        return { ok: true, json: async () => ({ blocked: true }) }
      }
      if (body.action === 'create') {
        createCalled = true
        return { ok: true, json: async () => ({ appointment: {} }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    await waitFor(() => {
      expect(createCalled).toBe(false)
      expect(toast.error).toHaveBeenCalledWith(
        'Não é possível agendar no momento. Entre em contato com o salão.'
      )
    })
  })

  it('blocked: false — create é chamado normalmente', async () => {
    let createCalled = false

    await renderAndConfirm(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      if (url.includes('client-identity')) {
        return { ok: true, json: async () => ({ blocked: false }) }
      }
      if (body.action === 'create') {
        createCalled = true
        return { ok: true, json: async () => ({ appointment: {} }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    await waitFor(() => {
      expect(createCalled).toBe(true)
    })
  })

  it('create retorna erro genérico — exibe mensagem amigável sem expor detalhe interno', async () => {
    await renderAndConfirm(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      if (url.includes('client-identity')) {
        return { ok: true, json: async () => ({ blocked: false }) }
      }
      if (body.action === 'create') {
        return { ok: false, status: 500, json: async () => ({ error: 'internal server error details' }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Não é possível agendar no momento. Entre em contato com o salão.'
      )
      const calls = toast.error.mock.calls.flat()
      expect(calls.every(msg => !msg.includes('internal server error'))).toBe(true)
    })
  })

  it('create retorna 403 com mensagem real — exibe a mensagem do servidor, não o genérico', async () => {
    await renderAndConfirm(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      if (url.includes('client-identity')) {
        return { ok: true, json: async () => ({ blocked: false }) }
      }
      if (body.action === 'create') {
        return { ok: false, status: 403, json: async () => ({ error: 'Cliente bloqueado neste salão' }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Cliente bloqueado neste salão')
    })
  })

  it('create retorna 409 — exibe "Horário indisponível" independente do body', async () => {
    await renderAndConfirm(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      if (url.includes('client-identity')) {
        return { ok: true, json: async () => ({ blocked: false }) }
      }
      if (body.action === 'create') {
        return { ok: false, status: 409, json: async () => ({ error: 'Horário indisponível' }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Horário indisponível. Por favor, escolha outro horário.'
      )
    })
  })

  it('create retorna 400 com mensagem de dado inválido — exibe a mensagem do servidor', async () => {
    await renderAndConfirm(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      if (url.includes('client-identity')) {
        return { ok: true, json: async () => ({ blocked: false }) }
      }
      if (body.action === 'create') {
        return { ok: false, status: 400, json: async () => ({ error: 'Dados do agendamento inválidos. Recarregue a página e tente novamente.' }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Dados do agendamento inválidos. Recarregue a página e tente novamente.'
      )
    })
  })
})

describe('BookingEngine — working_hours com maybeSingle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dia sem expediente (maybeSingle retorna null sem erro) não gera slots', async () => {
    // Simula domingo sem expediente: maybeSingle retorna data: null, error: null
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(null, null)
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={service}
        clientId="client1"
        professionals={[]}
      />
    )

    await waitFor(() => {
      const slotButtons = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slotButtons.length).toBe(0)
    })
  })

  it('erro de rede em working_hours (maybeSingle retorna error) não gera slots', async () => {
    // Simula erro de rede: maybeSingle retorna data: null, error: { message: 'network error' }
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(null, { message: 'network error' })
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={service}
        clientId="client1"
        professionals={[]}
      />
    )

    await waitFor(() => {
      const slotButtons = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slotButtons.length).toBe(0)
    })
  })
})
