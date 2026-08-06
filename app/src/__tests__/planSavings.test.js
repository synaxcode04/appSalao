import { describe, it, expect } from 'vitest'
import { computePlanSavings } from '../utils/planSavings'

describe('computePlanSavings', () => {
  it('calcula economia positiva corretamente', () => {
    const result = computePlanSavings({
      price: 80,
      services: [{ monthly_quota: 2, price: 50 }],
    })
    expect(result.fullValue).toBe(100)
    expect(result.planPrice).toBe(80)
    expect(result.savings).toBe(20)
    expect(result.savingsPct).toBe(20)
  })

  it('retorna savings 0 quando fullValue igual ao planPrice', () => {
    const result = computePlanSavings({
      price: 100,
      services: [{ monthly_quota: 2, price: 50 }],
    })
    expect(result.savings).toBe(0)
    expect(result.savingsPct).toBe(0)
  })

  it('clamps savings a 0 quando planPrice maior que fullValue', () => {
    const result = computePlanSavings({
      price: 150,
      services: [{ monthly_quota: 2, price: 50 }],
    })
    expect(result.savings).toBe(0)
    expect(result.savingsPct).toBe(0)
  })

  it('aceita preço em string', () => {
    const result = computePlanSavings({
      price: '80',
      services: [{ monthly_quota: 2, price: '50' }],
    })
    expect(result.fullValue).toBe(100)
    expect(result.planPrice).toBe(80)
    expect(result.savings).toBe(20)
  })

  it('ignora serviço com price null', () => {
    const result = computePlanSavings({
      price: 80,
      services: [
        { monthly_quota: 2, price: null },
        { monthly_quota: 1, price: 50 },
      ],
    })
    expect(result.fullValue).toBe(50)
    expect(result.savings).toBe(0)
  })

  it('ignora serviço com price undefined', () => {
    const result = computePlanSavings({
      price: 30,
      services: [
        { monthly_quota: 3, price: undefined },
        { monthly_quota: 2, price: 20 },
      ],
    })
    expect(result.fullValue).toBe(40)
    expect(result.savings).toBe(10)
  })

  it('ignora serviço com price NaN', () => {
    const result = computePlanSavings({
      price: 0,
      services: [{ monthly_quota: 2, price: NaN }],
    })
    expect(result.fullValue).toBe(0)
    expect(result.savings).toBe(0)
    expect(result.savingsPct).toBe(0)
  })

  it('lista de serviços vazia retorna fullValue 0 savings 0 pct 0', () => {
    const result = computePlanSavings({ price: 50, services: [] })
    expect(result.fullValue).toBe(0)
    expect(result.savings).toBe(0)
    expect(result.savingsPct).toBe(0)
  })

  it('trata quota ausente como 0', () => {
    const result = computePlanSavings({
      price: 0,
      services: [{ price: 50 }],
    })
    expect(result.fullValue).toBe(0)
  })
})
