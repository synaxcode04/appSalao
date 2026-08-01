import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { Trash2, Edit2 } from 'lucide-react'

function ServicesManager() {
  const [salonId, setSalonId] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  // Form states
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('')
  const [price, setPrice] = useState('')

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
      .order('created_at', { ascending: false })
    
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

    // Reset Form
    setEditId(null)
    setName('')
    setDuration('')
    setPrice('')
    
    // Reload list
    await loadServices(salonId)
    setLoading(false)
  }

  const handleEdit = (service) => {
    setEditId(service.id)
    setName(service.name)
    setDuration(service.duration_minutes)
    setPrice(service.price)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
        <p className="subtitle">Gerencie os cortes, barbas e outros serviços.</p>
      </header>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>{editId ? 'Editar Serviço' : 'Novo Serviço'}</h3>
        <form onSubmit={handleSave} className="auth-form" style={{ marginTop: '1rem' }}>
          <input 
            type="text" 
            placeholder="Nome do Serviço (ex: Corte Masculino)" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            required 
          />
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input 
              type="number" 
              placeholder="Duração (minutos)" 
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required 
              min="5"
            />
            <input 
              type="number" 
              placeholder="Preço (R$)" 
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required 
              min="0"
              step="0.01"
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Salvando...' : (editId ? 'Atualizar Serviço' : 'Adicionar Serviço')}
            </button>
            {editId && (
              <button 
                type="button" 
                className="btn-outline" 
                onClick={() => {
                  setEditId(null)
                  setName('')
                  setDuration('')
                  setPrice('')
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Seus Serviços</h3>
        {services.length === 0 ? (
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Nenhum serviço cadastrado ainda.</p>
        ) : (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {services.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <h4 style={{ color: 'var(--dark-green)' }}>{s.name}</h4>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    ⏱ {s.duration_minutes} min | 💰 R$ {Number(s.price).toFixed(2).replace('.', ',')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => handleEdit(s)} style={{ padding: '0.5rem', color: 'var(--primary-green)', backgroundColor: 'var(--light-green)', borderRadius: 'var(--radius-md)' }}>
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(s.id)} style={{ padding: '0.5rem', color: '#d32f2f', backgroundColor: '#ffebee', borderRadius: 'var(--radius-md)' }}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ServicesManager
