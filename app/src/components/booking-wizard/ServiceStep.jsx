import React from 'react'

// Etapa 1 do BookingWizard — seleção múltipla de serviços em grid de 2 colunas.
// Estado vem do pai (BookingWizard); este componente é só apresentação + eventos de clique.
function ServiceStep({ services, selectedServiceIds, onToggleService, totalDurationMinutes, totalPrice }) {
  return (
    <div className="booking-wizard-step">
      <label className="plan-wizard-label">Selecione os serviços:</label>
      <div className="booking-wizard-service-grid">
        {services.map(s => {
          const isChecked = selectedServiceIds.includes(s.id)
          return (
            <button
              type="button"
              key={s.id}
              onClick={() => onToggleService(s.id)}
              className={`booking-wizard-service-card${isChecked ? ' booking-wizard-service-card--checked' : ''}`}
            >
              <span className="booking-wizard-service-card-name">{s.name}</span>
              <span className="booking-wizard-service-card-duration">{s.duration_minutes} min</span>
              <span className="booking-wizard-service-card-price">
                R$ {Number(s.price).toFixed(2).replace('.', ',')}
              </span>
            </button>
          )
        })}
      </div>

      {selectedServiceIds.length > 0 && (
        <div className="booking-wizard-summary-bar">
          <span>Total: {totalDurationMinutes} min</span>
          <span>R$ {totalPrice.toFixed(2).replace('.', ',')}</span>
        </div>
      )}
    </div>
  )
}

export default ServiceStep
