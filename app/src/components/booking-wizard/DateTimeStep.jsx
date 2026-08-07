import React from 'react'
import useAvailableSlots from '../../hooks/useAvailableSlots'

// Etapa 2 do BookingWizard — data, profissional (se houver) e horário disponível.
function DateTimeStep({
  salonId,
  selectedDate,
  onDateChange,
  professionals,
  selectedProfessional,
  onProfessionalChange,
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
    <div className="booking-wizard-step">
      {professionals && professionals.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label className="plan-wizard-label">Escolha o Profissional:</label>
          <select
            value={selectedProfessional}
            onChange={(e) => onProfessionalChange(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '1rem', color: 'var(--text-primary)', backgroundColor: 'var(--surface-color)' }}
          >
            <option value="" disabled>Selecione um profissional</option>
            {professionals.map(prof => (
              <option key={prof.id} value={prof.id}>{prof.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <label className="plan-wizard-label">Escolha a Data:</label>
        <input
          type="date"
          value={selectedDate}
          min={new Date().toLocaleDateString('en-CA')}
          onChange={(e) => onDateChange(e.target.value)}
          style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '1rem', color: 'var(--text-primary)' }}
        />
      </div>

      <div>
        <label className="plan-wizard-label">Horários Disponíveis:</label>
        {!selectedDate ? (
          <p className="plan-wizard-hint">Selecione uma data primeiro.</p>
        ) : availableSlots.length === 0 ? (
          <div style={{ padding: '1rem', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '8px', fontSize: '0.9rem' }}>
            Nenhum horário disponível para esta data.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.8rem' }}>
            {availableSlots.map(slot => (
              <button
                key={slot}
                type="button"
                onClick={() => onSelectSlot(slot)}
                style={{
                  padding: '0.8rem',
                  borderRadius: '8px',
                  border: selectedSlot === slot ? '2px solid var(--primary-green)' : '1px solid var(--border-color)',
                  backgroundColor: selectedSlot === slot ? 'var(--light-green)' : 'var(--surface-color)',
                  color: selectedSlot === slot ? 'var(--dark-green)' : 'var(--text-primary)',
                  fontWeight: selectedSlot === slot ? 'bold' : 'normal',
                  cursor: 'pointer',
                }}
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
