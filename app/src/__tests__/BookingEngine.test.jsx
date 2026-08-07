import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import BookingEngine, { computeAvailableSlots } from '../components/BookingEngine'

// Fixa new Date() em meia-noite de 2099-12-31 para que:
// 1) O componente defina selectedDate = '2099-12-31' (data de hoje corrigida).
// 2) computeAvailableSlots não filtre slots passados (nowMin = 0, todos os slots >= 08:00 passam).
// Apenas Date é falseada — setTimeout/setInterval permanecem reais para que waitFor funcione.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2099-12-31T00:00:00'))
})

afterAll(() => {
  vi.useRealTimers()
})

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

describe('BookingEngine — create sem profissional envia professional_id null', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('quando professionals é vazio, o payload de create inclui professional_id: null', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })

    let capturedBody = null

    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      if (url.includes('client-identity')) {
        return { ok: true, json: async () => ({ blocked: false }) }
      }
      if (body.action === 'create') {
        capturedBody = body
        return { ok: true, json: async () => ({ appointment: {}, owner_id: null }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    const onSuccess = vi.fn()
    const { queryAllByRole, getByText } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={service}
        clientId="client1"
        professionals={[]}
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => {
      const slots = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slots.length).toBeGreaterThan(0)
    })

    const firstSlot = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))[0]
    fireEvent.click(firstSlot)
    fireEvent.click(getByText('Confirmar Horário'))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
      expect(capturedBody.professional_id).toBeNull()
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

describe('BookingEngine — slotIntervalMinutes desacopla passo da duração', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('slotIntervalMinutes null (fallback) com serviço 60 min → 10 slots, passo 60 min', async () => {
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
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent)).map(b => b.textContent)
      expect(times.length).toBe(10)
      expect(times).toContain('08:00')
      expect(times).toContain('17:00')
      expect(times).not.toContain('08:30')
    })
  })

  it('slotIntervalMinutes=30, serviço 60 min → passo de 30 min, duração real 60 min, 19 slots (último início 17:00)', async () => {
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
        slotIntervalMinutes={30}
      />
    )

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent)).map(b => b.textContent)
      // passo 30 min, mas duração 60: último início válido é 17:00 (17:00+60=18:00)
      expect(times).toContain('08:00')
      expect(times).toContain('08:30')
      expect(times).toContain('17:00')
      expect(times).not.toContain('17:30') // 17:30+60=18:30 > 18:00
      expect(times.length).toBe(19)
    })
  })

  it('slotIntervalMinutes=15, serviço 60 min → passo de 15 min, 37 slots', async () => {
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
        slotIntervalMinutes={15}
      />
    )

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent)).map(b => b.textContent)
      expect(times).toContain('08:00')
      expect(times).toContain('08:15')
      expect(times).toContain('08:30')
      expect(times).toContain('17:00')
      expect(times).not.toContain('17:15') // 17:15+60=18:15 > 18:00
      expect(times.length).toBe(37)
    })
  })

  it('slotIntervalMinutes=30, serviço 60, slot ocupado 10:00–11:00 → 10:00 e 10:30 não aparecem', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    // 10:00 é bloqueado (slot 10:00–11:00 conflita com appt 10:00–11:00)
    // 10:30 também é bloqueado (slot 10:30–11:30 conflita com appt 10:00–11:00)
    mockFetchForSlots([{ id: 'a1', start_time: '10:00:00', end_time: '11:00:00' }])

    const { queryAllByRole } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={{ id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }}
        clientId="client1"
        professionals={[]}
        slotIntervalMinutes={30}
      />
    )

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent)).map(b => b.textContent)
      expect(times).not.toContain('10:00')
      expect(times).not.toContain('10:30')
      expect(times).toContain('09:00')
      expect(times).toContain('11:00')
    })
  })

  it('slotIntervalMinutes=30, serviço 60, break 12:00–13:00 → slots sobrepostos ao break excluídos', async () => {
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
        slotIntervalMinutes={30}
      />
    )

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent)).map(b => b.textContent)
      // slots sobrepostos com 12:00–13:00: 11:00(11–12 ok? 11:00+60=12:00, start<breakEnd e end>breakStart → 11<13 && 12>12 → false, so 11:00 is ok)
      // 11:30+60=12:30: start=690<780 && end=750>720 → blocked
      // 12:00+60=13:00: start=720<780 && end=780>720 → blocked
      // 12:30+60=13:30: start=750<780 && end=810>720 → blocked
      expect(times).not.toContain('12:00')
      expect(times).not.toContain('11:30')
      expect(times).not.toContain('12:30')
      expect(times).toContain('11:00')
      expect(times).toContain('13:00')
    })
  })

  it('slotIntervalMinutes=60 > serviceDuration=30 → passo maior que duração gera lacunas intencionais, 10 slots', async () => {
    // Quando o intervalo entre slots (passo) é maior que a duração do serviço,
    // cada slot ocupa 30 min mas o próximo só começa 60 min depois — as lacunas
    // de 30 min entre o fim de um slot e o início do próximo são comportamento
    // intencional: o dono configurou assim para espaçar atendimentos.
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
        slotIntervalMinutes={60}
      />
    )

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent)).map(b => b.textContent)
      // passo 60 min: slots em 08:00, 09:00, ..., 17:00 → 10 slots
      expect(times.length).toBe(10)
      expect(times).toContain('08:00')
      expect(times).toContain('17:00')
      // lacunas intencionais: 08:30, 09:30, ... não são slots
      expect(times).not.toContain('08:30')
      expect(times).not.toContain('09:30')
    })
  })
})

