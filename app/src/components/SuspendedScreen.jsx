import React from 'react'

function SuspendedScreen({ variant }) {
  if (variant === 'owner') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backgroundColor: 'var(--ds-surface)', padding: '32px' }}>
        <h2 style={{ color: 'var(--ds-danger)', fontSize: '1.75rem', fontWeight: 600, marginBottom: '16px' }}>Acesso Suspenso</h2>
        <p style={{ color: 'var(--ds-text-2)', fontSize: '1rem', lineHeight: 1.5, maxWidth: '500px', marginBottom: '24px' }}>
          Sua licença expirou ou foi suspensa. Entre em contato com o suporte para regularizar o seu plano e reativar os agendamentos online.
        </p>
        <button
          className="ds-btn ds-btn-primary"
          onClick={() => window.open('https://wa.me/5511999999999', '_blank')}
        >
          Falar com o Suporte
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--ds-bg)', padding: '32px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--ds-danger)', marginBottom: '16px' }}>Página Indisponível</h1>
      <p style={{ color: 'var(--ds-text-2)', fontSize: '1rem', lineHeight: 1.5, maxWidth: '400px' }}>
        Este estabelecimento está temporariamente indisponível para novos agendamentos.
      </p>
    </div>
  )
}

export default SuspendedScreen
