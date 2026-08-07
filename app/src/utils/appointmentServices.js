// Helpers de exibição dos serviços de um agendamento.
//
// A API grava N linhas em `appointment_services` (tabela de junção) quando o
// agendamento tem 2+ serviços, e mantém `appointments.service_id` apontando só
// para o 1º (coluna NOT NULL legada). As queries de cliente já retornam o array
// `appointment_services(services(...))` populado. Estes helpers normalizam a
// exibição: usam o array quando presente e caem no campo singular `services`
// (agendamentos legados, sem linhas na junção) como fallback.

export const getAppointmentServices = (appt) => {
  const joinRows = Array.isArray(appt?.appointment_services)
    ? appt.appointment_services
    : []

  const fromJoin = joinRows
    .map((row) => row?.services)
    .filter(Boolean)
    .map((s) => ({ id: s.id, name: s.name, price: Number(s.price) || 0 }))

  if (fromJoin.length > 0) return fromJoin

  // Fallback legado: campo singular do serviço primário.
  if (appt?.services) {
    return [{
      id: appt.services.id,
      name: appt.services.name,
      price: Number(appt.services.price) || 0,
    }]
  }

  return []
}

export const getAppointmentTotal = (appt) =>
  getAppointmentServices(appt).reduce((sum, s) => sum + (Number(s.price) || 0), 0)

export const formatBRL = (value) =>
  `R$ ${(Number(value) || 0).toFixed(2).replace('.', ',')}`
