import { describe, it, expect } from 'vitest'
import { computeStats } from '../pages/owner/DashboardHome'

const TODAY = '2026-08-01'

describe('computeStats — receita de agendamentos multi-serviço', () => {
  it('agendamento com appointment_services soma preços de todos os serviços (não apenas o primário)', () => {
    const appointments = [
      {
        appointment_date: TODAY,
        status: 'completed',
        services: { price: 50 },
        appointment_services: [
          { services: { price: 50 } },
          { services: { price: 80 } },
        ],
      },
    ]
    const stats = computeStats(appointments, TODAY)
    expect(stats.realRevenue).toBe(130)
    expect(stats.estimatedRevenue).toBe(130)
  })

  it('agendamento single-service sem appointment_services usa services.price (retrocompatibilidade)', () => {
    const appointments = [
      {
        appointment_date: TODAY,
        status: 'scheduled',
        services: { price: 75 },
        appointment_services: [],
      },
    ]
    const stats = computeStats(appointments, TODAY)
    expect(stats.estimatedRevenue).toBe(75)
    expect(stats.realRevenue).toBe(0)
  })

  it('appointment_services vazio (null) faz fallback para services.price', () => {
    const appointments = [
      {
        appointment_date: TODAY,
        status: 'completed',
        services: { price: 60 },
        appointment_services: null,
      },
    ]
    const stats = computeStats(appointments, TODAY)
    expect(stats.realRevenue).toBe(60)
  })

  it('mix de hoje (completed e scheduled) e futuros calcula todas as receitas', () => {
    const appointments = [
      {
        appointment_date: TODAY,
        status: 'completed',
        services: { price: 50 },
        appointment_services: [{ services: { price: 50 } }, { services: { price: 30 } }],
      },
      {
        appointment_date: TODAY,
        status: 'scheduled',
        services: { price: 40 },
        appointment_services: [{ services: { price: 40 } }, { services: { price: 20 } }],
      },
      {
        appointment_date: '2026-08-05',
        status: 'scheduled',
        services: { price: 100 },
        appointment_services: [{ services: { price: 100 } }, { services: { price: 50 } }],
      },
    ]
    const stats = computeStats(appointments, TODAY)
    // realRevenue: apenas completed de hoje → 50+30 = 80
    expect(stats.realRevenue).toBe(80)
    // estimatedRevenue: todos de hoje → (50+30) + (40+20) = 140
    expect(stats.estimatedRevenue).toBe(140)
    // upcomingRevenue: agendamento futuro → 100+50 = 150
    expect(stats.upcomingRevenue).toBe(150)
    expect(stats.upcoming).toBe(1)
    expect(stats.todayCount).toBe(2)
  })
})
