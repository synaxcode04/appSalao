import { describe, it, expect, vi, beforeEach } from 'vitest'

// process.env deve ser definido antes do import do handler
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

// Mock createClient antes de importar o handler
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'
import handler from '../../api/appointments.js'

// Cria uma chain fluente que se resolve como { data, error } ao ser aguardada
function makeChain(data, error = null) {
  const result = { data, error }
  const chain = {
    _gte: null,
    _lt: null,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn(function (col, val) { this._gte = { col, val }; return this }),
    lt: vi.fn(function (col, val) { this._lt = { col, val }; return this }),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(result).catch(fn),
    finally: (fn) => Promise.resolve(result).finally(fn),
  }
  return chain
}

// Replica exata de computeCycleWindow do handler — para asserts determinísticos
// independentes da data real em que o teste roda.
function expectedCycleWindow(subscriptionDateIso) {
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
    end: new Date(endMs).toISOString().slice(0, 10),
  }
}

// Helper para criar req e res simulados
function makeReq(body) {
  return { method: 'POST', body }
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code
      return res
    },
    json(data) {
      res.body = data
      return res
    },
  }
  return res
}

// ──────────────────────────────────────────────────────────────────────────────
// Fix 2: list_scheduled deve consumir exclude_id e filtrar o agendamento atual
// ──────────────────────────────────────────────────────────────────────────────