describe('BookingEngine — compatibilidade legada: prop service singular sem services array', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recebendo apenas service (singular), confirm envia service_ids=[service.id] e service_id=service.id', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })

    let capturedBody = null
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') return { ok: true, json: async () => ({ appointments: [] }) }
      if (url.includes('client-identity')) return { ok: true, json: async () => ({ blocked: false }) }
      if (body.action === 'create') {
        capturedBody = body
        return { ok: true, json: async () => ({ appointment: {}, owner_id: null }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    const onSuccess = vi.fn()
    const { queryAllByRole, getByText } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={service}
        clientId="client1"
        professionals={[]}
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => {
      const slots = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slots.length).toBeGreaterThan(0)
    })

    const firstSlot = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))[0]
    fireEvent.click(firstSlot)
    fireEvent.click(getByText('Confirmar Horário'))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
      expect(capturedBody.service_ids).toEqual([service.id])
      expect(capturedBody.service_id).toBe(service.id)
    })
  })
})

// ─── Teste da data padrão ─────────────────────────────────────────────────

describe('BookingEngine — data padrão ao abrir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ao abrir (isOpen=true), o input de data exibe a data de HOJE — não amanhã', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { container } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={{ id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }}
        clientId="client1"
        professionals={[]}
      />
    )

    const dateInput = container.querySelector('input[type="date"]')
    expect(dateInput).not.toBeNull()
    // Com fake timers em 2099-12-31T00:00:00, hoje é '2099-12-31'.
    expect(dateInput.value).toBe('2099-12-31')
  })
})

// ─── Testes de time_blocks (bloqueio pontual de horário) ──────────────────

