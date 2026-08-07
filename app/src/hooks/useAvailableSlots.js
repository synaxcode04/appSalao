import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { computeAvailableSlots } from '../utils/slotUtils'

function useAvailableSlots({ salonId, selectedDate, selectedProfessional, professionals, totalDurationMinutes, slotIntervalMinutes, existingAppointmentId }) {
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedDate || totalDurationMinutes <= 0 || (professionals.length > 0 && !selectedProfessional)) {
      setAvailableSlots([])
      return
    }

    let mounted = true

    const fetchSlots = async () => {
      setLoading(true)
      setAvailableSlots([])

      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()

      // maybeSingle retorna data: null (sem HTTP 406) quando não há linha para o dia.
      const { data: workingHours, error: workingHoursError } = await supabase
        .from('working_hours')
        .select('*')
        .eq('salon_id', salonId)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle()

      if (!mounted) return
      if (workingHoursError || !workingHours) {
        setLoading(false)
        return
      }

      const apptBody = { action: 'list_scheduled', salon_id: salonId, appointment_date: selectedDate }
      if (selectedProfessional) {
        apptBody.professional_id = selectedProfessional
      } else if (professionals.length > 0) {
        if (mounted) setLoading(false)
        return
      }
      if (existingAppointmentId) apptBody.exclude_id = existingAppointmentId

      const { data: timeBlocksRaw } = await supabase
        .from('time_blocks')
        .select('professional_id, start_time, end_time')
        .eq('salon_id', salonId)
        .eq('block_date', selectedDate)

      if (!mounted) return

      // Filtramos em JS para evitar .eq('professional_id', null) — ver convencoes-gerais.md.
      const timeBlocks = (timeBlocksRaw || []).filter(b =>
        b.professional_id === null || b.professional_id === selectedProfessional
      )

      let appointments = []
      try {
        const apptRes = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apptBody)
        })
        if (apptRes.ok) {
          const apptData = await apptRes.json()
          appointments = apptData.appointments || []
        }
      } catch (_) {
        // Falha de rede: prossegue sem appointments (banco valida no create)
      }

      if (!mounted) return

      const freeSlots = computeAvailableSlots({
        workingHours,
        appointments,
        timeBlocks,
        totalDurationMinutes,
        slotIntervalMinutes,
        selectedDate
      })

      setAvailableSlots(freeSlots)
      setLoading(false)
    }

    fetchSlots()
    return () => { mounted = false }
  }, [selectedDate, totalDurationMinutes, selectedProfessional, professionals, salonId, slotIntervalMinutes, existingAppointmentId])

  return { availableSlots, loading }
}

export default useAvailableSlots