describe('list_scheduled — exclude_id filtra o agendamento atual do reagendamento', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sem exclude_id retorna todos os agendamentos scheduled', async () => {
    const appointments = [
      { id: 'appt-1', start_time: '10:00', end_time: '11:00' },
      { id: 'appt-2', start_time: '14:00', end_time: '15:00' },
    ]

    const appointmentsChain = makeChain(appointments)
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockReturnValue(appointmentsChain),
    })

    const req = makeReq({
      action: 'list_scheduled',
      salon_id: 'salon1',
      appointment_date: '2026-08-02',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.appointments).toHaveLength(2)
    // neq NÃO deve ter sido chamado com 'id'
    expect(appointmentsChain.neq).not.toHaveBeenCalledWith('id', expect.anything())
  })

  it('com exclude_id chama .neq("id", exclude_id) na query', async () => {
    const appointments = [{ id: 'appt-2', start_time: '14:00', end_time: '15:00' }]

    const appointmentsChain = makeChain(appointments)
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockReturnValue(appointmentsChain),
    })

    const req = makeReq({
      action: 'list_scheduled',
      salon_id: 'salon1',
      appointment_date: '2026-08-02',
      exclude_id: 'appt-1',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(appointmentsChain.neq).toHaveBeenCalledWith('id', 'appt-1')
  })

  it('com exclude_id e professional_id aplica ambos os filtros', async () => {
    const appointmentsChain = makeChain([])
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockReturnValue(appointmentsChain),
    })

    const req = makeReq({
      action: 'list_scheduled',
      salon_id: 'salon1',
      appointment_date: '2026-08-02',
      professional_id: 'prof-1',
      exclude_id: 'appt-current',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(appointmentsChain.eq).toHaveBeenCalledWith('professional_id', 'prof-1')
    expect(appointmentsChain.neq).toHaveBeenCalledWith('id', 'appt-current')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Fix 3: reschedule deve recomputar end_time server-side a partir de appointment_services
// ──────────────────────────────────────────────────────────────────────────────

describe('reschedule — end_time recomputado server-side a partir de appointment_services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('end_time adulterado pelo cliente não burla conflito quando duração real é maior', async () => {
    // Cenário: agendamento de 60 min (10:00-11:00 real)
    // Cliente envia end_time='10:10' (adulterado, real seria '11:00')
    // Conflito existente: 10:30-11:30 → conflita com 10:00-11:00, mas não com 10:00-10:10
    // Esperado: servidor recomputa 11:00 e retorna 409

    let appointmentsCallCount = 0

    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'appointments') {
          appointmentsCallCount++
          if (appointmentsCallCount === 1) {
            // Lookup do agendamento sendo reagendado
            return makeChain({ id: 'appt-123', client_id: 'client1', salon_id: 'salon1', service_id: 'svc1', professional_id: null })
          }
          // Conflict check: agendamento em 10:30-11:30
          return makeChain([{ id: 'other-appt', start_time: '10:30', end_time: '11:30' }])
        }
        if (table === 'salons') {
          return makeChain({ owner_id: 'owner1' })
        }
        if (table === 'appointment_services') {
          // 1 serviço de 60 min
          return makeChain([{ services: { duration_minutes: 60 } }])
        }
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'reschedule',
      appointment_id: 'appt-123',
      client_id: 'client1',
      appointment_date: '2026-08-02',
      start_time: '10:00',
      end_time: '10:10', // adulterado — real seria 11:00
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body.error).toBe('Horário indisponível')
  })

  it('end_time adulterado não impede reagendamento quando não há conflito com duração real', async () => {
    // Cenário: agendamento de 60 min (10:00-11:00 real)
    // Cliente envia end_time='10:10' (adulterado)
    // Sem conflitos existentes
    // Esperado: servidor recomputa 11:00, sem conflito, atualiza com end_time='11:00'

    let appointmentsCallCount = 0
    let updatedEndTime = null

    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'appointments') {
          appointmentsCallCount++
          if (appointmentsCallCount === 1) {
            return makeChain({ id: 'appt-123', client_id: 'client1', salon_id: 'salon1', service_id: 'svc1', professional_id: null })
          }
          if (appointmentsCallCount === 2) {
            // Conflict check: sem conflitos
            return makeChain([])
          }
          // Update — captura end_time computado
          const updateChain = makeChain({ id: 'appt-123', start_time: '10:00', end_time: '11:00', appointment_date: '2026-08-02', status: 'scheduled', service_id: 'svc1', professional_id: null, salon_id: 'salon1' })
          const originalUpdate = updateChain.update.bind(updateChain)
          updateChain.update = vi.fn((payload) => {
            updatedEndTime = payload.end_time
            return updateChain
          })
          return updateChain
        }
        if (table === 'salons') {
          return makeChain({ owner_id: 'owner1' })
        }
        if (table === 'appointment_services') {
          return makeChain([{ services: { duration_minutes: 60 } }])
        }
        if (table === 'clients') {
          return makeChain({ full_name: 'Cliente Teste' })
        }
        if (table === 'services') {
          return makeChain({ name: 'Corte' })
        }
        if (table === 'notifications') {
          return makeChain(null)
        }
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'reschedule',
      appointment_id: 'appt-123',
      client_id: 'client1',
      appointment_date: '2026-08-02',
      start_time: '10:00',
      end_time: '10:10', // adulterado
    })
    const res = makeRes()
    await handler(req, res)

    // O servidor deve ter computado 11:00 (não usado 10:10 do cliente)
    expect(updatedEndTime).toBe('11:00')
    expect(res.statusCode).toBe(200)
  })

  it('agendamento multi-serviço (2 serviços de 60+90=150 min) recomputa end_time correto', async () => {
    let appointmentsCallCount = 0

    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'appointments') {
          appointmentsCallCount++
          if (appointmentsCallCount === 1) {
            return makeChain({ id: 'appt-456', client_id: 'client1', salon_id: 'salon1', service_id: 'svc1', professional_id: null })
          }
          // Conflict check: agendamento em 12:30-13:00 (conflita com 10:00-12:30 real)
          return makeChain([{ id: 'conflict', start_time: '12:00', end_time: '13:00' }])
        }
        if (table === 'salons') {
          return makeChain({ owner_id: 'owner1' })
        }
        if (table === 'appointment_services') {
          // 2 serviços: 60+90=150 min
          return makeChain([
            { services: { duration_minutes: 60 } },
            { services: { duration_minutes: 90 } },
          ])
        }
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'reschedule',
      appointment_id: 'appt-456',
      client_id: 'client1',
      appointment_date: '2026-08-02',
      start_time: '10:00',
      end_time: '10:30', // adulterado — real seria 12:30 (10:00 + 150min)
    })
    const res = makeRes()
    await handler(req, res)

    // 10:00 + 150min = 12:30, conflita com 12:00-13:00
    expect(res.statusCode).toBe(409)
  })

  it('agendamento sem appointment_services faz fallback para services.duration_minutes', async () => {
    let appointmentsCallCount = 0

    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'appointments') {
          appointmentsCallCount++
          if (appointmentsCallCount === 1) {
            return makeChain({ id: 'appt-legacy', client_id: 'client1', salon_id: 'salon1', service_id: 'svc1', professional_id: null })
          }
          // Conflict check: agendamento em 10:30-11:30 (conflita com 10:00-11:00)
          return makeChain([{ id: 'conflict', start_time: '10:30', end_time: '11:30' }])
        }
        if (table === 'salons') {
          return makeChain({ owner_id: 'owner1' })
        }
        if (table === 'appointment_services') {
          // Sem linhas (agendamento legado)
          return makeChain([])
        }
        if (table === 'services') {
          // Fallback: busca duração do serviço primário
          return makeChain({ duration_minutes: 60 })
        }
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'reschedule',
      appointment_id: 'appt-legacy',
      client_id: 'client1',
      appointment_date: '2026-08-02',
      start_time: '10:00',
      end_time: '10:10', // adulterado
    })
    const res = makeRes()
    await handler(req, res)

    // Fallback: 10:00 + 60min = 11:00, conflita com 10:30-11:30
    expect(res.statusCode).toBe(409)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// create — cota do plano por CICLO ROLANTE de 30 dias (não mês-calendário)