describe('computeAvailableSlots — time_blocks', () => {
  const workingHours8to18 = {
    start_time: '08:00:00',
    end_time: '18:00:00',
    break_start_time: null,
    break_end_time: null,
  }
  const futureDate = '2099-12-31'
  const pastNow = new Date('2099-01-01T00:00:00')

  it('bloqueio de salão inteiro (professional_id null) remove slots que colidem com o intervalo', () => {
    const slots = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [],
      timeBlocks: [{ start_time: '10:00:00', end_time: '11:00:00' }],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })
    expect(slots).not.toContain('10:00')
    expect(slots).toContain('09:00')
    expect(slots).toContain('11:00')
  })

  it('bloqueio de profissional específico não afeta slots quando nenhum profissional está selecionado', () => {
    // professional_id 'p2' não é o profissional selecionado ('') — não deve bloquear
    const slotsWithoutBlock = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [],
      timeBlocks: [],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })

    const slotsWithIrrelevantBlock = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [],
      // timeBlocks já filtrados em JS pelo BookingEngine; aqui simulamos que o filtro
      // já excluiu o bloqueio de outro profissional — array vazio chega à função pura.
      timeBlocks: [],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })

    expect(slotsWithIrrelevantBlock).toEqual(slotsWithoutBlock)
    expect(slotsWithIrrelevantBlock).toContain('10:00')
  })

  it('slot completamente fora do intervalo bloqueado permanece disponível', () => {
    const slots = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [],
      timeBlocks: [{ start_time: '10:00:00', end_time: '12:00:00' }],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })
    expect(slots).toContain('08:00')
    expect(slots).toContain('09:00')
    expect(slots).toContain('12:00')
    expect(slots).toContain('13:00')
    expect(slots).not.toContain('10:00')
    expect(slots).not.toContain('11:00')
  })
})

// ─── Testes da função pura computeAvailableSlots ───────────────────────────
// Usam selectedDate no futuro distante + now no dia anterior para evitar o
// filtro "slots já passados hoje".

describe('computeAvailableSlots — função pura', () => {
  const workingHours8to18 = {
    start_time: '08:00:00',
    end_time: '18:00:00',
    break_start_time: null,
    break_end_time: null,
  }

  it('serviço único 60 min → 10 slots (08:00 a 17:00)', () => {
    const slots = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: '2099-12-31',
      now: new Date('2099-01-01T00:00:00'),
    })
    expect(slots.length).toBe(10)
    expect(slots[0]).toBe('08:00')
    expect(slots[9]).toBe('17:00')
  })

  it('dois serviços (60+90=150 min) → 4 slots onde bloco cabe no expediente', () => {
    // step=150: 08:00, 10:30, 13:00, 15:30 (15:30+150=18:00 ≤ 18:00, válido)
    const slots = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [],
      totalDurationMinutes: 150,
      slotIntervalMinutes: null,
      selectedDate: '2099-12-31',
      now: new Date('2099-01-01T00:00:00'),
    })
    expect(slots).toContain('08:00')
    expect(slots).toContain('10:30')
    expect(slots).toContain('13:00')
    expect(slots).toContain('15:30')
    expect(slots.length).toBe(4)
  })

  it('bloco de 150 min: appointment 10:00–11:00 bloqueia 08:00 e 10:30, libera 13:00 e 15:30', () => {
    // 08:00–10:30 conflita com appt 10:00–11:00
    // 10:30–13:00 conflita com appt 10:00–11:00
    // 13:00–15:30 não conflita
    const slots = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [{ start_time: '10:00:00', end_time: '11:00:00' }],
      totalDurationMinutes: 150,
      slotIntervalMinutes: null,
      selectedDate: '2099-12-31',
      now: new Date('2099-01-01T00:00:00'),
    })
    expect(slots).not.toContain('08:00')
    expect(slots).not.toContain('10:30')
    expect(slots).toContain('13:00')
    expect(slots).toContain('15:30')
    expect(slots.length).toBe(2)
  })

  it('break 12:00–13:00: bloco de 150 min que sobrepõe o intervalo é excluído', () => {
    const workingHoursWithBreak = {
      start_time: '08:00:00',
      end_time: '18:00:00',
      break_start_time: '12:00:00',
      break_end_time: '13:00:00',
    }
    // step=150: 08:00, 10:30, 13:00, 15:30
    // 08:00–10:30: break 720–780, slot 480–630. 480 < 780 && 630 > 720? 630 > 720? No. Válido.
    // 10:30–13:00: 630–780. 630 < 780 && 780 > 720 → bloqueado (termina exatamente no break end)
    // 13:00–15:30: 780–930. 780 < 780? No. Válido.
    const slots = computeAvailableSlots({
      workingHours: workingHoursWithBreak,
      appointments: [],
      totalDurationMinutes: 150,
      slotIntervalMinutes: null,
      selectedDate: '2099-12-31',
      now: new Date('2099-01-01T00:00:00'),
    })
    expect(slots).toContain('08:00')
    expect(slots).not.toContain('10:30')
    expect(slots).toContain('13:00')
    expect(slots).toContain('15:30')
    expect(slots.length).toBe(3)
  })

  it('sem serviços selecionados (totalDurationMinutes=0) → lista vazia', () => {
    const slots = computeAvailableSlots({
      workingHours: workingHours8to18,
      appointments: [],
      totalDurationMinutes: 0,
      slotIntervalMinutes: null,
      selectedDate: '2099-12-31',
      now: new Date('2099-01-01T00:00:00'),
    })
    expect(slots.length).toBe(0)
  })
})

