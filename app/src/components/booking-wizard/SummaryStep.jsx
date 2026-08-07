import React from 'react'

// Etapa 4 do BookingWizard — resumo dos serviços/data/horário e botão de confirmação.
function SummaryStep({ selectedServices, selectedDate, selectedSlot, totalDurationMinutes, totalPrice, loading, onConfirm }) {
  const dateLabel = selectedDate ? selectedDate.split('-').reverse().join('/') : ''

  return (
    <div className="booking-wizard-step">
      <div className="booking-wizard-summary-card">
        <p className="plan-services-label"><strong>Serviços:</strong></p>
        <ul className="plan-services-list">
          {selectedServices.map(s => (
            <li className="plan-services-item" key={s.id}>
              {s.name} — R$ {Number(s.price).toFixed(2).replace('.', ',')}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: '0.8rem', color: 'var(--text-primary)' }}>
          <strong>Data:</strong> {dateLabel} às {selectedSlot}
        </p>
        <p style={{ marginTop: '0.4rem', color: 'var(--text-primary)' }}>
          <strong>Duração total:</strong> {totalDurationMinutes} min
        </p>
        <p style={{ marginTop: '0.4rem', fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--dark-green)' }}>
          Total: R$ {totalPrice.toFixed(2).replace('.', ',')}
        </p>
      </div>

      <button
        type="button"
        className="btn-primary"
        style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem', marginTop: '1.5rem' }}
        disabled={loading}
        onClick={onConfirm}
      >
        {loading ? 'Confirmando...' : 'Confirmar Agendamento'}
      </button>
    </div>
  )
}

export default SummaryStep
