import React, { useRef } from 'react'

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

  // Troca de mês mantendo o dia (com clamp para o último dia do mês de destino).
  const goMonth = (delta) => {
    const day = base.getDate()
    const targetMonthFirst = new Date(base.getFullYear(), base.getMonth() + delta, 1)
    const lastDay = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth() + 1, 0).getDate()
    const d = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth(), Math.min(day, lastDay))
    onSelectDay(toDateStr(d))
  }

  // Swipe horizontal (mobile) sobre a tira de dias para navegar semanas.
  const touchStartX = useRef(null)
  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].clientX
  }
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const THRESHOLD = 40
    if (deltaX <= -THRESHOLD) goWeek(1)
    else if (deltaX >= THRESHOLD) goWeek(-1)
    touchStartX.current = null
  }

  return (
    <div className="week-selector">
      <div className="week-selector-head">
        <button type="button" className="week-nav-btn" onClick={() => goMonth(-1)} aria-label="Mês anterior">‹</button>
        <span className="week-selector-month">{monthLabel} {base.getFullYear()}</span>
        <button type="button" className="week-nav-btn" onClick={() => goMonth(1)} aria-label="Próximo mês">›</button>
      </div>
      <div className="week-days-wrap">
        {/* Setas discretas de navegação de semana — sempre visíveis (inclusive mobile),
            como affordance; o swipe touch sobre a tira continua funcionando em paralelo. */}
        <button type="button" className="week-days-nav" onClick={() => goWeek(-1)} aria-label="Semana anterior">‹</button>
        <div
          className="week-days"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
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
        <button type="button" className="week-days-nav" onClick={() => goWeek(1)} aria-label="Próxima semana">›</button>
      </div>
    </div>
  )
}

export default WeekDaySelector
