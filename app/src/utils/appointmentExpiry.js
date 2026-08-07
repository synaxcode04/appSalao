// Regra de expiração de agendamento na agenda ativa do cliente.
//
// Um agendamento 'scheduled' some da agenda ativa 15 minutos após o seu
// horário de início e passa a viver no histórico — sem alterar o status no
// banco (continua 'scheduled'; é só apresentação/filtro).
//
// O horário do agendamento é montado no fuso LOCAL a partir de
// `appointment_date` + `start_time` — nunca via toISOString/UTC, que já causou
// inconsistência de fuso no código antigo.

export const EXPIRY_GRACE_MS = 15 * 60 * 1000

export const isAppointmentExpired = (appt, now = new Date()) => {
  if (!appt || appt.status !== 'scheduled') return false
  if (!appt.appointment_date || !appt.start_time) return false

  const startLocal = new Date(`${appt.appointment_date}T${appt.start_time}`)
  if (Number.isNaN(startLocal.getTime())) return false

  return now.getTime() > startLocal.getTime() + EXPIRY_GRACE_MS
}
