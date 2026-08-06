import React, { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabase'
import { Users, Plus, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

function ProfessionalsManager() {
  const { salon } = useOutletContext()
  const [professionals, setProfessionals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form states
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState('')

  const resetForm = () => {
    setEditId(null)
    setName('')
  }

  const closeModal = () => {
    setModalOpen(false)
    resetForm()
  }

  useEffect(() => {
    if (salon) fetchProfessionals()
  }, [salon])

  const fetchProfessionals = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('professionals')
      .select('*')
      .eq('salon_id', salon.id)
      .order('created_at', { ascending: false })

    if (data) setProfessionals(data)
    setLoading(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!name || !salon) return

    setIsSubmitting(true)

    let error
    if (editId) {
      ({ error } = await supabase
        .from('professionals')
        .update({ name })
        .eq('id', editId)
        .eq('salon_id', salon.id))
    } else {
      ({ error } = await supabase
        .from('professionals')
        .insert([{
          salon_id: salon.id,
          name,
          is_active: true
        }]))
    }

    setIsSubmitting(false)
    if (error) {
      toast.error('Erro ao salvar profissional: ' + error.message)
    } else {
      resetForm()
      setModalOpen(false)
      fetchProfessionals()
      toast.success(editId ? 'Profissional atualizado com sucesso!' : 'Profissional cadastrado com sucesso!')
    }
  }

  const handleEdit = (prof) => {
    setEditId(prof.id)
    setName(prof.name)
    setModalOpen(true)
  }

  const toggleActive = async (prof) => {
    const { error } = await supabase
      .from('professionals')
      .update({ is_active: !prof.is_active })
      .eq('id', prof.id)
      .eq('salon_id', salon.id)

    if (!error) {
      fetchProfessionals()
    } else {
      toast.error('Erro ao atualizar status: ' + error.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este profissional? Agendamentos vinculados a ele podem ser afetados.')) return

    const { error } = await supabase.from('professionals').delete().eq('id', id).eq('salon_id', salon.id)
    if (!error) {
      fetchProfessionals()
    } else {
      toast.error('Erro ao excluir profissional: ' + error.message)
    }
  }

  if (!salon) return <div>Carregando...</div>

  return (
    <div className="page-content">
      <header className="page-header professionals-header">
        <h1 className="professionals-title">
          <Users size={28} color="var(--primary-green)" />
          Gerenciar Profissionais
        </h1>
        <p className="subtitle">Cadastre os profissionais do seu salão para permitir agendas independentes.</p>
      </header>

      <button
        type="button"
        className="btn-primary professionals-toolbar"
        onClick={() => {
          resetForm()
          setModalOpen(true)
        }}
      >
        <Plus size={18} />
        Novo Profissional
      </button>

      {/* Lista de Profissionais */}
      <div>
        <h2 className="professionals-list-title">Profissionais Cadastrados</h2>

        {loading ? (
          <p>Carregando profissionais...</p>
        ) : professionals.length === 0 ? (
          <div className="card professionals-empty">
            <p className="professionals-empty-title">Nenhum profissional cadastrado.</p>
            <p className="professionals-empty-hint">Adicione o primeiro profissional usando o botão acima.</p>
          </div>
        ) : (
          <div className="professionals-grid">
            {professionals.map(prof => (
              <div key={prof.id} className="card professional-card" style={{ opacity: prof.is_active ? 1 : 0.6 }}>
                <div>
                  <h3 className="professional-card-name">{prof.name}</h3>
                </div>

                <div className="professional-card-actions">
                  <button
                    onClick={() => toggleActive(prof)}
                    className="professional-toggle"
                    style={{
                      backgroundColor: prof.is_active ? 'var(--light-green)' : '#ffebee',
                      color: prof.is_active ? 'var(--dark-green)' : '#d32f2f'
                    }}
                  >
                    {prof.is_active ? <><CheckCircle size={16} /> Ativo</> : <><XCircle size={16} /> Inativo</>}
                  </button>

                  <div className="professional-card-icons">
                    <button
                      onClick={() => handleEdit(prof)}
                      className="professional-icon-btn professional-icon-edit"
                      title="Editar"
                    >
                      <Edit2 size={18} />
                    </button>

                    <button
                      onClick={() => handleDelete(prof.id)}
                      className="professional-icon-btn professional-icon-delete"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          onClick={() => !isSubmitting && closeModal()}
          className="modal-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card modal-card"
          >
            <h3 className="modal-title">{editId ? 'Editar Profissional' : 'Novo Profissional'}</h3>

            <form onSubmit={handleSave} className="auth-form">
              <div>
                <label className="professional-form-label">
                  Nome do Profissional
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? 'Salvando...' : (editId ? 'Atualizar Profissional' : 'Adicionar Profissional')}
              </button>
            </form>

            <button
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
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

export default ProfessionalsManager
