import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, Outlet, useOutletContext } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}))

import { supabase } from '../supabase'

function makeSingleChain(returnValue) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue(returnValue),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
}

function ParentWithContext({ salon, profile }) {
  return <Outlet context={{ salon, profile }} />
}

function ChildConsumer() {
  const ctx = useOutletContext()
  if (!ctx) return <div>no context</div>
  return (
    <div>
      <span data-testid="salon-name">{ctx.salon.name}</span>
      <span data-testid="profile-role">{ctx.profile.role}</span>
    </div>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('repassa o OutletContext do pai para a rota filha (fluxo client)', async () => {
    const salonFixture = { id: 'salon-1', name: 'Salão Teste' }
    const profileFixture = { id: 'user-1', role: 'client' }

    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })

    supabase.from.mockReturnValue(makeSingleChain({ data: { role: 'client' }, error: null }))

    render(
      <MemoryRouter initialEntries={['/s/abc/agenda']}>
        <Routes>
          <Route element={<ParentWithContext salon={salonFixture} profile={profileFixture} />}>
            <Route element={<ProtectedRoute requiredRole="client" />}>
              <Route path="/s/abc/agenda" element={<ChildConsumer />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    )

    const salonName = await screen.findByTestId('salon-name')
    const profileRole = await screen.findByTestId('profile-role')

    expect(salonName).toHaveTextContent('Salão Teste')
    expect(profileRole).toHaveTextContent('client')
  })

  it('renderiza children diretamente quando prop children é fornecida (fluxo owner/admin)', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'owner-1' } } },
      error: null,
    })

    supabase.from.mockReturnValue(makeSingleChain({ data: { role: 'owner' }, error: null }))

    render(
      <MemoryRouter initialEntries={['/painel']}>
        <Routes>
          <Route
            path="/painel"
            element={
              <ProtectedRoute requiredRole="owner">
                <div data-testid="owner-child">Painel do Dono</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByTestId('owner-child')
    expect(screen.getByTestId('owner-child')).toHaveTextContent('Painel do Dono')
  })

  it('sem sessão redireciona para /login e não exibe conteúdo protegido', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    render(
      <MemoryRouter initialEntries={['/painel']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login-screen">Login</div>} />
          <Route
            path="/painel"
            element={
              <ProtectedRoute requiredRole="owner">
                <div data-testid="protected-content">Conteúdo Protegido</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByTestId('login-screen')
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('role client acessando requiredRole owner é redirecionado para rota raiz', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-client' } } },
      error: null,
    })
    supabase.from.mockReturnValue(makeSingleChain({ data: { role: 'client' }, error: null }))

    render(
      <MemoryRouter initialEntries={['/painel']}>
        <Routes>
          <Route path="/" element={<div data-testid="fallback-root">Raiz</div>} />
          <Route
            path="/painel"
            element={
              <ProtectedRoute requiredRole="owner">
                <div data-testid="protected-content">Painel do Dono</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByTestId('fallback-root')
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('role owner acessando requiredRole client é redirecionado para rota raiz', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-owner' } } },
      error: null,
    })
    supabase.from.mockReturnValue(makeSingleChain({ data: { role: 'owner' }, error: null }))

    render(
      <MemoryRouter initialEntries={['/cliente']}>
        <Routes>
          <Route path="/" element={<div data-testid="fallback-root">Raiz</div>} />
          <Route
            path="/cliente"
            element={
              <ProtectedRoute requiredRole="client">
                <div data-testid="protected-content">Área do Cliente</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByTestId('fallback-root')
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })
})
