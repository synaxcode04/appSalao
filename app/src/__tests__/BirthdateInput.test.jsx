import { describe, it, expect } from 'vitest'
import { parseISODate, composeISODate } from '../components/BirthdateInput'

describe('composeISODate', () => {
  it('retorna YYYY-MM-DD com zero-padding para dia e mês de um dígito', () => {
    expect(composeISODate({ day: '5', month: '3', year: '1990' })).toBe('1990-03-05')
  })

  it('retorna string vazia quando falta o ano', () => {
    expect(composeISODate({ day: '5', month: '3', year: '' })).toBe('')
  })

  it('retorna string vazia quando falta o dia', () => {
    expect(composeISODate({ day: '', month: '3', year: '1990' })).toBe('')
  })

  it('retorna string vazia quando falta o mês', () => {
    expect(composeISODate({ day: '5', month: '', year: '1990' })).toBe('')
  })

  it('aplica zero-padding no mês e dia com dois dígitos corretamente', () => {
    expect(composeISODate({ day: '31', month: '12', year: '2000' })).toBe('2000-12-31')
  })

  it('retorna string vazia para mês > 12', () => {
    expect(composeISODate({ day: '1', month: '13', year: '2000' })).toBe('')
  })

  it('retorna string vazia para dia > 31', () => {
    expect(composeISODate({ day: '32', month: '1', year: '2000' })).toBe('')
  })

  it('retorna string vazia para ano < 1900', () => {
    expect(composeISODate({ day: '1', month: '1', year: '1899' })).toBe('')
  })
})

describe('parseISODate', () => {
  it('faz parse de 1990-03-05 retornando day, month e year sem zeros à esquerda', () => {
    const result = parseISODate('1990-03-05')
    expect(result.day).toBe('5')
    expect(result.month).toBe('3')
    expect(result.year).toBe('1990')
  })

  it('retorna campos vazios para string vazia', () => {
    const result = parseISODate('')
    expect(result.day).toBe('')
    expect(result.month).toBe('')
    expect(result.year).toBe('')
  })

  it('retorna campos vazios para valor undefined', () => {
    const result = parseISODate(undefined)
    expect(result.day).toBe('')
    expect(result.month).toBe('')
    expect(result.year).toBe('')
  })
})

describe('round-trip parse → compose', () => {
  it('preserva a data original após parse e compose', () => {
    const iso = '1985-07-20'
    expect(composeISODate(parseISODate(iso))).toBe(iso)
  })

  it('preserva data com dia e mês de um dígito', () => {
    const iso = '2001-01-09'
    expect(composeISODate(parseISODate(iso))).toBe(iso)
  })
})
