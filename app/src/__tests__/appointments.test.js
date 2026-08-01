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
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
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