// ──────────────────────────────────────────────────────────────────────────────

describe('create — cota do plano é por ciclo rolante de 30 dias da data de assinatura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // started_at 40 dias atrás → 1 ciclo completo decorrido; o ciclo corrente começa
  // 30 dias após a assinatura. A janela contada NÃO é o mês-calendário.
  const startedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()

  // A contagem de uso da cota agora faz DUAS consultas por serviço coberto:
  //   (a) appointments.service_id direto  (b) appointment_services (join !inner)
  // unindo appointment_ids DISTINTOS. directRows/linkedRows simulam cada uma;
  // o handler deduplica via Set. captureDirect expõe a chain (a) para asserts de
  // janela do ciclo (gte/lt).
  function buildCreateClient({ directRows = [], linkedRows = [], captureDirect } = {}) {
    let apptCall = 0
    let asCall = 0
    return {
      from: (table) => {
        if (table === 'salon_clients') return makeChain({ is_active: true })
        if (table === 'services') return makeChain([{ id: 'svc1', name: 'Corte', duration_minutes: 60 }])
        if (table === 'client_subscriptions') {
          return makeChain([{ id: 'sub1', plan_id: 'plan1', started_at: startedAt, created_at: startedAt }])
        }
        if (table === 'subscription_plan_days') return makeChain([]) // sem restrição de dia
        if (table === 'subscription_plan_services') {
          return makeChain([{ plan_id: 'plan1', service_id: 'svc1', monthly_quota: 2 }])
        }
        if (table === 'salons') return makeChain({ owner_id: 'owner1' })
        if (table === 'clients') return makeChain({ full_name: 'Cliente Teste' })
        if (table === 'notifications') return makeChain(null)
        if (table === 'appointment_services') {
          asCall++
          // 1ª chamada: consulta (b) de contagem via join. 2ª: insert dos serviços.
          if (asCall === 1) return makeChain(linkedRows)
          return makeChain(null)
        }
        if (table === 'appointments') {
          apptCall++
          if (apptCall === 1) return makeChain([]) // conflict check — sem conflito
          if (apptCall === 2) {
            // consulta (a) — contagem direta por service_id
            const c = makeChain(directRows)
            if (captureDirect) captureDirect(c)
            return c
          }
          // 3ª chamada: insert do agendamento
          return makeChain({ id: 'new-appt', salon_id: 'salon1', service_id: 'svc1', professional_id: null, appointment_date: '2026-08-02', start_time: '10:00', end_time: '11:00', status: 'scheduled' })
        }
        return makeChain(null)
      },
    }
  }

  const baseReq = {
    action: 'create',
    salon_id: 'salon1',
    client_id: 'client1',
    service_id: 'svc1',
    appointment_date: '2026-08-02',
    start_time: '10:00',
  }

  it('conta a cota na janela do ciclo corrente de 30 dias, não no mês-calendário', async () => {
    let countChain = null
    vi.mocked(createClient).mockReturnValue(
      buildCreateClient({ directRows: [], linkedRows: [], captureDirect: (c) => { countChain = c } })
    )

    const res = makeRes()
    await handler(makeReq({ ...baseReq }), res)

    const expected = expectedCycleWindow(startedAt)
    // As bordas gte/lt da contagem devem casar com a janela do ciclo de 30 dias.
    expect(countChain._gte).toEqual({ col: 'appointment_date', val: expected.start })
    expect(countChain._lt).toEqual({ col: 'appointment_date', val: expected.end })
    // Janela tem exatamente 30 dias de largura.
    const widthDays = (Date.parse(expected.end) - Date.parse(expected.start)) / (24 * 60 * 60 * 1000)
    expect(widthDays).toBe(30)
    // Cota disponível (0 de 2) → agendamento criado.
    expect(res.statusCode).toBe(201)
  })

  it('bloqueia com 409 quando a cota do ciclo corrente está esgotada', async () => {
    // 2 agendamentos com o serviço como primário (appointments.service_id).
    vi.mocked(createClient).mockReturnValue(
      buildCreateClient({ directRows: [{ id: 'a1' }, { id: 'a2' }], linkedRows: [] })
    )

    const res = makeRes()
    await handler(makeReq({ ...baseReq }), res)

    expect(res.statusCode).toBe(409)
    expect(res.body.error).toBe('Cota do plano esgotada para este serviço no ciclo atual')
  })

  it('permite o agendamento quando ainda há cota no ciclo (1 de 2 usados)', async () => {
    vi.mocked(createClient).mockReturnValue(
      buildCreateClient({ directRows: [{ id: 'a1' }], linkedRows: [] })
    )

    const res = makeRes()
    await handler(makeReq({ ...baseReq }), res)

    expect(res.statusCode).toBe(201)
  })

  it('contabiliza serviço coberto quando aparece só em appointment_services (multi-serviço), não só em service_id', async () => {
    // Nenhum agendamento tem o serviço como primário (directRows vazio), mas ele
    // é a 2ª opção em 2 agendamentos multi-serviço (só em appointment_services).
    // A cota (2) deve ser considerada ESGOTADA → 409. Contar só por service_id
    // deixaria passar (bug de bypass).
    vi.mocked(createClient).mockReturnValue(
      buildCreateClient({
        directRows: [],
        linkedRows: [{ appointment_id: 'a1' }, { appointment_id: 'a2' }],
      })
    )

    const res = makeRes()
    await handler(makeReq({ ...baseReq }), res)

    expect(res.statusCode).toBe(409)
    expect(res.body.error).toBe('Cota do plano esgotada para este serviço no ciclo atual')
  })

  it('não conta em dobro o mesmo agendamento presente em service_id e appointment_services', async () => {
    // Mesmo appointment_id 'a1' nas duas consultas (caso normal: serviço primário
    // gravado nas duas tabelas). Deve contar 1, não 2 → com cota 2 ainda cabe → 201.
    vi.mocked(createClient).mockReturnValue(
      buildCreateClient({
        directRows: [{ id: 'a1' }],
        linkedRows: [{ appointment_id: 'a1' }],
      })
    )

    const res = makeRes()
    await handler(makeReq({ ...baseReq }), res)

    expect(res.statusCode).toBe(201)
  })

  it('usa created_at como âncora do ciclo quando started_at é nulo', async () => {
    let countChain = null
    let apptCall = 0
    let asCall = 0
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'salon_clients') return makeChain({ is_active: true })
        if (table === 'services') return makeChain([{ id: 'svc1', name: 'Corte', duration_minutes: 60 }])
        if (table === 'client_subscriptions') {
          return makeChain([{ id: 'sub1', plan_id: 'plan1', started_at: null, created_at: createdAt }])
        }
        if (table === 'subscription_plan_days') return makeChain([])
        if (table === 'subscription_plan_services') {
          return makeChain([{ plan_id: 'plan1', service_id: 'svc1', monthly_quota: 2 }])
        }
        if (table === 'salons') return makeChain({ owner_id: 'owner1' })
        if (table === 'clients') return makeChain({ full_name: 'Cliente Teste' })
        if (table === 'notifications') return makeChain(null)
        if (table === 'appointment_services') {
          asCall++
          if (asCall === 1) return makeChain([]) // contagem via join — vazio
          return makeChain(null)
        }
        if (table === 'appointments') {
          apptCall++
          if (apptCall === 1) return makeChain([])
          if (apptCall === 2) { countChain = makeChain([]); return countChain }
          return makeChain({ id: 'new-appt', salon_id: 'salon1', service_id: 'svc1', professional_id: null, appointment_date: '2026-08-02', start_time: '10:00', end_time: '11:00', status: 'scheduled' })
        }
        return makeChain(null)
      },
    })

    const res = makeRes()
    await handler(makeReq({ ...baseReq }), res)

    const expected = expectedCycleWindow(createdAt)
    expect(countChain._gte).toEqual({ col: 'appointment_date', val: expected.start })
    expect(res.statusCode).toBe(201)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Regressão (2026-08-04): agendamento SEM profissional deve usar .is('professional_id', null)