// ─── Testes de has_lunch_break ────────────────────────────────────────────

describe('computeAvailableSlots — has_lunch_break', () => {
  const futureDate = '2099-12-31'
  const pastNow = new Date('2099-01-01T00:00:00')

  it('has_lunch_break=true com break 12:00–13:00 → slot das 12:00 é bloqueado', () => {
    const workingHours = {
      start_time: '08:00:00',
      end_time: '18:00:00',
      break_start_time: '12:00:00',
      break_end_time: '13:00:00',
      has_lunch_break: true,
    }
    const slots = computeAvailableSlots({
      workingHours,
      appointments: [],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })
    expect(slots).not.toContain('12:00')
    expect(slots).toContain('11:00')
    expect(slots).toContain('13:00')
  })

  it('has_lunch_break=false com break_start/end preenchidos → slot das 12:00 NÃO é bloqueado', () => {
    const workingHours = {
      start_time: '08:00:00',
      end_time: '18:00:00',
      break_start_time: '12:00:00',
      break_end_time: '13:00:00',
      has_lunch_break: false,
    }
    const slots = computeAvailableSlots({
      workingHours,
      appointments: [],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })
    expect(slots).toContain('12:00')
    expect(slots.length).toBe(10)
  })

  it('has_lunch_break=undefined (registro legado) com break_start/end preenchidos → slot das 12:00 é bloqueado (retrocompatibilidade)', () => {
    const workingHours = {
      start_time: '08:00:00',
      end_time: '18:00:00',
      break_start_time: '12:00:00',
      break_end_time: '13:00:00',
    }
    const slots = computeAvailableSlots({
      workingHours,
      appointments: [],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })
    expect(slots).not.toContain('12:00')
    expect(slots).toContain('11:00')
    expect(slots).toContain('13:00')
  })
})

// ─── Testes da variante inline ─────────────────────────────────────────────

describe('BookingEngine — variante inline', () => {
  const s1 = { id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }
  const s2 = { id: 's2', name: 'Escova', duration_minutes: 90, price: 80 }

  beforeEach(() => {
    vi.clearAllMocks()
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])
  })

  it('inline=true renderiza checkboxes de serviço sem overlay e sem botão X', async () => {
    const { queryAllByRole, queryByRole } = render(
      <BookingEngine
        inline
        services={[s1, s2]}
        salonId="salon1"
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    // Checkboxes presentes
    const checkboxes = queryAllByRole('checkbox')
    expect(checkboxes.length).toBe(2)

    // Nenhum botão X (o lucide X renderiza como svg dentro de button sem texto — verificamos
    // que não existe nenhum button com aria-label ou estilo de fechar).
    // O botão X modal é identificável pelo fato de o render não ter o overlay position:fixed —
    // o componente não está dentro de um portal; basta confirmar que não há overlay no DOM.
    const buttons = queryAllByRole('button')
    // Botões presentes: apenas "Confirmar Horário" (o X não aparece no inline)
    const xButtons = buttons.filter(b => b.textContent === '')
    expect(xButtons.length).toBe(0)
  })

  it('inline=true: selecionar 2 serviços exibe resumo com soma de duração e preço', async () => {
    const { queryAllByRole, getByText } = render(
      <BookingEngine
        inline
        services={[s1, s2]}
        salonId="salon1"
        clientId="client1"
        professionals={[]}
        onSuccess={vi.fn()}
      />
    )

    const checkboxes = queryAllByRole('checkbox')
    // Nenhum serviço marcado inicialmente (sem prop service) — marca os dois
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])

    // 60 + 90 = 150 min, 50 + 80 = R$ 130,00
    await waitFor(() => {
      expect(getByText('Total: 150 min')).toBeTruthy()
      expect(getByText('R$ 130,00')).toBeTruthy()
    })
  })
})

