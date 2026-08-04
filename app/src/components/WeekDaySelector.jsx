import React from 'react'

const WEEK_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Converte 'YYYY-MM-DD' -> Date local (00:00) sem deslocamento de fuso.
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Date local -> 'YYYY-MM-DD'
function toDateStr(dateObj) {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Tira horizontal com os 7 dias da semana corrente (Dom a Sáb) do dia selecionado.
function WeekDaySelector({ selectedDate, onSelectDay }) {
  const base = parseLocalDate(selectedDate)
  const todayStr = toDateStr(new Date())

  // Domingo da semana do dia selecionado.
  const sunday = new Date(base)
  sunday.setDate(base.getDate() - base.getDay())

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })

  const monthLabel = MONTH_LABELS[base.getMonth()]

  const goWeek = (delta) => {
    const d = new Date(base)
    d.setDate(base.getDate() + delta * 7)
    onSelectDay(toDateStr(d))
  }

  return (
    <div className="week-selector">
      <div className="week-selector-head">
        <button type="button" className="week-nav-btn" onClick={() => goWeek(-1)} aria-label="Semana anterior">‹</button>
        <span className="week-selector-month">{monthLabel} {base.getFullYear()}</span>
        <button type="button" className="week-nav-btn" onClick={() => goWeek(1)} aria-label="Próxima semana">›</button>
      </div>
      <div className="week-days">
        {days.map(d => {
          const dateStr = toDateStr(d)
          const isActive = dateStr === selectedDate
          const isToday = dateStr === todayStr
          return (
            <button
              key={dateStr}
              type="button"
              className={`week-day${isActive ? ' active' : ''}${isToday ? ' today' : ''}`}
              onClick={() => onSelectDay(dateStr)}
            >
              <span className="week-day-label">{WEEK_DAY_LABELS[d.getDay()]}</span>
              <span className="week-day-num">{d.getDate()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default WeekDaySelector
