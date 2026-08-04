import React from 'react'

const HOUR_HEIGHT = 64 // px por hora
const SNAP_MIN = 30 // granularidade do clique em vaga vazia
const NONE_COL = '__none__'

// "HH:MM:SS" ou "HH:MM" -> minutos totais.
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.substring(0, 5).split(':').map(Number)
  return h * 60 + m
}

// minutos -> "HH:MM:SS"
function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

// minutos -> "HH:MM"
function minutesToLabel(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Deriva a faixa de horas [startMin, endMin] a partir das working hours do dia,
// expandindo para caber agendamentos e bloqueios fora do horário padrão.
function deriveRange(workingHours, appointments, timeBlocks) {
  let start = 8 * 60
  let end = 20 * 60

  if (workingHours && workingHours.start_time && workingHours.end_time) {
    start = timeToMinutes(workingHours.start_time)
    end = timeToMinutes(workingHours.end_time)
  }

  const consider = (t) => {
    if (!t) return
    const mins = timeToMinutes(t)
    if (mins < start) start = mins
    if (mins > end) end = mins
  }

  appointments.forEach(a => { consider(a.start_time); consider(a.end_time) })
  timeBlocks.forEach(b => { consider(b.start_time); consider(b.end_time) })

  // Arredonda para horas cheias.
  start = Math.floor(start / 60) * 60
  end = Math.ceil(end / 60) * 60
  if (end <= start) end = start + 60
  return { startMin: start, endMin: end }
}

// Timeline vertical por hora, uma coluna por profissional (estilo Google Agenda).
function DayTimeline({ appointments, professionals, timeBlocks, workingHours, date, onAppointmentClick, onEmptySlotClick }) {
  const { startMin, endMin } = deriveRange(workingHours, appointments, timeBlocks)
  const totalMin = endMin - startMin
  const bodyHeight = (totalMin / 60) * HOUR_HEIGHT

  // Colunas: profissionais ativos + coluna "Sem profissional" se houver agendamento sem profissional.
  const columns = professionals.map(p => ({ id: p.id, name: p.name }))
  const hasUnassigned = appointments.some(a => !a.professional_id)
  if (hasUnassigned || columns.length === 0) {
    columns.push({ id: NONE_COL, name: 'Sem profissional' })
  }

  const hourLines = []
  for (let m = startMin; m <= endMin; m += 60) {
    hourLines.push(m)
  }

  const posStyle = (blockStart, blockEnd) => {
    const top = ((timeToMinutes(blockStart) - startMin) / 60) * HOUR_HEIGHT
    const rawHeight = ((timeToMinutes(blockEnd) - timeToMinutes(blockStart)) / 60) * HOUR_HEIGHT
    return { top: `${top}px`, height: `${Math.max(rawHeight, 22)}px` }
  }

  const handleColumnClick = (e, colId) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    let clickedMin = startMin + Math.floor(y / HOUR_HEIGHT * 60 / SNAP_MIN) * SNAP_MIN
    if (clickedMin < startMin) clickedMin = startMin
    if (clickedMin > endMin - SNAP_MIN) clickedMin = endMin - SNAP_MIN
    onEmptySlotClick({
      professionalId: colId === NONE_COL ? null : colId,
      date,
      startTime: minutesToTime(clickedMin)
    })
  }

  const statusClass = (status) => {
    if (status === 'canceled') return ' tl-appt-canceled'
    if (status === 'completed') return ' tl-appt-completed'
    return ''
  }

  return (
    <div className="timeline-wrap">
      <div className="timeline-grid" style={{ minWidth: `${80 + columns.length * 140}px` }}>
        {/* Cabeçalho de colunas */}
        <div className="timeline-header-row">
          <div className="timeline-axis-head" />
          {columns.map(col => (
            <div key={col.id} className="timeline-col-head">{col.name}</div>
          ))}
        </div>

        <div className="timeline-body" style={{ height: `${bodyHeight}px` }}>
          {/* Eixo de horas */}
          <div className="timeline-axis">
            {hourLines.map(m => (
              <div
                key={m}
                className="timeline-axis-hour"
                style={{ top: `${((m - startMin) / 60) * HOUR_HEIGHT}px` }}
              >
                {minutesToLabel(m)}
              </div>
            ))}
          </div>

          {/* Colunas de profissionais */}
          {columns.map(col => {
            const colAppts = appointments.filter(a =>
              col.id === NONE_COL ? !a.professional_id : a.professional_id === col.id
            )
            // Bloqueios da coluna: os do profissional + os do salão inteiro (professional_id null).
            const colBlocks = timeBlocks.filter(b =>
              !b.professional_id || (col.id !== NONE_COL && b.professional_id === col.id)
            )
            return (
              <div
                key={col.id}
                className="timeline-col"
                onClick={(e) => handleColumnClick(e, col.id)}
              >
                {hourLines.map(m => (
                  <div
                    key={m}
                    className="timeline-hour-line"
                    style={{ top: `${((m - startMin) / 60) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {colBlocks.map(b => (
                  <div
                    key={`b-${b.id}`}
                    className="tl-block"
                    style={posStyle(b.start_time, b.end_time)}
                    title={b.reason || 'Bloqueado'}
                  >
                    <span className="tl-block-label">
                      {b.reason || 'Bloqueado'}
                    </span>
                  </div>
                ))}

                {colAppts.map(appt => (
                  <div
                    key={appt.id}
                    className={`tl-appt${statusClass(appt.status)}`}
                    style={posStyle(appt.start_time, appt.end_time)}
                    onClick={(e) => { e.stopPropagation(); onAppointmentClick(appt) }}
                  >
                    <span className="tl-appt-time">{appt.start_time.substring(0, 5)}</span>
                    <span className="tl-appt-client">{appt.clients?.full_name || 'Cliente'}</span>
                    <span className="tl-appt-service">{appt.services?.name || ''}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default DayTimeline
