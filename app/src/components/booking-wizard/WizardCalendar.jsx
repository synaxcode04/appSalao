import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function getInitView(dateStr) {
  if (dateStr) {
    const [y, m] = dateStr.split('-').map(Number)
    if (y && m) return { year: y, month: m - 1 }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

// Calendário mensal JS puro — sem dependência externa.
// Contrato idêntico ao <input type="date"> que substitui: selectedDate em YYYY-MM-DD,
// onDateChange(dateStr) também em YYYY-MM-DD via toLocaleDateString('en-CA').
function WizardCalendar({ selectedDate, onDateChange }) {
  const init = getInitView(selectedDate)
  const [viewYear, setViewYear] = useState(init.year)
  const [viewMonth, setViewMonth] = useState(init.month)

  // Sincroniza a visualização quando o pai atualiza selectedDate (ex: reset ao abrir).
  useEffect(() => {
    if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number)
      if (y && m) {
        setViewYear(y)
        setViewMonth(m - 1)
      }
    }
  }, [selectedDate])

  const today = new Date().toLocaleDateString('en-CA')
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const canGoPrev = viewYear > todayYear || (viewYear === todayYear && viewMonth > todayMonth - 1)

  const prevMonth = () => {
    if (!canGoPrev) return
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const buildCells = () => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const prevDays = new Date(viewYear, viewMonth, 0).getDate()

    const cells = []

    for (let i = firstDow - 1; i >= 0; i--) {
      cells.push({ day: prevDays - i, otherMonth: true, dateStr: null })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d)
      const dateStr = date.toLocaleDateString('en-CA')
      cells.push({ day: d, otherMonth: false, dateStr, disabled: dateStr < today })
    }

    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, otherMonth: true, dateStr: null })
    }

    return cells
  }

  const cells = buildCells()

  return (
    <div className="ds-calendar">
      <div className="ds-calendar-header">
        <button
          type="button"
          className="ds-calendar-nav-btn"
          onClick={prevMonth}
          disabled={!canGoPrev}
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="ds-calendar-month-label">
          {MONTHS_PT[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          className="ds-calendar-nav-btn"
          onClick={nextMonth}
          aria-label="Próximo mês"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="ds-calendar-dow-row">
        {DAYS_PT.map(d => (
          <span key={d} className="ds-calendar-dow">{d}</span>
        ))}
      </div>

      <div className="ds-calendar-grid">
        {cells.map((cell, i) => {
          const isSelected = cell.dateStr === selectedDate
          const isToday = cell.dateStr === today

          let cls = 'ds-calendar-day'
          if (cell.otherMonth) cls += ' ds-calendar-day--other-month'
          else if (cell.disabled) cls += ' ds-calendar-day--disabled'
          else if (isSelected) cls += ' ds-calendar-day--selected'
          else if (isToday) cls += ' ds-calendar-day--today'

          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={cell.disabled || cell.otherMonth}
              tabIndex={cell.otherMonth ? -1 : 0}
              onClick={() => {
                if (cell.dateStr && !cell.disabled && !cell.otherMonth) {
                  onDateChange(cell.dateStr)
                }
              }}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default WizardCalendar
