import React from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import App from '../App'

// Supabase usa fetch e WebSocket — mock completo para evitar chamadas reais
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}))

// OneSignal não existe no ambiente de teste
beforeAll(() => {
  window.OneSignalDeferred = []
})

describe('Smoke test — app monta sem erros', () => {
  it('renderiza sem lançar exceção', () => {
    expect(() => render(<App />)).not.toThrow()
  })

  it('produz ao menos um elemento no DOM', () => {
    const { container } = render(<App />)
    expect(container.firstChild).not.toBeNull()
  })
})
