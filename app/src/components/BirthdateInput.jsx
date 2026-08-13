import React, { useState, useEffect } from 'react'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

export function parseISODate(iso) {
  if (!iso || typeof iso !== 'string') return { day: '', month: '', year: '' }
  const parts = iso.split('-')
  if (parts.length !== 3) return { day: '', month: '', year: '' }
  const [y, m, d] = parts
  return {
    year: y || '',
    month: m ? String(parseInt(m, 10)) : '',
    day: d ? String(parseInt(d, 10)) : '',
  }
}

export function composeISODate({ day, month, year }) {
  if (!day || !month || !year) return ''
  const d = parseInt(day, 10)
  const m = parseInt(month, 10)
  const y = parseInt(year, 10)
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return ''
  const dd = String(d).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const yyyy = String(y)
  return `${yyyy}-${mm}-${dd}`
}

const MAX_YEAR = new Date().getFullYear()

// ISO que o componente emitiria (via onChange) para um dado estado local,
// aplicando a regra incremental: '' quando o ano tem menos de 4 dígitos ou
// a data está incompleta; senão a ISO válida via composeISODate.
function emittedFor(fields) {
  const yearComplete = String(fields.year).length === 4
  return yearComplete ? composeISODate(fields) : ''
}

function BirthdateInput({ value, onChange }) {
  const [fields, setFields] = useState(() => parseISODate(value))

  // Ressincroniza o estado local a partir de `value` apenas quando `value`
  // divergir do que os campos LOCAIS atuais representam (`localEmitted`). Se
  // forem iguais, `value` é apenas o eco do nosso próprio onChange (ou um
  // reset para o mesmo estado incompleto que já mostramos) e não deve
  // sobrescrever a digitação parcial. Quando divergem — reset externo real
  // ('' vindo de campos completos) ou troca para outra ISO — ressincroniza.
  useEffect(() => {
    const incoming = value || ''
    const localEmitted = emittedFor(fields)
    if (incoming !== localEmitted) {
      setFields(parseISODate(incoming))
    }
    // Só reage a mudanças de `value`; `fields` é lido do render corrente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const { day, month, year } = fields

  const handleChange = (field, fieldValue) => {
    const next = {
      day: field === 'day' ? fieldValue : day,
      month: field === 'month' ? fieldValue : month,
      year: field === 'year' ? fieldValue : year,
    }
    // Estado local (o que aparece na tela) nunca é apagado por incompletude.
    setFields(next)

    // Só valida a faixa do ano quando ele tiver 4 dígitos, para não
    // penalizar a digitação incremental ("1" → "19" → "199" → "1990").
    onChange(emittedFor(next))
  }

  return (
    <div className="ds-field">
      <span className="ds-label">Data de nascimento</span>
      <div className="ds-birthdate-row">
        <select
          value={day}
          onChange={(e) => handleChange('day', e.target.value)}
          className="ds-select"
          aria-label="Dia"
        >
          <option value="">Dia</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={String(d)}>{d}</option>
          ))}
        </select>

        <select
          value={month}
          onChange={(e) => handleChange('month', e.target.value)}
          className="ds-select"
          aria-label="Mês"
        >
          <option value="">Mês</option>
          {MONTHS.map((name, i) => (
            <option key={i + 1} value={String(i + 1)}>{name}</option>
          ))}
        </select>

        <input
          type="number"
          inputMode="numeric"
          placeholder="Ano"
          min="1900"
          max={MAX_YEAR}
          value={year}
          onChange={(e) => handleChange('year', e.target.value)}
          className="ds-input ds-birthdate-year"
          aria-label="Ano"
        />
      </div>
    </div>
  )
}

export default BirthdateInput
