import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import ClientsManager, { filterClients } from '../pages/owner/ClientsManager'

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

// --- Testes de edição (render do componente) ---

const listData = [
  {
    id: 'sc1',
    created_at: '2020-01-01T00:00:00Z',
    is_active: true,
    clients: {
      id: 'c1',
      phone: '(11) 98888-7777',
      full_name: 'João Silva',
      birth_date: '1990-05-15',
    },
  },
]

const eq = vi.fn().mockResolvedValue({ data: listData, error: null })
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'token-123' } },
        error: null,
      }),
    },
    from: (...args) => from(...args),
  },
}))

const renderPage = (salon = { id: 'salon-1' }) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ salon }} />}>
          <Route index element={<ClientsManager />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )

describe('ClientsManager - edição de cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eq.mockResolvedValue({ data: listData, error: null })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ client: { id: 'c1' } }),
    })
  })

  it('exibe um botão "Editar" em cada linha de cliente', async () => {
    renderPage()
    await screen.findByText('João Silva')
    expect(screen.getByRole('button', { name: /^Editar$/i })).toBeInTheDocument()
  })

  it('abre modal pré-preenchido ao clicar em "Editar"', async () => {
    renderPage()
    await screen.findByText('João Silva')

    fireEvent.click(screen.getByRole('button', { name: /^Editar$/i }))

    expect(await screen.findByText('Editar Cliente', { selector: '.modal-title' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome completo').value).toBe('João Silva')
    expect(screen.getByLabelText('Telefone').value).toBe('(11) 98888-7777')
    // BirthdateInput pré-preenchido a partir de birth_date '1990-05-15'
    expect(screen.getByLabelText('Ano').value).toBe('1990')
  })

  it('submete update com client_id e campos editados (sem current_phone; autoriza via Bearer)', async () => {
    renderPage()
    await screen.findByText('João Silva')

    fireEvent.click(screen.getByRole('button', { name: /^Editar$/i }))
    await screen.findByText('Editar Cliente', { selector: '.modal-title' })

    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'João Souza' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/client-identity', expect.any(Object))
    })

    const options = global.fetch.mock.calls[0][1]
    const body = JSON.parse(options.body)
    expect(body.action).toBe('update')
    expect(body.client_id).toBe('c1')
    // current_phone é redundante quando há Authorization Bearer (servidor ignora) —
    // este caminho sempre tem sessão, então o campo não é mais enviado.
    expect(body.current_phone).toBeUndefined()
    expect(body.full_name).toBe('João Souza')
    // A edição do dono agora autoriza via JWT: o header Authorization deve ir junto.
    expect(options.headers.Authorization).toBe('Bearer token-123')
  })

  it('recarrega a lista e mostra feedback de sucesso após update ok', async () => {
    renderPage()
    await screen.findByText('João Silva')

    // 1 chamada inicial de loadClients (select.eq)
    expect(select).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /^Editar$/i }))
    await screen.findByText('Editar Cliente', { selector: '.modal-title' })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    await screen.findByText(/atualizados com sucesso/i)
    // loadClients chamado novamente => select ao menos 2x
    expect(select.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('exibe mensagem de erro quando o update falha (response não ok)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'conflito' }),
    })

    renderPage()
    await screen.findByText('João Silva')

    fireEvent.click(screen.getByRole('button', { name: /^Editar$/i }))
    await screen.findByText('Editar Cliente', { selector: '.modal-title' })
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }))

    expect(await screen.findByText(/já pertence a outro cliente/i)).toBeInTheDocument()
    // modal permanece aberto
    expect(screen.getByText('Editar Cliente', { selector: '.modal-title' })).toBeInTheDocument()
  })
})
