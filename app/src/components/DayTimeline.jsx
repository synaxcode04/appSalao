import React from 'react'
import { getAppointmentServices } from '../utils/appointmentServices'

const HOUR_HEIGHT = 46 // px por hora (piso; altura efetiva sobe com granularidade fina)
const MIN_SLOT_HEIGHT = 30 // altura mínima confortável por linha de intervalo (px)
const SNAP_MIN = 30 // granularidade do clique em vaga vazia
const NONE_COL = '__none__'
const TOP_PAD = 8 // respiro no topo para o primeiro rótulo de hora não cortar
const BOTTOM_PAD = 8 // respiro no fim para o último rótulo de hora não cortar

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
function DayTimeline({ appointments, professionals, timeBlocks, workingHours, date, onAppointmentClick, onEmptySlotClick, slotMinutes }) {
  const { startMin, endMin } = deriveRange(workingHours, appointments, timeBlocks)
  const totalMin = endMin - startMin
  const step = Number(slotMinutes) > 0 ? Number(slotMinutes) : 60

  // Altura efetiva por hora: garante que cada linha de `step` minutos tenha
  // pelo menos MIN_SLOT_HEIGHT px, evitando linhas espremidas em granularidade fina.
  const slotsPerHour = 60 / step
  const effectiveHourHeight = Math.max(HOUR_HEIGHT, MIN_SLOT_HEIGHT * slotsPerHour)
  const bodyHeight = (totalMin / 60) * effectiveHourHeight + TOP_PAD + BOTTOM_PAD

  // Colunas: profissionais ativos + coluna "Sem profissional" se houver agendamento sem profissional.
  const columns = professionals.map(p => ({ id: p.id, name: p.name }))
  const hasUnassigned = appointments.some(a => !a.professional_id)
  if (hasUnassigned || columns.length === 0) {
    // Só rotula "Sem profissional" quando há profissionais cadastrados e um agendamento sem atribuição.
    // Sem nenhum profissional cadastrado, o cabeçalho fica vazio.
    const noneName = professionals.length === 0 ? '' : 'Sem profissional'
    columns.push({ id: NONE_COL, name: noneName })
  }

  const hourLines = []
  for (let m = startMin; m <= endMin; m += step) {
    hourLines.push(m)
  }

  const posStyle = (blockStart, blockEnd) => {
    const top = ((timeToMinutes(blockStart) - startMin) / 60) * effectiveHourHeight + TOP_PAD
    const rawHeight = ((timeToMinutes(blockEnd) - timeToMinutes(blockStart)) / 60) * effectiveHourHeight
    return { top: `${top}px`, height: `${Math.max(rawHeight, 36)}px` }
  }

  const handleColumnClick = (e, colId) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top - TOP_PAD
    let clickedMin = startMin + Math.floor(y / effectiveHourHeight * 60 / SNAP_MIN) * SNAP_MIN
    if (clickedMin < startMin) clickedMin = startMin
    if (clickedMin > endMin - SNAP_MIN) clickedMin = endMin - SNAP_MIN
    onEmptySlotClick({
      professionalId: colId === NONE_COL ? null : colId,
      date,
      startTime: minutesToTime(clickedMin)
    })
  }

  const statusClass = (status) => {
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
            <div key={col.id} className="timeline-col-head">{col.name || ' '}</div>
          ))}
        </div>

        <div className="timeline-body" style={{ height: `${bodyHeight}px` }}>
          {/* Eixo de horas */}
          <div className="timeline-axis">
            {hourLines.map(m => (
              <div
                key={m}
                className="timeline-axis-hour"
                style={{ top: `${((m - startMin) / 60) * effectiveHourHeight + TOP_PAD}px` }}
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
                    style={{ top: `${((m - startMin) / 60) * effectiveHourHeight + TOP_PAD}px` }}
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
                  <button
                    type="button"
                    key={appt.id}
                    className={`tl-appt${statusClass(appt.status)}`}
                    style={posStyle(appt.start_time, appt.end_time)}
                    onClick={(e) => { e.stopPropagation(); onAppointmentClick(appt) }}
                  >
                    <div className="tl-appt-head">
                      <span className="tl-appt-time">{appt.start_time.substring(0, 5)}</span>
                      <span className="tl-appt-client">{appt.clients?.full_name || 'Cliente'}</span>
                    </div>
                    <span className="tl-appt-service">{getAppointmentServices(appt).map(s => s.name).join(', ')}</span>
                  </button>
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
