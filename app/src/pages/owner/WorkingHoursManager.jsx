import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import toast from 'react-hot-toast'

const DAYS_OF_WEEK = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'
]

const DEFAULT_HOURS = DAYS_OF_WEEK.map((name, index) => ({
  day_of_week: index,
  isOpen: index >= 1 && index <= 5, // Seg a Sex aberto por padrão
  start_time: '09:00',
  end_time: '18:00',
  has_lunch_break: true,
  break_start_time: '12:00',
  break_end_time: '13:00'
}))

function WorkingHoursManager() {
  const [salonId, setSalonId] = useState(null)
  const [hours, setHours] = useState(DEFAULT_HOURS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchSalonData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: salonData } = await supabase
          .from('salons')
          .select('id')
          .eq('owner_id', user.id)
          .single()
        
        if (salonData) {
          setSalonId(salonData.id)
          await loadWorkingHours(salonData.id)
        }
      }
      setLoading(false)
    }
    fetchSalonData()
  }, [])

  const loadWorkingHours = async (sId) => {
    const { data } = await supabase
      .from('working_hours')
      .select('*')
      .eq('salon_id', sId)
    
    if (data && data.length > 0) {
      // Mesclar dados salvos com o padrão
      const mergedHours = DEFAULT_HOURS.map(defaultDay => {
        const savedDay = data.find(d => d.day_of_week === defaultDay.day_of_week)
        if (savedDay) {
          return {
            day_of_week: savedDay.day_of_week,
            isOpen: true,
            start_time: savedDay.start_time.substring(0, 5), // '09:00:00' -> '09:00'
            end_time: savedDay.end_time.substring(0, 5),
            has_lunch_break: savedDay.has_lunch_break ?? Boolean(savedDay.break_start_time && savedDay.break_end_time),
            break_start_time: savedDay.break_start_time ? savedDay.break_start_time.substring(0, 5) : '',
            break_end_time: savedDay.break_end_time ? savedDay.break_end_time.substring(0, 5) : ''
          }
        }
        return { ...defaultDay, isOpen: false }
      })
      setHours(mergedHours)
    }
  }

  const handleDayChange = (index, field, value) => {
    const newHours = [...hours]
    newHours[index][field] = value
    setHours(newHours)
  }

  const handleSave = async () => {
    if (!salonId) return
    setSaving(true)

    // Deletar horários antigos para recriar (upsert simplificado)
    await supabase.from('working_hours').delete().eq('salon_id', salonId)

    // Filtrar apenas dias abertos
    const openDays = hours.filter(h => h.isOpen).map(h => ({
      salon_id: salonId,
      day_of_week: h.day_of_week,
      start_time: h.start_time,
      end_time: h.end_time,
      has_lunch_break: h.has_lunch_break,
      break_start_time: h.has_lunch_break ? (h.break_start_time || null) : null,
      break_end_time: h.has_lunch_break ? (h.break_end_time || null) : null
    }))

    if (openDays.length > 0) {
      await supabase.from('working_hours').insert(openDays)
    }

    toast.success('Horários salvos com sucesso!')
    setSaving(false)
  }

  if (loading) return <div>Carregando...</div>

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Horários de Atendimento</h1>
        <p className="subtitle">Defina dias e horários de funcionamento</p>
      </header>

      <div className="ds-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {hours.map((day, index) => (
            <div key={index} style={{
              padding: '1rem',
              border: '1px solid var(--ds-surface-2)',
              borderRadius: 'var(--ds-radius-md)',
              opacity: day.isOpen ? 1 : 0.6,
              background: day.isOpen ? 'transparent' : 'var(--ds-surface-2)'
            }}>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: day.isOpen ? '1rem' : '0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  <input
                    type="checkbox"
                    checked={day.isOpen}
                    onChange={(e) => handleDayChange(index, 'isOpen', e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--ds-primary)' }}
                  />
                  {DAYS_OF_WEEK[index]}
                </label>
                <span style={{ fontSize: '0.9rem', color: day.isOpen ? 'var(--ds-primary)' : 'var(--ds-text-2)' }}>
                  {day.isOpen ? 'Aberto' : 'Fechado'}
                </span>
              </div>

              {day.isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Expediente */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label htmlFor={`wh-start-${index}`} style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Abertura</label>
                      <input
                        id={`wh-start-${index}`}
                        type="time"
                        value={day.start_time}
                        onChange={(e) => handleDayChange(index, 'start_time', e.target.value)}
                        className="auth-form input"
                        style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label htmlFor={`wh-end-${index}`} style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Fechamento</label>
                      <input
                        id={`wh-end-${index}`}
                        type="time"
                        value={day.end_time}
                        onChange={(e) => handleDayChange(index, 'end_time', e.target.value)}
                        className="auth-form input"
                        style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
                      />
                    </div>
                  </div>

                  {/* Pausa para almoço (opcional por dia) */}
                  <div style={{ borderTop: '1px dashed var(--ds-surface-2)', paddingTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--ds-text-2)' }}>
                      <input
                        type="checkbox"
                        checked={day.has_lunch_break}
                        onChange={(e) => handleDayChange(index, 'has_lunch_break', e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--ds-primary)' }}
                      />
                      Configurar pausa para almoço
                    </label>

                    {day.has_lunch_break ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                        <div style={{ flex: 1, minWidth: '120px' }}>
                          <label htmlFor={`wh-break-start-${index}`} style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Início Pausa / Almoço</label>
                          <input
                            id={`wh-break-start-${index}`}
                            type="time"
                            value={day.break_start_time}
                            onChange={(e) => handleDayChange(index, 'break_start_time', e.target.value)}
                            className="auth-form input"
                            style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: '120px' }}>
                          <label htmlFor={`wh-break-end-${index}`} style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Fim Pausa / Almoço</label>
                          <input
                            id={`wh-break-end-${index}`}
                            type="time"
                            value={day.break_end_time}
                            onChange={(e) => handleDayChange(index, 'break_end_time', e.target.value)}
                            className="auth-form input"
                            style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                        Sem pausa: disponível o dia todo dentro do expediente.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="ds-btn ds-btn-primary ds-btn-full"
          style={{ marginTop: '2rem', padding: '1rem', fontSize: '1.1rem' }}
        >
          {saving ? 'Salvando Horários...' : 'Salvar Todos os Horários'}
        </button>
      </div>
    </div>
  )
}

export default WorkingHoursManager
