import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import toast from 'react-hot-toast'

const EMPTY_FORM = {
  block_date: '',
  start_time: '09:00',
  end_time: '10:00',
  professional_id: '',
  reason: ''
}

function TimeBlocksManager() {
  const [salonId, setSalonId] = useState(null)
  const [professionals, setProfessionals] = useState([])
  const [blocks, setBlocks] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: salonData } = await supabase
          .from('salons')
          .select('id')
          .eq('owner_id', user.id)
          .single()

        if (salonData && mounted) {
          setSalonId(salonData.id)
          await loadProfessionals(salonData.id, mounted)
          await loadBlocks(salonData.id, mounted)
        }
      }
      if (mounted) setLoading(false)
    }

    init()

    return () => { mounted = false }
  }, [])

  const loadProfessionals = async (sId, mounted = true) => {
    const { data } = await supabase
      .from('professionals')
      .select('id, name')
      .eq('salon_id', sId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (data && mounted) setProfessionals(data)
  }

  const loadBlocks = async (sId, mounted = true) => {
    const { data } = await supabase
      .from('time_blocks')
      .select('*')
      .eq('salon_id', sId)
      .order('block_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (data && mounted) setBlocks(data)
  }

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const professionalName = (id) => {
    if (!id) return 'Todos os profissionais'
    const prof = professionals.find(p => p.id === id)
    return prof ? prof.name : 'Profissional removido'
  }

  const formatDate = (isoDate) => {
    // isoDate vem como 'YYYY-MM-DD' (DATE puro, sem timezone) — split manual evita
    // deslocamento de fuso ao passar por new Date().
    if (!isoDate) return ''
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!salonId) return

    if (!form.block_date) {
      toast.error('Informe a data do bloqueio.')
      return
    }
    if (form.end_time <= form.start_time) {
      toast.error('A hora de fim deve ser maior que a hora de início.')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('time_blocks').insert([{
      salon_id: salonId,
      professional_id: form.professional_id || null,
      block_date: form.block_date,
      start_time: form.start_time,
      end_time: form.end_time,
      reason: form.reason.trim() || null
    }])

    if (error) {
      toast.error('Erro ao criar bloqueio: ' + error.message)
    } else {
      toast.success('Bloqueio criado com sucesso!')
      setForm(EMPTY_FORM)
      await loadBlocks(salonId)
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('time_blocks').delete().eq('id', id)
    if (error) {
      toast.error('Erro ao excluir bloqueio: ' + error.message)
    } else {
      toast.success('Bloqueio removido.')
      setBlocks(prev => prev.filter(b => b.id !== id))
    }
  }

  if (loading) return <div>Carregando...</div>

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Bloqueios de Horário</h1>
        <p className="subtitle">
          Bloqueie horários pontuais (folgas, feriados, manutenção). O período bloqueado
          não fica disponível para agendamento.
        </p>
      </header>

      {/* Formulário de novo bloqueio */}
      <div className="ds-card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Novo bloqueio</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label htmlFor="block-date" style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Data</label>
              <input
                id="block-date"
                type="date"
                value={form.block_date}
                onChange={(e) => handleChange('block_date', e.target.value)}
                className="auth-form input"
                style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label htmlFor="block-start" style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Hora início</label>
              <input
                id="block-start"
                type="time"
                value={form.start_time}
                onChange={(e) => handleChange('start_time', e.target.value)}
                className="auth-form input"
                style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label htmlFor="block-end" style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Hora fim</label>
              <input
                id="block-end"
                type="time"
                value={form.end_time}
                onChange={(e) => handleChange('end_time', e.target.value)}
                className="auth-form input"
                style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="block-professional" style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Profissional</label>
            <select
              id="block-professional"
              value={form.professional_id}
              onChange={(e) => handleChange('professional_id', e.target.value)}
              className="auth-form input"
              style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
            >
              <option value="">Todos os profissionais</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="block-reason" style={{ fontSize: '0.8rem', color: 'var(--ds-text-2)' }}>Motivo (opcional)</label>
            <input
              id="block-reason"
              type="text"
              value={form.reason}
              onChange={(e) => handleChange('reason', e.target.value)}
              placeholder="Ex: Folga, Feriado, Manutenção"
              className="auth-form input"
              style={{ padding: '0.5rem', width: '100%', marginTop: '0.2rem' }}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="ds-btn ds-btn-primary ds-btn-full"
            style={{ padding: '0.8rem', fontSize: '1rem' }}
          >
            {saving ? 'Salvando...' : 'Adicionar bloqueio'}
          </button>
        </form>
      </div>

      {/* Lista de bloqueios existentes */}
      <div className="ds-card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Bloqueios cadastrados</h2>

        {blocks.length === 0 ? (
          <p style={{ color: 'var(--ds-text-2)', fontSize: '0.9rem' }}>
            Nenhum bloqueio cadastrado.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {blocks.map(block => (
              <div
                key={block.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1rem',
                  border: '1px solid var(--ds-surface-2)',
                  borderRadius: 'var(--ds-radius-md)',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>
                    {formatDate(block.block_date)} · {block.start_time.substring(0, 5)} — {block.end_time.substring(0, 5)}
                  </p>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--ds-text-2)' }}>
                    {professionalName(block.professional_id)}
                    {block.reason ? ` · ${block.reason}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(block.id)}
                  className="ds-btn ds-btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TimeBlocksManager
