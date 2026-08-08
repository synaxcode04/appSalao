import React from 'react'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
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

describe('BookingWizard — re-medição de altura na chegada assíncrona dos slots', () => {
  // Regressão do bug de 2026-08-07: a viewport (.plan-wizard-viewport) tem overflow:hidden
  // e altura fixa em px medida via offsetHeight num useEffect cujas deps NÃO incluem os
  // slots (que chegam async dentro do filho DateTimeStep). Sem ResizeObserver, a viewport
  // travava numa altura pequena e as linhas extras de horário só apareciam após um clique.

  let observerInstances

  // offsetHeight é sempre 0 em jsdom. Simulamos uma altura proporcional à quantidade de
  // botões de horário (/^\d{2}:\d{2}$/) presentes no painel — assim, quando os slots
  // chegam, o painel "cresce" de verdade.
  const offsetHeightGetter = function () {
    const btns = Array.from(this.querySelectorAll('button'))
    const slots = btns.filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
    return 100 + slots.length * 40
  }

  beforeEach(() => {
    vi.clearAllMocks()
    observerInstances = []

    global.ResizeObserver = class {
      constructor(cb) {
        this.cb = cb
        this.observed = []
        this.disconnect = vi.fn()
        observerInstances.push(this)
      }
      observe(el) { this.observed.push(el) }
      unobserve() {}
    }

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: offsetHeightGetter,
    })

    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })
    mockFetchForSlots([])
  })

  afterEach(() => {
    delete HTMLElement.prototype.offsetHeight
    delete global.ResizeObserver
  })

  it('sem clicar em nenhum slot, a altura da viewport se atualiza sozinha quando os slots chegam', async () => {
    const { getByText, container, queryAllByRole } = render(
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

    // Aguarda os slots chegarem assincronamente (fetch/supabase resolvidos).
    await waitFor(() => {
      const slots = queryAllByRole('button').filter(b => /^\d{2}:\d{2}$/.test(b.textContent))
      expect(slots.length).toBeGreaterThan(1)
    })

    const viewport = container.querySelector('.plan-wizard-viewport')
    const activePanel = container.querySelectorAll('.plan-wizard-panel')[1]

    // O ResizeObserver foi instanciado e está observando o painel ativo (etapa 2).
    const observing = observerInstances.find(o => o.observed.includes(activePanel))
    expect(observing).toBeTruthy()

    // Altura travada pela medição inicial (grade vazia), antes do observer disparar.
    const heightBefore = parseInt(viewport.style.height, 10)

    // Simula o navegador notificando a mudança de tamanho do painel (slots já no DOM).
    act(() => {
      observing.cb([{ target: activePanel }], observing)
    })

    const heightAfter = parseInt(viewport.style.height, 10)
    const fullHeight = activePanel.offsetHeight

    expect(heightAfter).toBe(fullHeight)
    // heightBefore = painel com grade vazia (medição inicial); heightAfter = painel maior
    // após os slots async entrarem no DOM e o ResizeObserver re-medir. Provar o crescimento
    // é provar que a correção do bug funciona.
    expect(heightAfter).toBeGreaterThan(heightBefore)
  })

  it('disconnect do ResizeObserver é chamado no cleanup ao trocar de step', async () => {
    const { getByText, container, queryAllByRole } = render(
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

    const activePanel = container.querySelectorAll('.plan-wizard-panel')[1]
    const observing = observerInstances.find(o => o.observed.includes(activePanel))
    expect(observing).toBeTruthy()
    expect(observing.disconnect).not.toHaveBeenCalled()

    // Voltar troca de step -> dispara o cleanup do useEffect que instalou o observer.
    fireEvent.click(getByText('Voltar'))

    await waitFor(() => {
      expect(observing.disconnect).toHaveBeenCalled()
    })
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
