import { describe, it, expect } from 'vitest'
import { filterClients } from '../pages/owner/ClientsManager'

const clients = [
  { id: '1', clients: { full_name: 'João Silva', phone: '(11) 98888-7777' } },
  { id: '2', clients: { full_name: 'María José', phone: '(21) 97777-1234' } },
  { id: '3', clients: { full_name: 'Ana', phone: null } },
  { id: '4', clients: { full_name: null, phone: '11933334444' } },
]

describe('filterClients', () => {
  it('retorna o array inteiro quando a query é vazia', () => {
    expect(filterClients(clients, '')).toEqual(clients)
    expect(filterClients(clients, '   ')).toEqual(clients)
  })

  it('filtra por trecho do nome de forma case-insensível', () => {
    const result = filterClients(clients, 'joão')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filtra por nome de forma acento-insensível', () => {
    const result = filterClients(clients, 'maria jose')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filtra por dígitos do telefone ignorando formatação', () => {
    const result = filterClients(clients, '98888')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('casa por nome OU por telefone', () => {
    const result = filterClients(clients, 'ana')
    expect(result.map((r) => r.id)).toContain('3')
  })

  it('tolera full_name e phone nulos sem quebrar', () => {
    expect(() => filterClients(clients, 'xyz')).not.toThrow()
    const byPhone = filterClients(clients, '3333')
    expect(byPhone.map((r) => r.id)).toContain('4')
  })

  it('retorna vazio quando nada casa', () => {
    expect(filterClients(clients, 'zzzzz')).toEqual([])
  })

  it('tolera lista nula/undefined', () => {
    expect(filterClients(null, 'abc')).toEqual([])
    expect(filterClients(undefined, '')).toEqual([])
  })
})
