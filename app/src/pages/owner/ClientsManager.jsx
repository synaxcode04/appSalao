import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { UserPlus, Phone } from 'lucide-react'

function formatPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

function ClientsManager() {
  const { salon } = useOutletContext()

  const [phone, setPhone] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'created' | 'linked' | 'error', text }

  const [clients, setClients] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [togglingId, setTogglingId] = useState(null)

  const loadClients = async (salonId, mountedRef) => {
    const { data } = await supabase
      .from('salon_clients')
      .select('id, created_at, is_active, clients ( id, phone, full_name )')
      .eq('salon_id', salonId)
      .order('created_at', { ascending: false })

    if (mountedRef.value && data) {
      setClients(data)
    }
    if (mountedRef.value) {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    const mountedRef = { value: true }
    if (salon?.id) {
      setLoadingList(true)
      loadClients(salon.id, mountedRef)
    }
    return () => {
      mountedRef.value = false
    }
  }, [salon?.id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!salon?.id || submitting) return

    setSubmitting(true)
    setFeedback(null)

    try {
      const response = await fetch('/api/client-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_to_salon',
          phone,
          full_name: fullName,
          birth_date: birthDate,
          salon_id: salon.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setFeedback({
          type: 'error',
          text: data?.error || 'Não foi possível cadastrar o cliente. Tente novamente.'
        })
        return
      }

      // A Function faz create_or_get + vínculo. Se o telefone já existia
      // globalmente, o cliente foi reutilizado; caso contrário, foi criado.
      // O retorno não distingue explicitamente, então checamos se o vínculo
      // acabou de ser criado versus já existente comparando created_at.
      const linkCreatedNow =
        data?.salon_client?.created_at &&
        Date.now() - new Date(data.salon_client.created_at).getTime() < 15000

      setFeedback({
        type: linkCreatedNow ? 'linked' : 'existing',
        text: linkCreatedNow
          ? 'Cliente vinculado ao seu salão com sucesso. Se o telefone já existia em outro salão, a mesma identidade foi reutilizada.'
          : 'Este cliente já estava vinculado ao seu salão.'
      })

      setPhone('')
      setFullName('')
      setBirthDate('')

      const mountedRef = { value: true }
      await loadClients(salon.id, mountedRef)
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'Erro de conexão ao cadastrar o cliente. Tente novamente.'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (row) => {
    if (!salon?.id || !row?.clients?.id || togglingId) return

    const nextActive = row.is_active === false // se inativo, reativa; senão inativa
    setTogglingId(row.id)
    setFeedback(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setFeedback({
          type: 'error',
          text: 'Sua sessão expirou. Faça login novamente para atualizar o status do cliente.'
        })
        return
      }

      const response = await fetch('/api/client-identity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'toggle_active',
          salon_id: salon.id,
          client_id: row.clients.id,
          is_active: nextActive
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setFeedback({
          type: 'error',
          text: data?.error || 'Não foi possível atualizar o status do cliente. Tente novamente.'
        })
        return
      }

      setFeedback({
        type: nextActive ? 'linked' : 'existing',
        text: nextActive
          ? 'Cliente reativado. Ele já pode agendar novamente no seu salão.'
          : 'Cliente inativado. Ele continua na lista e mantém o histórico, mas não pode fazer novos agendamentos no seu salão.'
      })

      const mountedRef = { value: true }
      await loadClients(salon.id, mountedRef)
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'Erro de conexão ao atualizar o status do cliente. Tente novamente.'
      })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Clientes</h1>
        <p className="subtitle">
          Cadastre um cliente pelo telefone. Se ele já existir em outro salão, a
          mesma identidade é reutilizada e apenas vinculada ao seu salão.
        </p>
      </header>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>Novo Cliente</h3>
        <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: '1rem' }}>
          <input
            type="tel"
            placeholder="Telefone (ex: (11) 99999-9999)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Nome completo do cliente"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <input
            type="date"
            placeholder="Data de nascimento"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          <button type="submit" disabled={submitting} className="btn-primary">
            <UserPlus size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            {submitting ? 'Cadastrando...' : 'Cadastrar Cliente'}
          </button>
        </form>

        {feedback && (
          <div
            className="clients-feedback"
            data-type={feedback.type}
            role="status"
          >
            {feedback.text}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Clientes do Salão</h3>
        {loadingList ? (
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Carregando...</p>
        ) : clients.length === 0 ? (
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
            Nenhum cliente cadastrado ainda.
          </p>
        ) : (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {clients.map((row) => {
              const isInactive = row.is_active === false
              const isToggling = togglingId === row.id
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '1rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    opacity: isInactive ? 0.6 : 1
                  }}
                >
                  <div>
                    <h4 style={{ color: 'var(--dark-green)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {row.clients?.full_name || 'Cliente'}
                      {isInactive && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--border-color)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          Inativo
                        </span>
                      )}
                    </h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Phone size={14} /> {formatPhone(row.clients?.phone)}
                    </p>
                    {isInactive && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Continua na lista, mas bloqueado para novos agendamentos.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isToggling}
                    onClick={() => handleToggleActive(row)}
                  >
                    {isToggling
                      ? 'Salvando...'
                      : isInactive
                        ? 'Reativar'
                        : 'Inativar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientsManager
