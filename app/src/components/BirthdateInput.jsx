import React from 'react'

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

function BirthdateInput({ value, onChange }) {
  const { day, month, year } = parseISODate(value)

  const handleChange = (field, fieldValue) => {
    const next = {
      day: field === 'day' ? fieldValue : day,
      month: field === 'month' ? fieldValue : month,
      year: field === 'year' ? fieldValue : year,
    }
    onChange(composeISODate(next))
  }

  return (
    <div className="birthdate-input">
      <select
        value={day}
        onChange={(e) => handleChange('day', e.target.value)}
        className="birthdate-select"
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
        className="birthdate-select"
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
        className="birthdate-year"
        aria-label="Ano"
      />
    </div>
  )
}

export default BirthdateInput
