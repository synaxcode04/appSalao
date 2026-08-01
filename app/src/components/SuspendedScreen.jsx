import React from 'react'

function SuspendedScreen({ variant }) {
  if (variant === 'owner') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backgroundColor: '#fff', padding: '2rem' }}>
        <h2 style={{ color: '#ef4444', fontSize: '2rem', marginBottom: '1rem' }}>Acesso Suspenso</h2>
        <p style={{ color: '#475569', fontSize: '1.1rem', maxWidth: '500px', marginBottom: '2rem' }}>
          Sua licença expirou ou foi suspensa. Entre em contato com o suporte para regularizar o seu plano e reativar os agendamentos online.
        </p>
        <button
          className="btn-primary"
          onClick={() => window.open('https://wa.me/5511999999999', '_blank')}
        >
          Falar com o Suporte
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#ef4444', marginBottom: '1rem' }}>Página Indisponível</h1>
      <p style={{ color: '#475569', fontSize: '1.2rem', maxWidth: '400px' }}>
        Este estabelecimento está temporariamente indisponível para novos agendamentos.
      </p>
    </div>
  )
}

export default SuspendedScreen
