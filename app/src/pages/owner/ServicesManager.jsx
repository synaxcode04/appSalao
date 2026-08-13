import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { Trash2, Edit2, Plus, Clock, DollarSign } from 'lucide-react'

function ServicesManager() {
  const [salonId, setSalonId] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  // Form states
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('')
  const [price, setPrice] = useState('')

  const resetForm = () => {
    setEditId(null)
    setName('')
    setDuration('')
    setPrice('')
  }

  const closeModal = () => {
    setModalOpen(false)
    resetForm()
  }

  useEffect(() => {
    const fetchSalonData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: salonData } = await supabase
          .from('salons')
          .select('id')
          .eq('owner_id', user.id)
          .single()
        
        if (salonData) {
          setSalonId(salonData.id)
          await loadServices(salonData.id)
        }
      }
      setLoading(false)
    }
    fetchSalonData()
  }, [])

  const loadServices = async (sId) => {
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('salon_id', sId)
      .order('name', { ascending: true })
    
    if (data) setServices(data)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!salonId) return

    setLoading(true)
    const payload = {
      salon_id: salonId,
      name,
      duration_minutes: parseInt(duration),
      price: parseFloat(price)
    }

    if (editId) {
      // Update
      await supabase.from('services').update(payload).eq('id', editId)
    } else {
      // Insert
      await supabase.from('services').insert([payload])
    }

    // Reset Form and close modal
    resetForm()
    setModalOpen(false)

    // Reload list
    await loadServices(salonId)
    setLoading(false)
  }

  const handleEdit = (service) => {
    setEditId(service.id)
    setName(service.name)
    setDuration(service.duration_minutes)
    setPrice(service.price)
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este serviço?')) return
    setLoading(true)
    await supabase.from('services').delete().eq('id', id)
    await loadServices(salonId)
    setLoading(false)
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Serviços</h1>
        <p className="subtitle">Cadastrar e editar serviços</p>
      </header>

      <button
        type="button"
        className="ds-btn ds-btn-primary clients-toolbar"
        onClick={() => {
          resetForm()
          setModalOpen(true)
        }}
      >
        <Plus size={18} />
        Novo Serviço
      </button>

      <div className="ds-card">
        <h3>Seus Serviços</h3>
        {services.length === 0 ? (
          <p style={{ marginTop: '1rem', color: 'var(--ds-text-2)' }}>Nenhum serviço cadastrado ainda.</p>
        ) : (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {services.map(s => (
              <div key={s.id} className="owner-list-row">
                <div>
                  <h4 style={{ color: 'var(--ds-text)' }}>{s.name}</h4>
                  <p className="owner-service-meta">
                    <span><Clock size={14} aria-hidden="true" /> {s.duration_minutes} min</span>
                    <span><DollarSign size={14} aria-hidden="true" /> R$ {Number(s.price).toFixed(2).replace('.', ',')}</span>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" aria-label="Editar serviço" onClick={() => handleEdit(s)} className="owner-icon-btn owner-icon-btn--edit">
                    <Edit2 size={18} />
                  </button>
                  <button type="button" aria-label="Excluir serviço" onClick={() => handleDelete(s.id)} className="owner-icon-btn owner-icon-btn--delete">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          onClick={() => !loading && closeModal()}
          className="modal-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ds-card modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-modal-title"
          >
            <h3 className="modal-title" id="service-modal-title">{editId ? 'Editar Serviço' : 'Novo Serviço'}</h3>

            <form onSubmit={handleSave} className="auth-form">
              <div className="ds-field">
                <label className="ds-label" htmlFor="service-name">
                  Nome do Serviço
                </label>
                <input
                  id="service-name"
                  className="ds-input"
                  type="text"
                  placeholder="Ex: Corte Masculino"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="ds-field" style={{ flex: 1 }}>
                  <label className="ds-label" htmlFor="service-duration">
                    Duração (minutos)
                  </label>
                  <input
                    id="service-duration"
                    className="ds-input"
                    type="number"
                    placeholder="Ex: 30"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    required
                    min="5"
                  />
                </div>
                <div className="ds-field" style={{ flex: 1 }}>
                  <label className="ds-label" htmlFor="service-price">
                    Preço (R$)
                  </label>
                  <input
                    id="service-price"
                    className="ds-input"
                    type="number"
                    placeholder="Ex: 40.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="ds-btn ds-btn-primary ds-btn-full">
                {loading ? 'Salvando...' : (editId ? 'Atualizar Serviço' : 'Adicionar Serviço')}
              </button>
            </form>

            <button
              type="button"
              onClick={closeModal}
              disabled={loading}
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

export default ServicesManager
