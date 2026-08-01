import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SuspendedScreen from '../components/SuspendedScreen'

describe('SuspendedScreen', () => {
  it('variant owner exibe "Acesso Suspenso" e botão "Falar com o Suporte"', () => {
    render(<SuspendedScreen variant="owner" />)
    expect(screen.getByText('Acesso Suspenso')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Falar com o Suporte' })).toBeInTheDocument()
  })

  it('variant public exibe "Página Indisponível" sem botão de suporte', () => {
    render(<SuspendedScreen variant="public" />)
    expect(screen.getByText('Página Indisponível')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
