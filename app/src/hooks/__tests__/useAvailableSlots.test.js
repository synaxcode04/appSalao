import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useAvailableSlots from '../useAvailableSlots'
import { computeAvailableSlots } from '../../utils/slotUtils'

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}))

import { supabase } from '../../supabase'

const workingHoursData = {
  start_time: '08:00:00',
  end_time: '18:00:00',
  break_start_time: null,
  break_end_time: null,
}

const futureDate = '2099-12-31'
const pastNow = new Date('2099-01-01T00:00:00')

// Referências estáveis para arrays — evitam re-render infinito no renderHook
// (uma nova instância de [] em cada render faria o useEffect disparar em loop).
const NO_PROFESSIONALS = []
const ONE_PROFESSIONAL = [{ id: 'p1', name: 'Ana' }]

function makeChain(resolveValue, resolveError = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolveValue, error: resolveError }),
    then: (resolve) => resolve({ data: resolveValue, error: resolveError }),
  }
}

describe('useAvailableSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna lista vazia quando selectedDate não está definido', () => {
    const { result } = renderHook(() =>
      useAvailableSlots({
        salonId: 'salon1',
        selectedDate: '',
        selectedProfessional: '',
        professionals: NO_PROFESSIONALS,
        totalDurationMinutes: 60,
        slotIntervalMinutes: null,
        existingAppointmentId: null,
      })
    )

    expect(result.current.availableSlots).toEqual([])
  })

  it('retorna lista vazia quando totalDurationMinutes é 0', () => {
    const { result } = renderHook(() =>
      useAvailableSlots({
        salonId: 'salon1',
        selectedDate: futureDate,
        selectedProfessional: '',
        professionals: NO_PROFESSIONALS,
        totalDurationMinutes: 0,
        slotIntervalMinutes: null,
        existingAppointmentId: null,
      })
    )

    expect(result.current.availableSlots).toEqual([])
  })

  it('retorna lista vazia quando há profissionais mas nenhum selecionado', () => {
    const { result } = renderHook(() =>
      useAvailableSlots({
        salonId: 'salon1',
        selectedDate: futureDate,
        selectedProfessional: '',
        professionals: ONE_PROFESSIONAL,
        totalDurationMinutes: 60,
        slotIntervalMinutes: null,
        existingAppointmentId: null,
      })
    )

    expect(result.current.availableSlots).toEqual([])
  })

  it('retorna os mesmos slots que computeAvailableSlots calcularia diretamente — extração não muda o resultado', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })

    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [] }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    const { result } = renderHook(() =>
      useAvailableSlots({
        salonId: 'salon1',
        selectedDate: futureDate,
        selectedProfessional: '',
        professionals: NO_PROFESSIONALS,
        totalDurationMinutes: 60,
        slotIntervalMinutes: null,
        existingAppointmentId: null,
      })
    )

    await waitFor(() => {
      expect(result.current.availableSlots.length).toBeGreaterThan(0)
    })

    const expected = computeAvailableSlots({
      workingHours: workingHoursData,
      appointments: [],
      timeBlocks: [],
      totalDurationMinutes: 60,
      slotIntervalMinutes: null,
      selectedDate: futureDate,
      now: pastNow,
    })

    expect(result.current.availableSlots).toEqual(expected)
  })

  it('appointment scheduled bloqueia slot — hook aplica filtro de conflito corretamente', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })

    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.action === 'list_scheduled') {
        return { ok: true, json: async () => ({ appointments: [{ start_time: '10:00:00', end_time: '11:00:00' }] }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    const { result } = renderHook(() =>
      useAvailableSlots({
        salonId: 'salon1',
        selectedDate: futureDate,
        selectedProfessional: '',
        professionals: NO_PROFESSIONALS,
        totalDurationMinutes: 60,
        slotIntervalMinutes: null,
        existingAppointmentId: null,
      })
    )

    await waitFor(() => {
      expect(result.current.availableSlots.length).toBeGreaterThan(0)
    })

    expect(result.current.availableSlots).not.toContain('10:00')
    expect(result.current.availableSlots).toContain('09:00')
    expect(result.current.availableSlots).toContain('11:00')
  })

  it('working_hours ausente (dia sem expediente) — hook retorna lista vazia', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(null, null)
      return makeChain(null)
    })

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ appointments: [] }) })

    const { result } = renderHook(() =>
      useAvailableSlots({
        salonId: 'salon1',
        selectedDate: futureDate,
        selectedProfessional: '',
        professionals: NO_PROFESSIONALS,
        totalDurationMinutes: 60,
        slotIntervalMinutes: null,
        existingAppointmentId: null,
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.availableSlots).toEqual([])
  })

  it('existingAppointmentId é incluído no payload como exclude_id', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'working_hours') return makeChain(workingHoursData)
      return makeChain(null)
    })

    let capturedBody = null
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      capturedBody = body
      return { ok: true, json: async () => ({ appointments: [] }) }
    })

    const { result } = renderHook(() =>
      useAvailableSlots({
        salonId: 'salon1',
        selectedDate: futureDate,
        selectedProfessional: '',
        professionals: NO_PROFESSIONALS,
        totalDurationMinutes: 60,
        slotIntervalMinutes: null,
        existingAppointmentId: 'appt-42',
      })
    )

    await waitFor(() => {
      expect(result.current.availableSlots.length).toBeGreaterThan(0)
    })

    expect(capturedBody.exclude_id).toBe('appt-42')
  })
})
