import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { UserPlus, Phone } from 'lucide-react'
import BirthdateInput from '../../components/BirthdateInput'

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

function normalize(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function filterClients(clients, query) {
  const rows = clients || []
  const trimmed = (query || '').trim()
  if (!trimmed) return rows

  const normalizedQuery = normalize(trimmed)
  const queryDigits = trimmed.replace(/\D/g, '')

  return rows.filter((row) => {
    const name = normalize(row?.clients?.full_name)
    const matchesName = normalizedQuery && name.includes(normalizedQuery)

    const phoneDigits = (row?.clients?.phone || '').replace(/\D/g, '')
    const matchesPhone = queryDigits && phoneDigits.includes(queryDigits)

    return Boolean(matchesName || matchesPhone)
  })
}

function ClientsManager() {
  const { salon } = useOutletContext()

  const [phone, setPhone] = useState('')
  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'created' | 'linked' | 'error', text }
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState('')

  const [clients, setClients] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [togglingId, setTogglingId] = useState(null)

  const loadClients = async (salonId, mountedRef) => {
    const { data } = await supabase
      .from('salon_clients')
      .select('id, created_at, is_active, clients ( id, phone, full_name )')
      .eq('salon_id', salonId)

    const sorted = (data || []).slice().sort((a, b) => {
      const nameA = a.clients?.full_name?.trim() || ''
      const nameB = b.clients?.full_name?.trim() || ''
      if (!nameA) return 1
      if (!nameB) return -1
      return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' })
    })

    if (mountedRef.value && data) {
      setClients(sorted)
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
          birth_date: birthDate || null,
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

      setModalOpen(false)
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

  const filteredClients = filterClients(clients, search)

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Clientes</h1>
        <p className="subtitle">
          Cadastre um cliente pelo telefone. Se ele já existir em outro salão, a
          mesma identidade é reutilizada e apenas vinculada ao seu salão.
        </p>
      </header>

      <button
        type="button"
        className="btn-primary clients-toolbar"
        onClick={() => setModalOpen(true)}
      >
        <UserPlus size={18} />
        Novo Cliente
      </button>

      {feedback && (
        <div
          className="clients-feedback clients-feedback--spaced"
          data-type={feedback.type}
          role="status"
        >
          {feedback.text}
        </div>
      )}

      <div className="card">
        <h3>Clientes do Salão</h3>

        <input
          type="search"
          placeholder="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="clients-search"
        />

        {loadingList ? (
          <p className="clients-empty">Carregando...</p>
        ) : clients.length === 0 ? (
          <p className="clients-empty">
            Nenhum cliente cadastrado ainda.
          </p>
        ) : filteredClients.length === 0 ? (
          <p className="clients-empty">
            Nenhum cliente encontrado para a busca.
          </p>
        ) : (
          <div className="clients-list">
            {filteredClients.map((row) => {
              const isInactive = row.is_active === false
              const isToggling = togglingId === row.id
              return (
                <div
                  key={row.id}
                  className="client-row"
                  style={{ opacity: isInactive ? 0.6 : 1 }}
                >
                  <div>
                    <h4 className="client-row-name">
                      {row.clients?.full_name || 'Cliente'}
                      {isInactive && (
                        <span className="client-badge-inactive">
                          Inativo
                        </span>
                      )}
                    </h4>
                    <p className="client-row-phone">
                      <Phone size={14} /> {formatPhone(row.clients?.phone)}
                    </p>
                    {isInactive && (
                      <p className="client-row-note">
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

      {modalOpen && (
        <div
          onClick={() => !submitting && setModalOpen(false)}
          className="modal-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card modal-card"
          >
            <h3 className="modal-title">Novo Cliente</h3>

            <form onSubmit={handleSubmit} className="auth-form">
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
              <BirthdateInput value={birthDate} onChange={setBirthDate} />
              <button type="submit" disabled={submitting} className="btn-primary">
                <UserPlus size={18} className="btn-icon-inline" />
                {submitting ? 'Cadastrando...' : 'Cadastrar Cliente'}
              </button>
            </form>

            {feedback && feedback.type === 'error' && (
              <div
                className="clients-feedback"
                data-type={feedback.type}
                role="status"
              >
                {feedback.text}
              </div>
            )}

            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
              className="modal-cancel"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientsManager
