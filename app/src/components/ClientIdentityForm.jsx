import React, { useState } from 'react'
import { formatPhone, lookupClient, linkClientToSalon } from '../utils/clientIdentity'

// Fluxo inline de identificação do cliente na página pública do salão.
// Modelo por TELEFONE (sem email/senha): pede o WhatsApp; se já existir
// globalmente, reconhece e vincula automaticamente ao salão; se não existir,
// pede nome e data de nascimento, cria e vincula. A persistência escopada por
// slug é feita pelo `loginByPhone` do ClientSessionContext, recebido via prop.
function ClientIdentityForm({ salonId, loginByPhone, onIdentified, onCancel }) {
  const [step, setStep] = useState('phone') // 'phone' | 'details'
  const [phone, setPhone] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePhoneChange = (e) => setPhone(formatPhone(e.target.value))

  const handlePhoneSubmit = async (e) => {
    e.preventDefault()
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Informe um telefone válido com DDD.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const client = await lookupClient(phone)
      if (client) {
        // Cliente já conhecido: vincula ao salão e persiste a sessão.
        await loginByPhone(phone, client.full_name, salonId)
        onIdentified()
      } else {
        setStep('details')
      }
    } catch (err) {
      setError(err.message || 'Não foi possível continuar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleDetailsSubmit = async (e) => {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('Informe seu nome completo.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      // Cria o cliente com a data de nascimento e vincula ao salão...
      await linkClientToSalon({ phone, full_name: fullName, birth_date: birthDate, salon_id: salonId })
      // ...e persiste a sessão leve escopada por slug.
      await loginByPhone(phone, fullName, salonId)
      onIdentified()
    } catch (err) {
      setError(err.message || 'Não foi possível concluir. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.8rem',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    fontSize: '1rem',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--surface-color)'
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--light-green)', borderRadius: '12px' }}>
        <h3 style={{ color: 'var(--dark-green)', marginBottom: '0.2rem' }}>Identifique-se para agendar</h3>
        <p style={{ color: 'var(--dark-green)', opacity: 0.8, fontSize: '0.9rem' }}>
          {step === 'phone'
            ? 'Informe seu WhatsApp. Se já for cliente, reconhecemos você na hora.'
            : 'Primeira vez por aqui! Complete seu cadastro para finalizar.'}
        </p>
      </div>

      {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}

      {step === 'phone' ? (
        <form onSubmit={handlePhoneSubmit}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
            Telefone (WhatsApp)
          </label>
          <input
            type="tel"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={handlePhoneChange}
            maxLength="15"
            autoFocus
            style={{ ...inputStyle, marginBottom: '1.5rem' }}
          />
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.05rem' }} disabled={loading}>
            {loading ? 'Verificando...' : 'Continuar'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleDetailsSubmit}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
            Nome completo
          </label>
          <input
            type="text"
            placeholder="Seu nome completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoFocus
            style={{ ...inputStyle, marginBottom: '1.2rem' }}
          />
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
            Data de nascimento
          </label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            style={{ ...inputStyle, marginBottom: '1.5rem' }}
          />
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.05rem' }} disabled={loading}>
            {loading ? 'Concluindo...' : 'Concluir e agendar'}
          </button>
        </form>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{ width: '100%', marginTop: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          Voltar
        </button>
      )}
    </div>
  )
}

export default ClientIdentityForm
