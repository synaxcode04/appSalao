import React from 'react'
import { Check } from 'lucide-react'

const STEPS = [
  { label: 'Serviços' },
  { label: 'Horário' },
  { label: 'Dados' },
]

// Recebe o step interno do BookingWizard (1–4) e exibe 3 etapas visuais.
// Internos 1→visual 1, 2→visual 2, 3 e 4→visual 3.
// Sub-rótulo dinâmico sob "Dados": "Identifique-se" (step 3) ou "Confirme" (step 4).
function WizardStepper({ step }) {
  const visualStep = step <= 2 ? step : 3

  const sublabelForDados = () => {
    if (step === 3) return 'Identifique-se'
    if (step === 4) return 'Confirme'
    return null
  }

  return (
    <div className="ds-stepper">
      {STEPS.map((s, i) => {
        const vi = i + 1
        const isPast = vi < visualStep
        const isActive = vi === visualStep
        const isFuture = vi > visualStep
        const sublabel = vi === 3 ? sublabelForDados() : null

        const circleClass = [
          'ds-stepper-circle',
          isPast ? 'ds-stepper-circle--past' : isActive ? 'ds-stepper-circle--active' : 'ds-stepper-circle--future',
        ].join(' ')

        const labelClass = [
          'ds-stepper-label',
          isFuture ? 'ds-stepper-label--future' : '',
        ].join(' ').trim()

        return (
          <React.Fragment key={vi}>
            {i > 0 && (
              <div className={`ds-stepper-line${isPast || isActive ? ' ds-stepper-line--done' : ''}`} />
            )}
            <div className="ds-stepper-step">
              <div className={circleClass}>
                {isPast ? <Check size={14} /> : <span>{vi}</span>}
              </div>
              <span className={labelClass}>{s.label}</span>
              {sublabel && (
                <span className="ds-stepper-sublabel">{sublabel}</span>
              )}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default WizardStepper
