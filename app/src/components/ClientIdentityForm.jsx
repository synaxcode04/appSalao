import React, { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { formatPhone, lookupClient, linkClientToSalon } from '../utils/clientIdentity'
import BirthdateInput from './BirthdateInput'

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
      await linkClientToSalon({ phone, full_name: fullName, birth_date: birthDate || null, salon_id: salonId })
      // ...e persiste a sessão leve escopada por slug.
      await loginByPhone(phone, fullName, salonId)
      onIdentified()
    } catch (err) {
      setError(err.message || 'Não foi possível concluir. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div className="ds-card ds-card-surface-2" style={{ marginBottom: '16px', padding: '1rem 1.25rem' }}>
        <h3 style={{ color: 'var(--ds-primary)', fontWeight: '600', fontSize: '16px', margin: '0 0 4px 0' }}>
          Identifique-se para agendar
        </h3>
        <p style={{ color: 'var(--ds-text-2)', fontSize: '13px', margin: 0, lineHeight: '1.4' }}>
          {step === 'phone'
            ? 'Informe seu WhatsApp. Se já for cliente, reconhecemos você na hora.'
            : 'Primeira vez por aqui! Complete seu cadastro para finalizar.'}
        </p>
      </div>

      {error && (
        <div
          className="ds-card"
          style={{ padding: '10px 14px', marginBottom: '14px', backgroundColor: 'var(--ds-danger-soft)', color: 'var(--ds-danger)', fontSize: '13px' }}
        >
          {error}
        </div>
      )}

      {step === 'phone' ? (
        <form onSubmit={handlePhoneSubmit}>
          <div className="ds-field" style={{ marginBottom: '16px' }}>
            <label className="ds-label">Telefone (WhatsApp)</label>
            <input
              type="tel"
              className="ds-input"
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={handlePhoneChange}
              maxLength="15"
              autoFocus
            />
          </div>
          <div className="ds-wizard-nav" style={{ marginTop: 0 }}>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="ds-btn ds-btn-secondary ds-btn-pill"
                style={{ flex: 1 }}
              >
                <ArrowLeft size={16} /> Voltar
              </button>
            )}
            <button
              type="submit"
              className="ds-btn ds-btn-primary ds-btn-pill"
              style={{ flex: 2 }}
              disabled={loading}
            >
              {loading ? 'Verificando...' : 'Continuar'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleDetailsSubmit}>
          <div className="ds-field" style={{ marginBottom: '12px' }}>
            <label className="ds-label">Nome completo</label>
            <input
              type="text"
              className="ds-input"
              placeholder="Seu nome completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="ds-field" style={{ marginBottom: '16px' }}>
            <label className="ds-label">Data de nascimento</label>
            <div>
              <BirthdateInput value={birthDate} onChange={setBirthDate} />
            </div>
          </div>
          <div className="ds-wizard-nav" style={{ marginTop: 0 }}>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="ds-btn ds-btn-secondary ds-btn-pill"
                style={{ flex: 1 }}
              >
                <ArrowLeft size={16} /> Voltar
              </button>
            )}
            <button
              type="submit"
              className="ds-btn ds-btn-primary ds-btn-pill"
              style={{ flex: 2 }}
              disabled={loading}
            >
              {loading ? 'Concluindo...' : 'Concluir e agendar'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default ClientIdentityForm
