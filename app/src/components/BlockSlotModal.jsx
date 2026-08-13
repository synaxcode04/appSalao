import React, { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

// "HH:MM:SS"/"HH:MM" -> "HH:MM" (valor aceito pelo input type=time)
function toTimeInput(value) {
  return value ? value.substring(0, 5) : '09:00'
}

// Adiciona 1h a "HH:MM" para sugerir o fim do bloqueio.
function plusOneHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const nh = (h + 1) % 24
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Modal de bloqueio pontual. Insere em time_blocks via supabase client (dono tem sessão Auth real).
// Pré-preenche a partir do slot clicado na timeline.
function BlockSlotModal({ salonId, professionals, prefill, onClose, onSaved }) {
  const initialStart = toTimeInput(prefill?.startTime)
  const [blockDate] = useState(prefill?.date || '')
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(plusOneHour(initialStart))
  const [professionalId, setProfessionalId] = useState(prefill?.professionalId || '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const professionalLabel = () => {
    if (!professionalId) return 'Todos os profissionais'
    const prof = professionals.find(p => p.id === professionalId)
    return prof ? prof.name : 'Todos os profissionais'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!blockDate) {
      toast.error('Data do bloqueio ausente.')
      return
    }
    if (endTime <= startTime) {
      toast.error('A hora de fim deve ser maior que a hora de início.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('time_blocks').insert([{
      salon_id: salonId,
      professional_id: professionalId || null,
      block_date: blockDate,
      start_time: startTime,
      end_time: endTime,
      reason: reason.trim() || null
    }])

    if (error) {
      toast.error('Erro ao criar bloqueio: ' + error.message)
      setSaving(false)
      return
    }
    toast.success('Horário bloqueado!')
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="block-slot-modal-title">
        <div className="modal-head">
          <h2 className="modal-title" id="block-slot-modal-title">Bloquear horário</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body block-form">
          <p className="appt-modal-line">
            <strong>Data:</strong> {blockDate ? blockDate.split('-').reverse().join('/') : '-'}
          </p>
          <p className="appt-modal-line"><strong>Profissional:</strong> {professionalLabel()}</p>

          <div className="block-form-row">
            <div className="block-form-field">
              <label className="block-form-label">Início</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="block-form-field">
              <label className="block-form-label">Fim</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>
          </div>

          <div className="block-form-field">
            <label className="block-form-label">Profissional</label>
            <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
              <option value="">Todos os profissionais</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="block-form-field">
            <label className="block-form-label">Motivo (opcional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Folga, Feriado, Manutenção"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="modal-btn modal-btn-reschedule" disabled={saving}>
              {saving ? 'Salvando...' : 'Bloquear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BlockSlotModal