// ─── Testes de UI: múltiplos serviços com checkboxes ───────────────────────

describe('BookingEngine — múltiplos serviços com checkboxes', () => {
  const s1 = { id: 's1', name: 'Corte', duration_minutes: 60, price: 50 }
  const s2 = { id: 's2', name: 'Escova', duration_minutes: 90, price: 80 }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ao marcar segundo serviço, slots são recalculados com duração somada', async () => {
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
        service={s1}
        services={[s1, s2]}
        clientId="client1"
        professionals={[]}
      />
    )

    // Apenas s1 selecionado (60 min) → 10 slots
    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(times.length).toBe(10)
    })

    // Marca s2 também → 150 min → 4 slots
    const checkboxes = queryAllByRole('checkbox')
    expect(checkboxes.length).toBe(2)
    fireEvent.click(checkboxes[1])

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(times.length).toBe(4)
      expect(times.map(b => b.textContent)).toContain('08:00')
      expect(times.map(b => b.textContent)).toContain('15:30')
    })
  })

  it('ao desmarcar todos os serviços, botão de confirmar fica desabilitado', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])

    const { queryAllByRole, getByText } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={s1}
        services={[s1, s2]}
        clientId="client1"
        professionals={[]}
      />
    )

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(times.length).toBeGreaterThan(0)
    })

    // Seleciona um slot
    const firstSlot = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))[0]
    fireEvent.click(firstSlot)

    // Desmarca s1 → nenhum serviço selecionado → botão desabilitado
    const checkboxes = queryAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    const confirmBtn = getByText('Confirmar Horário')
    expect(confirmBtn).toBeDisabled()
  })

  it('confirm com dois serviços envia service_ids=[s1,s2] e service_id=s1', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })

    let capturedBody = null
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') return { ok: true, json: async () => ({ appointments: [] }) }
      if (url.includes('client-identity')) return { ok: true, json: async () => ({ blocked: false }) }
      if (body.action === 'create') {
        capturedBody = body
        return { ok: true, json: async () => ({ appointment: {}, owner_id: null }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    const onSuccess = vi.fn()
    const { queryAllByRole, getByText } = render(
      <BookingEngine
        isOpen={true}
        onClose={() => {}}
        salonId="salon1"
        service={s1}
        services={[s1, s2]}
        clientId="client1"
        professionals={[]}
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(times.length).toBeGreaterThan(0)
    })

    // Marca s2 → 150 min de bloco
    const checkboxes = queryAllByRole('checkbox')
    fireEvent.click(checkboxes[1])

    await waitFor(() => {
      const times = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(times.length).toBe(4)
    })

    const firstSlot = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))[0]
    fireEvent.click(firstSlot)
    fireEvent.click(getByText('Confirmar Horário'))

    await waitFor(() => {
      expect(capturedBody).not.toBeNull()
      expect(capturedBody.service_ids).toEqual(['s1', 's2'])
      expect(capturedBody.service_id).toBe('s1')
    })
  })
})
