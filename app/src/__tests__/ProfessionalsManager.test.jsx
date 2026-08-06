import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

// --- Mocks ---
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

// .eq() é encadeável (2 filtros: id + salon_id) e também é "thenable" ao resolver
const updateEqSalon = vi.fn().mockResolvedValue({ error: null })
const updateEq = vi.fn(() => ({ eq: updateEqSalon }))
const update = vi.fn(() => ({ eq: updateEq }))
const insert = vi.fn().mockResolvedValue({ error: null })
const deleteEqSalon = vi.fn().mockResolvedValue({ error: null })
const deleteEq = vi.fn(() => ({ eq: deleteEqSalon }))
const del = vi.fn(() => ({ eq: deleteEq }))

const professionalsData = [
  { id: 'p1', name: 'João Silva', is_active: true },
  { id: 'p2', name: 'Maria Souza', is_active: true },
]

const order = vi.fn().mockResolvedValue({ data: professionalsData, error: null })
const selectEq = vi.fn(() => ({ order }))
const select = vi.fn(() => ({ eq: selectEq }))

const from = vi.fn(() => ({ select, insert, update, delete: del }))

vi.mock('../supabase', () => ({
  supabase: {
    from: (...args) => from(...args),
  },
}))

import ProfessionalsManager from '../pages/owner/ProfessionalsManager'

const renderPage = (salon = { id: 'salon-1' }) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ salon }} />}>
          <Route index element={<ProfessionalsManager />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )

describe('ProfessionalsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.mockResolvedValue({ data: professionalsData, error: null })
    updateEqSalon.mockResolvedValue({ error: null })
    insert.mockResolvedValue({ error: null })
  })

  it('abre o modal ao clicar em "Novo Profissional"', async () => {
    renderPage()
    await screen.findByText('João Silva')

    expect(screen.queryByText('Novo Profissional', { selector: '.modal-title' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Novo Profissional/i }))

    expect(await screen.findByText('Novo Profissional', { selector: '.modal-title' })).toBeInTheDocument()
  })

  it('abre o modal preenchido ao clicar em editar um item da lista', async () => {
    renderPage()
    await screen.findByText('João Silva')

    fireEvent.click(screen.getAllByTitle('Editar')[0])

    expect(await screen.findByText('Editar Profissional', { selector: '.modal-title' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex: João Silva').value).toBe('João Silva')
  })

  it('chama supabase update ao salvar em modo edição', async () => {
    renderPage()
    await screen.findByText('João Silva')

    fireEvent.click(screen.getAllByTitle('Editar')[0])
    await screen.findByText('Editar Profissional', { selector: '.modal-title' })

    fireEvent.click(screen.getByRole('button', { name: /Atualizar Profissional/i }))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ name: 'João Silva' })
      expect(updateEq).toHaveBeenCalledWith('id', 'p1')
      expect(updateEqSalon).toHaveBeenCalledWith('salon_id', 'salon-1')
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('chama supabase insert ao salvar em modo criação', async () => {
    renderPage()
    await screen.findByText('João Silva')

    fireEvent.click(screen.getByRole('button', { name: /Novo Profissional/i }))
    await screen.findByText('Novo Profissional', { selector: '.modal-title' })

    fireEvent.change(screen.getByPlaceholderText('Ex: João Silva'), {
      target: { value: 'Carlos Lima' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Adicionar Profissional/i }))

    await waitFor(() => {
      expect(insert).toHaveBeenCalledWith([
        { salon_id: 'salon-1', name: 'Carlos Lima', is_active: true },
      ])
    })
    expect(update).not.toHaveBeenCalled()
  })
})
