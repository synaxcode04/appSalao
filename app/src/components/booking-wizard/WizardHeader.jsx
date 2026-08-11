import React from 'react'
import { Scissors, ArrowLeft, X, MapPin } from 'lucide-react'

// Header reutilizado nas 4 etapas do wizard de agendamento.
// onBack: BookingWizard decide qual função acionar (goBack se step>1, onClose se step===1).
// onClose: sempre fecha o modal (botão X).
function WizardHeader({ salonName, salonAddress, salonLogoUrl, onBack, onClose }) {
  return (
    <div className="ds-wizard-header">
      <button
        type="button"
        className="ds-wizard-back-btn"
        onClick={onBack}
        aria-label="Voltar"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="ds-wizard-header-avatar">
        {salonLogoUrl ? (
          <img src={salonLogoUrl} alt={salonName || 'Salão'} />
        ) : (
          <Scissors size={22} />
        )}
      </div>

      {(salonName || salonAddress) && (
        <div className="ds-wizard-header-info">
          {salonName && (
            <p className="ds-wizard-header-name">{salonName}</p>
          )}
          {salonAddress && (
            <p className="ds-wizard-header-address">
              <MapPin size={11} />
              <span>{salonAddress}</span>
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        className="ds-wizard-close-btn"
        onClick={onClose}
        aria-label="Fechar"
      >
        <X size={20} />
      </button>
    </div>
  )
}

export default WizardHeader