// na checagem de conflito — NUNCA .eq('professional_id', null).
// O padrão bugado `.eq('professional_id', professional_id || null)` causou 500 em
// produção (2026-08-01), pois o PostgREST não trata .eq() com null como igualdade.
// Sem estes testes, reverter para o padrão bugado ainda passaria no CI.
// ──────────────────────────────────────────────────────────────────────────────

describe('create — sem profissional usa .is(professional_id, null), não .eq(professional_id, null)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('caminho COM profissional: checagem de conflito chama .eq("professional_id", "prof-1")', async () => {
    let conflictChain = null
    let apptCall = 0
    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'salon_clients') return makeChain({ is_active: true })
        if (table === 'services') return makeChain([{ id: 'svc1', name: 'Corte', duration_minutes: 60 }])
        if (table === 'client_subscriptions') return makeChain([]) // sem plano ativo
        if (table === 'salons') return makeChain({ owner_id: 'owner1' })
        if (table === 'clients') return makeChain({ full_name: 'Cliente Teste' })
        if (table === 'notifications') return makeChain(null)
        if (table === 'appointment_services') return makeChain(null)
        if (table === 'appointments') {
          apptCall++
          if (apptCall === 1) { conflictChain = makeChain([]); return conflictChain } // conflito — sem conflito
          return makeChain({ id: 'new-appt', salon_id: 'salon1', service_id: 'svc1', professional_id: 'prof-1', appointment_date: '2026-08-02', start_time: '10:00', end_time: '11:00', status: 'scheduled' })
        }
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'create',
      salon_id: 'salon1',
      client_id: 'client1',
      service_id: 'svc1',
      professional_id: 'prof-1',
      appointment_date: '2026-08-02',
      start_time: '10:00',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(201)
    expect(conflictChain.eq).toHaveBeenCalledWith('professional_id', 'prof-1')
    // com profissional, .is('professional_id', ...) não deve ser usado
    expect(conflictChain.is).not.toHaveBeenCalledWith('professional_id', null)
  })

  it('caminho SEM profissional: checagem de conflito chama .is("professional_id", null) e NUNCA .eq com null', async () => {
    let conflictChain = null
    let apptCall = 0
    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'salon_clients') return makeChain({ is_active: true })
        if (table === 'services') return makeChain([{ id: 'svc1', name: 'Corte', duration_minutes: 60 }])
        if (table === 'client_subscriptions') return makeChain([]) // sem plano ativo
        if (table === 'salons') return makeChain({ owner_id: 'owner1' })
        if (table === 'clients') return makeChain({ full_name: 'Cliente Teste' })
        if (table === 'notifications') return makeChain(null)
        if (table === 'appointment_services') return makeChain(null)
        if (table === 'appointments') {
          apptCall++
          if (apptCall === 1) { conflictChain = makeChain([]); return conflictChain } // conflito — sem conflito
          return makeChain({ id: 'new-appt', salon_id: 'salon1', service_id: 'svc1', professional_id: null, appointment_date: '2026-08-02', start_time: '10:00', end_time: '11:00', status: 'scheduled' })
        }
        return makeChain(null)
      },
    })

    // professional_id ausente do payload
    const req = makeReq({
      action: 'create',
      salon_id: 'salon1',
      client_id: 'client1',
      service_id: 'svc1',
      appointment_date: '2026-08-02',
      start_time: '10:00',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(201)
    // Blindagem contra a regressão .eq(null):
    expect(conflictChain.is).toHaveBeenCalledWith('professional_id', null)
    expect(conflictChain.eq).not.toHaveBeenCalledWith('professional_id', null)
  })
})

