import { describe, it, expect } from 'vitest'
import { isAppointmentExpired, EXPIRY_GRACE_MS } from '../utils/appointmentExpiry'

// Monta um agendamento local a partir de um Date de início.
const makeAppt = (startDate, status = 'scheduled') => {
  const pad = (n) => String(n).padStart(2, '0')
  const appointment_date = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`
  const start_time = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}:${pad(startDate.getSeconds())}`
  return { appointment_date, start_time, status }
}

describe('isAppointmentExpired', () => {
  it('scheduled 20 min no passado → expirado', () => {
    const now = new Date('2026-08-07T12:00:00')
    const start = new Date(now.getTime() - 20 * 60 * 1000)
    expect(isAppointmentExpired(makeAppt(start), now)).toBe(true)
  })

  it('scheduled 10 min no passado → não expirado (dentro da tolerância)', () => {
    const now = new Date('2026-08-07T12:00:00')
    const start = new Date(now.getTime() - 10 * 60 * 1000)
    expect(isAppointmentExpired(makeAppt(start), now)).toBe(false)
  })

  it('scheduled no futuro → não expirado', () => {
    const now = new Date('2026-08-07T12:00:00')
    const start = new Date(now.getTime() + 60 * 60 * 1000)
    expect(isAppointmentExpired(makeAppt(start), now)).toBe(false)
  })

  it('completed no passado → não expirado', () => {
    const now = new Date('2026-08-07T12:00:00')
    const start = new Date(now.getTime() - 120 * 60 * 1000)
    expect(isAppointmentExpired(makeAppt(start, 'completed'), now)).toBe(false)
  })

  it('canceled no passado → não expirado', () => {
    const now = new Date('2026-08-07T12:00:00')
    const start = new Date(now.getTime() - 120 * 60 * 1000)
    expect(isAppointmentExpired(makeAppt(start, 'canceled'), now)).toBe(false)
  })

  it('exatamente no limite de 15 min → não expirado (usa estritamente maior)', () => {
    const now = new Date('2026-08-07T12:00:00')
    const start = new Date(now.getTime() - EXPIRY_GRACE_MS)
    expect(isAppointmentExpired(makeAppt(start), now)).toBe(false)
  })

  it('1 ms além do limite de 15 min → expirado', () => {
    const now = new Date('2026-08-07T12:00:00')
    const start = new Date(now.getTime() - EXPIRY_GRACE_MS - 1)
    expect(isAppointmentExpired(makeAppt(start), now)).toBe(true)
  })
})
