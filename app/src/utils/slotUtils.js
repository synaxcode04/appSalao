function generateTimeSlots(start, end, intervalMin) {
  const slots = []
  let [h, m] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)

  while (h < endH || (h === endH && m <= endM)) {
    slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    m += intervalMin
    if (m >= 60) {
      h += Math.floor(m / 60)
      m = m % 60
    }
  }
  return slots
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// Função pura exportável para testes Vitest — não faz fetch, recebe dados prontos.
// now é opcional; quando omitido usa new Date() (útil em testes para fixar a hora).
// timeBlocks: array de { start_time, end_time } já filtrados para o profissional/salão relevante.
export function computeAvailableSlots({ workingHours, appointments, timeBlocks = [], totalDurationMinutes, slotIntervalMinutes, selectedDate, now }) {
  const step = slotIntervalMinutes && slotIntervalMinutes >= 15 ? slotIntervalMinutes : totalDurationMinutes
  if (!step || step <= 0) return []

  const allSlots = generateTimeSlots(
    workingHours.start_time.substring(0, 5),
    workingHours.end_time.substring(0, 5),
    step
  )
  const breakStart = workingHours.break_start_time ? timeToMinutes(workingHours.break_start_time.substring(0, 5)) : null
  const breakEnd = workingHours.break_end_time ? timeToMinutes(workingHours.break_end_time.substring(0, 5)) : null
  const currentDate = now || new Date()

  return allSlots.filter(slot => {
    const slotStartMin = timeToMinutes(slot)
    const slotEndMin = slotStartMin + totalDurationMinutes

    if (slotEndMin > timeToMinutes(workingHours.end_time.substring(0, 5))) return false

    // has_lunch_break=false desabilita explicitamente a pausa, mesmo que break_start/end existam no banco.
    // has_lunch_break=undefined (registro antigo antes da migração) cai no comportamento legado: bloqueia se break_start/end existirem.
    const lunchEnabled = workingHours.has_lunch_break !== false
    if (lunchEnabled && breakStart && breakEnd) {
      if (slotStartMin < breakEnd && slotEndMin > breakStart) return false
    }

    for (const appt of appointments) {
      const apptStartMin = timeToMinutes(appt.start_time.substring(0, 5))
      const apptEndMin = timeToMinutes(appt.end_time.substring(0, 5))
      if (slotStartMin < apptEndMin && slotEndMin > apptStartMin) return false
    }

    for (const block of timeBlocks) {
      const blockStartMin = timeToMinutes(block.start_time.substring(0, 5))
      const blockEndMin = timeToMinutes(block.end_time.substring(0, 5))
      if (slotStartMin < blockEndMin && slotEndMin > blockStartMin) return false
    }

    const todayStr = currentDate.toLocaleDateString('en-CA')
    if (selectedDate === todayStr) {
      const nowMin = currentDate.getHours() * 60 + currentDate.getMinutes()
      if (slotStartMin <= nowMin) return false
    }

    return true
  })
}