describe('reschedule — sem profissional usa .is(professional_id, null), não .eq(professional_id, null)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('agendamento sem profissional: checagem de conflito chama .is("professional_id", null) e NUNCA .eq com null', async () => {
    let conflictChain = null
    let appointmentsCallCount = 0
    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'appointments') {
          appointmentsCallCount++
          if (appointmentsCallCount === 1) {
            // Lookup do agendamento sendo reagendado — sem profissional
            return makeChain({ id: 'appt-123', client_id: 'client1', salon_id: 'salon1', service_id: 'svc1', professional_id: null })
          }
          // Conflict check — retorna conflito para encerrar em 409;
          // .is/.eq já foram registrados na construção da query.
          conflictChain = makeChain([{ id: 'other-appt', start_time: '10:30', end_time: '11:30' }])
          return conflictChain
        }
        if (table === 'salons') return makeChain({ owner_id: 'owner1' })
        if (table === 'appointment_services') return makeChain([{ services: { duration_minutes: 60 } }])
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'reschedule',
      appointment_id: 'appt-123',
      client_id: 'client1',
      appointment_date: '2026-08-02',
      start_time: '10:00',
      end_time: '11:00',
    })
    const res = makeRes()
    await handler(req, res)

    expect(conflictChain.is).toHaveBeenCalledWith('professional_id', null)
    expect(conflictChain.eq).not.toHaveBeenCalledWith('professional_id', null)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// cancel_subscription — escopo multi-tenant por salon_id (client_id é global)
