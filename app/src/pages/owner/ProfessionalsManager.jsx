import React, { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { Users, Plus, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

function ProfessionalsManager() {
  const { salon } = useOutletContext()
  const [professionals, setProfessionals] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (salon) fetchProfessionals()
  }, [salon])

  const fetchProfessionals = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('professionals')
      .select('*')
      .eq('salon_id', salon.id)
      .order('created_at', { ascending: false })

    if (data) setProfessionals(data)
    setLoading(false)
  }

  const handleAddProfessional = async (e) => {
    e.preventDefault()
    if (!newName) return

    setIsSubmitting(true)
    const { error } = await supabase.from('professionals').insert([{
      salon_id: salon.id,
      name: newName,
      is_active: true
    }])

    setIsSubmitting(false)
    if (error) {
      toast.error('Erro ao adicionar profissional: ' + error.message)
    } else {
      setNewName('')
      fetchProfessionals()
      toast.success('Profissional cadastrado com sucesso!')
    }
  }

  const toggleActive = async (prof) => {
    const { error } = await supabase
      .from('professionals')
      .update({ is_active: !prof.is_active })
      .eq('id', prof.id)

    if (!error) {
      fetchProfessionals()
    } else {
      toast.error('Erro ao atualizar status: ' + error.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este profissional? Agendamentos vinculados a ele podem ser afetados.')) return
    
    const { error } = await supabase.from('professionals').delete().eq('id', id)
    if (!error) {
      fetchProfessionals()
    } else {
      toast.error('Erro ao excluir profissional: ' + error.message)
    }
  }

  if (!salon) return <div>Carregando...</div>

  return (
    <div className="page-content">
      <header className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <Users size={28} color="var(--primary-green)" />
          Gerenciar Profissionais
        </h1>
        <p className="subtitle">Cadastre os profissionais do seu salão para permitir agendas independentes.</p>
      </header>

      {/* Formulário de Adição */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'var(--bg-color)' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Adicionar Novo Profissional</h2>
        <form onSubmit={handleAddProfessional} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Nome do Profissional</label>
            <input 
              type="text" 
              placeholder="Ex: João Silva" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ height: '45px', padding: '0 1.5rem' }}>
            {isSubmitting ? 'Adicionando...' : <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Plus size={18} /> Adicionar</span>}
          </button>
        </form>
      </div>

      {/* Lista de Profissionais */}
      <div>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Profissionais Cadastrados</h2>
        
        {loading ? (
          <p>Carregando profissionais...</p>
        ) : professionals.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Nenhum profissional cadastrado.</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Adicione o primeiro profissional usando o formulário acima.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {professionals.map(prof => (
              <div key={prof.id} className="card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem', opacity: prof.is_active ? 1 : 0.6 }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{prof.name}</h3>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <button 
                    onClick={() => toggleActive(prof)}
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '0.4rem', 
                      padding: '0.4rem 0.8rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      backgroundColor: prof.is_active ? 'var(--light-green)' : '#ffebee',
                      color: prof.is_active ? 'var(--dark-green)' : '#d32f2f',
                      fontWeight: 'bold', fontSize: '0.85rem'
                    }}
                  >
                    {prof.is_active ? <><CheckCircle size={16} /> Ativo</> : <><XCircle size={16} /> Inativo</>}
                  </button>

                  <button 
                    onClick={() => handleDelete(prof.id)}
                    style={{ background: 'transparent', border: 'none', color: '#d32f2f', cursor: 'pointer', padding: '0.4rem' }}
                    title="Excluir"
                  >
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

export default ProfessionalsManager
