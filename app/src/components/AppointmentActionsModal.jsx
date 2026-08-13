import React from 'react'
import { X, MessageCircle, RefreshCw, XCircle, CheckCircle } from 'lucide-react'
import { getAppointmentServices, getAppointmentTotal, formatBRL } from '../utils/appointmentServices'

// Modal de ações sobre um agendamento selecionado na timeline.
// Não implementa regra de negócio — apenas dispara callbacks do pai (DashboardHome).
function AppointmentActionsModal({ appointment, onClose, onReschedule, onWhatsApp, onCancel, onComplete, canComplete }) {
  if (!appointment) return null

  const statusLabel =
    appointment.status === 'canceled' ? 'Cancelado' :
    appointment.status === 'completed' ? 'Concluído' : 'Agendado'

  const allServices = getAppointmentServices(appointment)
  const totalPrice = getAppointmentTotal(appointment)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="appt-actions-modal-title">
        <div className="modal-head">
          <h2 className="modal-title" id="appt-actions-modal-title">Agendamento</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="appt-modal-line"><strong>Cliente:</strong> {appointment.clients?.full_name || '-'}</p>
          {appointment.clients?.phone && (
            <p className="appt-modal-line"><strong>Telefone:</strong> {appointment.clients.phone}</p>
          )}
          {allServices.length > 0 ? (
            allServices.map((s) => (
              <p key={s.id ?? s.name} className="appt-modal-line">
                <strong>Serviço:</strong> {s.name} ({formatBRL(s.price)})
              </p>
            ))
          ) : (
            <p className="appt-modal-line"><strong>Serviço:</strong> -</p>
          )}
          {allServices.length > 1 && (
            <p className="appt-modal-line"><strong>Total:</strong> {formatBRL(totalPrice)}</p>
          )}
          {appointment.professionals?.name && (
            <p className="appt-modal-line"><strong>Profissional:</strong> {appointment.professionals.name}</p>
          )}
          <p className="appt-modal-line">
            <strong>Horário:</strong> {appointment.appointment_date.split('-').reverse().join('/')} às {appointment.start_time.substring(0, 5)}
          </p>
          <p className="appt-modal-line"><strong>Status:</strong> {statusLabel}</p>
        </div>

        <div className="modal-actions">
          {appointment.status !== 'canceled' && (
            <button type="button" className="modal-btn modal-btn-whatsapp" onClick={() => onWhatsApp(appointment)}>
              <MessageCircle size={16} /> WhatsApp
            </button>
          )}
          {appointment.status === 'scheduled' && (
            <>
              <button type="button" className="modal-btn modal-btn-reschedule" onClick={() => onReschedule(appointment)}>
                <RefreshCw size={16} /> Reagendar
              </button>
              <button type="button" className="modal-btn modal-btn-cancel" onClick={() => onCancel(appointment.id)}>
                <XCircle size={16} /> Cancelar
              </button>
            </>
          )}
          {canComplete && (
            <button type="button" className="modal-btn modal-btn-complete" onClick={() => onComplete(appointment)}>
              <CheckCircle size={16} /> Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AppointmentActionsModal