// ──────────────────────────────────────────────────────────────────────────────

describe('cancel_subscription — exige salon_id e valida que a assinatura pertence ao salão', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejeita com 400 quando salon_id não é enviado', async () => {
    vi.mocked(createClient).mockReturnValue({ from: () => makeChain(null) })

    const req = makeReq({
      action: 'cancel_subscription',
      subscription_id: 'sub1',
      client_id: 'client1',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('salon_id is required')
  })

  it('rejeita com 403 quando a assinatura pertence a OUTRO salão', async () => {
    // Assinatura do mesmo client_id, mas salon_id diferente do enviado.
    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'client_subscriptions') {
          return makeChain({ id: 'sub1', salon_id: 'salon-OUTRO', client_id: 'client1', status: 'active' })
        }
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'cancel_subscription',
      subscription_id: 'sub1',
      client_id: 'client1',
      salon_id: 'salon1',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Acesso negado')
  })

  it('cancela com 200 quando client_id e salon_id batem', async () => {
    // Lookup usa .maybeSingle() (assinatura ativa, salão correto);
    // o update usa .single() (registro já cancelado).
    const updated = { id: 'sub1', salon_id: 'salon1', plan_id: 'plan1', client_id: 'client1', status: 'canceled', started_at: null, canceled_at: '2026-08-01T00:00:00Z', canceled_by: 'client' }
    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'client_subscriptions') {
          const chain = makeChain(null)
          chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'sub1', salon_id: 'salon1', client_id: 'client1', status: 'active' }, error: null })
          chain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
          return chain
        }
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'cancel_subscription',
      subscription_id: 'sub1',
      client_id: 'client1',
      salon_id: 'salon1',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.subscription.status).toBe('canceled')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Regressão: list_by_client deve incluir salons no select
// (bug: appt.salons era undefined, causando crash na Agenda do cliente)
// ──────────────────────────────────────────────────────────────────────────────
describe('list_by_client — retorna campo salons para evitar crash na Agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('responde 200 com appointments contendo o objeto salons', async () => {
    const appointmentWithSalon = {
      id: 'appt-1',
      salon_id: 'salon1',
      appointment_date: '2026-08-10',
      start_time: '10:00:00',
      end_time: '11:00:00',
      status: 'scheduled',
      services: { id: 'svc1', name: 'Corte', duration_minutes: 60, price: 50 },
      professionals: { id: 'pro1', name: 'João' },
      appointment_services: [],
      salons: { id: 'salon1', name: 'Salão Teste', logo_url: null, address: 'Rua X, 10' },
    }

    const linkChain = makeChain({ is_active: true })
    const appointmentsChain = makeChain([appointmentWithSalon])

    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'salon_clients') return linkChain
        if (table === 'appointments') return appointmentsChain
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'list_by_client',
      salon_id: 'salon1',
      client_id: 'client1',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.appointments).toHaveLength(1)
    // garante que salons está presente — sem ele a UI lança TypeError
    expect(res.body.appointments[0].salons).toBeDefined()
    expect(res.body.appointments[0].salons.name).toBe('Salão Teste')
    expect(res.body.appointments[0].salons.address).toBe('Rua X, 10')
  })

  it('inclui salons no .select() — chamada Supabase contém "salons("', async () => {
    const linkChain = makeChain({ is_active: true })
    const appointmentsChain = makeChain([])

    vi.mocked(createClient).mockReturnValue({
      from: (table) => {
        if (table === 'salon_clients') return linkChain
        if (table === 'appointments') return appointmentsChain
        return makeChain(null)
      },
    })

    const req = makeReq({
      action: 'list_by_client',
      salon_id: 'salon1',
      client_id: 'client1',
    })
    const res = makeRes()
    await handler(req, res)

    // verifica que select foi chamado com o join de salons
    const selectCall = appointmentsChain.select.mock.calls[0]?.[0] ?? ''
    expect(selectCall).toContain('salons(')
  })
})
