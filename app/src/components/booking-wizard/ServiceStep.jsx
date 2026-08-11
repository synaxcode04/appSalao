import React from 'react'
import { Check } from 'lucide-react'

// Etapa 1 do BookingWizard — seleção de profissional (realocado de DateTimeStep)
// e seleção múltipla de serviços em grid de 2 colunas.
// Estado vem do pai (BookingWizard); este componente é só apresentação + eventos.
function ServiceStep({
  services,
  selectedServiceIds,
  onToggleService,
  professionals,
  selectedProfessional,
  onProfessionalChange,
}) {
  return (
    <div className="ds-wizard-step">
      {professionals && professionals.length > 0 && (
        <div className="ds-field" style={{ marginBottom: '4px' }}>
          <label className="ds-label">Profissional</label>
          <select
            value={selectedProfessional}
            onChange={(e) => onProfessionalChange(e.target.value)}
            className="ds-select"
          >
            <option value="" disabled>Selecione um profissional</option>
            {professionals.map(prof => (
              <option key={prof.id} value={prof.id}>{prof.name}</option>
            ))}
          </select>
        </div>
      )}

      <label className="ds-label">Serviços</label>
      <div className="ds-service-card-grid">
        {services.map(s => {
          const isSelected = selectedServiceIds.includes(s.id)
          return (
            <button
              type="button"
              key={s.id}
              onClick={() => onToggleService(s.id)}
              className={`ds-service-card${isSelected ? ' ds-service-card--selected' : ''}`}
            >
              {isSelected
                ? <span className="ds-service-card-check"><Check size={12} /></span>
                : <span className="ds-service-card-uncheck" />
              }
              <span className="ds-service-card-name">{s.name}</span>
              <span className="ds-service-card-duration">{s.duration_minutes} min</span>
              <span className="ds-service-card-price">
                R$ {Number(s.price).toFixed(2).replace('.', ',')}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ServiceStep
