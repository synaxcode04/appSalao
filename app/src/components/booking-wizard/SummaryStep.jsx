import React from 'react'

// Etapa 4 do BookingWizard — resumo itemizado e botão de confirmação.
// O botão "← Voltar" fica no rodapé do BookingWizard (ds-wizard-nav).
function SummaryStep({ selectedServices, selectedDate, selectedSlot, totalDurationMinutes, totalPrice, loading, onConfirm }) {
  const dateLabel = selectedDate ? selectedDate.split('-').reverse().join('/') : ''

  return (
    <div className="ds-wizard-step">
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--ds-text)', margin: '0 0 12px 0' }}>
        Confirme seu agendamento
      </h3>

      <div className="ds-card ds-card-surface-2" style={{ padding: '16px' }}>
        <p className="ds-label" style={{ marginBottom: '8px', fontSize: '13px' }}>
          <strong>Serviços selecionados</strong>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {selectedServices.map(s => (
            <div
              key={s.id}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--ds-text)' }}
            >
              <span>{s.name}</span>
              <span style={{ fontWeight: '600' }}>R$ {Number(s.price).toFixed(2).replace('.', ',')}</span>
            </div>
          ))}
        </div>
        <div style={{ height: '1px', background: 'var(--ds-surface-3)', margin: '0 0 10px 0' }} />
        <div>
          <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: 'var(--ds-text)' }}>
            <strong>Data e horário:</strong> {dateLabel} às {selectedSlot}
          </p>
          <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--ds-text-2)' }}>
            <strong>Duração estimada:</strong> {totalDurationMinutes} min
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '16px', fontWeight: '700', color: 'var(--ds-text)' }}>
            Total: R$ {totalPrice.toFixed(2).replace('.', ',')}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="ds-btn ds-btn-primary ds-btn-full ds-btn-pill"
        style={{ padding: '14px 24px', fontSize: '15px', marginTop: '8px' }}
        disabled={loading}
        onClick={onConfirm}
      >
        {loading ? 'Agendando...' : 'Confirmar agendamento'}
      </button>
    </div>
  )
}

export default SummaryStep
