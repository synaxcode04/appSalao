import React from 'react'
import useAvailableSlots from '../../hooks/useAvailableSlots'
import WizardCalendar from './WizardCalendar'

// Etapa 2 do BookingWizard — calendário mensal customizado e grade de horários.
// O seletor de profissional foi realocado para ServiceStep (etapa 1);
// professionals ainda é recebido aqui para o useAvailableSlots que o usa internamente.
function DateTimeStep({
  salonId,
  selectedDate,
  onDateChange,
  professionals,
  selectedProfessional,
  totalDurationMinutes,
  slotIntervalMinutes,
  selectedSlot,
  onSelectSlot,
}) {
  const { availableSlots } = useAvailableSlots({
    salonId,
    selectedDate,
    selectedProfessional,
    professionals,
    totalDurationMinutes,
    slotIntervalMinutes,
    existingAppointmentId: null,
  })

  return (
    <div className="ds-wizard-step">
      <div className="ds-field" style={{ marginBottom: '4px' }}>
        <label className="ds-label">Data</label>
        <WizardCalendar
          selectedDate={selectedDate}
          onDateChange={onDateChange}
        />
      </div>

      <div>
        <label className="ds-label" style={{ display: 'block', marginBottom: '8px' }}>
          Horários disponíveis
        </label>
        {!selectedDate ? (
          <p style={{ color: 'var(--ds-text-3)', fontSize: '13px' }}>
            Selecione uma data primeiro.
          </p>
        ) : availableSlots.length === 0 ? (
          <div
            className="ds-card"
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--ds-warning-soft)',
              color: 'var(--ds-warning)',
              fontSize: '13px',
            }}
          >
            Nenhum horário disponível para esta data.
          </div>
        ) : (
          <div className="ds-slot-grid">
            {availableSlots.map(slot => (
              <button
                key={slot}
                type="button"
                onClick={() => onSelectSlot(slot)}
                className={`ds-slot-button ds-slot-button--pill${selectedSlot === slot ? ' active' : ''}`}
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default DateTimeStep
