import { describe, it, expect } from 'vitest'
import { getAppointmentServices, getAppointmentTotal, formatBRL } from '../utils/appointmentServices'

describe('getAppointmentServices', () => {
  it('lista todos os serviços a partir do array appointment_services (2+ serviços)', () => {
    const appt = {
      services: { id: 1, name: 'Barba', price: 40 },
      appointment_services: [
        { service_id: 1, services: { id: 1, name: 'Barba', price: 40 } },
        { service_id: 2, services: { id: 2, name: 'Corte de Cabelo', price: 50 } },
      ],
    }
    const list = getAppointmentServices(appt)
    expect(list).toHaveLength(2)
    expect(list.map((s) => s.name)).toEqual(['Barba', 'Corte de Cabelo'])
    expect(list.map((s) => s.price)).toEqual([40, 50])
  })

  it('cai no serviço singular quando appointment_services está ausente (legado)', () => {
    const appt = { services: { id: 7, name: 'Manicure', price: 30 } }
    const list = getAppointmentServices(appt)
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ id: 7, name: 'Manicure', price: 30 })
  })

  it('cai no serviço singular quando appointment_services está vazio', () => {
    const appt = { services: { id: 7, name: 'Manicure', price: 30 }, appointment_services: [] }
    expect(getAppointmentServices(appt)).toHaveLength(1)
  })

  it('retorna lista vazia quando não há nenhum serviço', () => {
    expect(getAppointmentServices({})).toEqual([])
    expect(getAppointmentServices(null)).toEqual([])
  })
})

describe('getAppointmentTotal', () => {
  it('soma os preços de todos os serviços do array', () => {
    const appt = {
      appointment_services: [
        { services: { id: 1, name: 'Barba', price: 40 } },
        { services: { id: 2, name: 'Corte de Cabelo', price: 50 } },
      ],
    }
    expect(getAppointmentTotal(appt)).toBe(90)
  })

  it('total do agendamento legado é o preço do serviço único', () => {
    expect(getAppointmentTotal({ services: { id: 7, name: 'Manicure', price: 30 } })).toBe(30)
  })

  it('lida com preços vindos como string', () => {
    const appt = {
      appointment_services: [
        { services: { id: 1, name: 'Barba', price: '40.00' } },
        { services: { id: 2, name: 'Corte', price: '50.50' } },
      ],
    }
    expect(getAppointmentTotal(appt)).toBe(90.5)
  })
})

describe('formatBRL', () => {
  it('formata em reais com vírgula decimal', () => {
    expect(formatBRL(40)).toBe('R$ 40,00')
    expect(formatBRL(90.5)).toBe('R$ 90,50')
    expect(formatBRL(0)).toBe('R$ 0,00')
    expect(formatBRL(undefined)).toBe('R$ 0,00')
  })
})
