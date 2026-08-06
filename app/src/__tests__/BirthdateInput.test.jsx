import { describe, it, expect } from 'vitest'
import React, { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import BirthdateInput, { parseISODate, composeISODate } from '../components/BirthdateInput'

// Wrapper stateful que simula o pai controlado (value/onChange).
function ControlledWrapper({ initial = '', onChangeSpy }) {
  const [value, setValue] = useState(initial)
  return (
    <BirthdateInput
      value={value}
      onChange={(iso) => {
        if (onChangeSpy) onChangeSpy(iso)
        setValue(iso)
      }}
    />
  )
}

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

describe('BirthdateInput (componente)', () => {
  it('mantém cada dígito ao digitar o ano dígito a dígito (regressão do bug)', () => {
    render(<ControlledWrapper />)
    const yearInput = screen.getByLabelText('Ano')

    fireEvent.change(yearInput, { target: { value: '1' } })
    expect(yearInput.value).toBe('1')

    fireEvent.change(yearInput, { target: { value: '19' } })
    expect(yearInput.value).toBe('19')

    fireEvent.change(yearInput, { target: { value: '199' } })
    expect(yearInput.value).toBe('199')

    fireEvent.change(yearInput, { target: { value: '1990' } })
    expect(yearInput.value).toBe('1990')
  })

  it('chama onChange com ISO correta quando dia, mês e ano estão completos', () => {
    let lastIso
    render(<ControlledWrapper onChangeSpy={(iso) => { lastIso = iso }} />)

    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '1990' } })

    expect(lastIso).toBe('1990-03-05')
  })

  it('mantém o dígito do ano na tela e emite "" quando dia/mês estão vazios', () => {
    let lastIso
    render(<ControlledWrapper onChangeSpy={(iso) => { lastIso = iso }} />)
    const yearInput = screen.getByLabelText('Ano')

    fireEvent.change(yearInput, { target: { value: '1990' } })

    expect(yearInput.value).toBe('1990')
    expect(lastIso).toBe('')
  })

  it('reflete nos três campos quando a prop value muda externamente', () => {
    const { rerender } = render(<BirthdateInput value="" onChange={() => {}} />)

    rerender(<BirthdateInput value="1985-07-20" onChange={() => {}} />)

    expect(screen.getByLabelText('Dia').value).toBe('20')
    expect(screen.getByLabelText('Mês').value).toBe('7')
    expect(screen.getByLabelText('Ano').value).toBe('1985')
  })

  // Caso 1 + reset: digitar ano parcial (sem dia/mês) preserva os dígitos
  // mesmo quando o pai reenvia value='' (eco do onChange('')). É o cenário
  // que a heurística antiga (lastEmittedRef) quebrava no reset.
  it('preserva o ano parcial quando o pai reenvia value="" (eco do reset)', () => {
    render(<ControlledWrapper />)
    const yearInput = screen.getByLabelText('Ano')

    fireEvent.change(yearInput, { target: { value: '1' } })
    fireEvent.change(yearInput, { target: { value: '19' } })
    fireEvent.change(yearInput, { target: { value: '199' } })
    fireEvent.change(yearInput, { target: { value: '1990' } })

    // Todos emitiram '' (dia/mês vazios) e o pai ecoou value='';
    // os dígitos digitados devem permanecer na tela.
    expect(yearInput.value).toBe('1990')
  })

  // Caso 2 (crítico): data completa via prop, usuário apaga um dígito do ano
  // tornando-a incompleta → emite '' → o eco de value='' NÃO deve limpar
  // dia/mês nem apagar o ano parcial.
  it('não limpa dia/mês nem o ano parcial ao tornar incompleta uma data que veio completa', () => {
    function Wrapper() {
      const [value, setValue] = useState('1990-03-05')
      return <BirthdateInput value={value} onChange={setValue} />
    }
    render(<Wrapper />)

    const dayInput = screen.getByLabelText('Dia')
    const monthInput = screen.getByLabelText('Mês')
    const yearInput = screen.getByLabelText('Ano')

    expect(dayInput.value).toBe('5')
    expect(monthInput.value).toBe('3')
    expect(yearInput.value).toBe('1990')

    // Usuário apaga um dígito do ano: '1990' → '199'
    fireEvent.change(yearInput, { target: { value: '199' } })

    expect(yearInput.value).toBe('199')
    expect(dayInput.value).toBe('5')
    expect(monthInput.value).toBe('3')
  })

  // Caso 3: reset externo real — campos completos e o pai força value=''.
  it('limpa os três campos quando o pai reseta value="" a partir de uma data completa', () => {
    const { rerender } = render(<BirthdateInput value="1990-03-05" onChange={() => {}} />)

    expect(screen.getByLabelText('Ano').value).toBe('1990')

    rerender(<BirthdateInput value="" onChange={() => {}} />)

    expect(screen.getByLabelText('Dia').value).toBe('')
    expect(screen.getByLabelText('Mês').value).toBe('')
    expect(screen.getByLabelText('Ano').value).toBe('')
  })

  // Caso 4: value externo muda de uma ISO válida para outra ISO válida.
  it('reflete a nova data quando value muda de uma ISO válida para outra', () => {
    const { rerender } = render(<BirthdateInput value="1990-03-05" onChange={() => {}} />)

    rerender(<BirthdateInput value="2001-11-22" onChange={() => {}} />)

    expect(screen.getByLabelText('Dia').value).toBe('22')
    expect(screen.getByLabelText('Mês').value).toBe('11')
    expect(screen.getByLabelText('Ano').value).toBe('2001')
  })
})
