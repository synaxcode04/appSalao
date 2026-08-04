// Soma o preço de todos os serviços do agendamento.
// Usa appointment_services quando disponível (multi-serviço); cai em services.price para
// agendamentos legados de serviço único.
export function sumAppointmentRevenue(appt) {
  if (appt.appointment_services && appt.appointment_services.length > 0) {
    return appt.appointment_services.reduce((sum, as) => sum + Number(as.services?.price || 0), 0)
  }
  return Number(appt.services?.price || 0)
}

export function computeStats(appointments, todayStr) {
  const todayAppointments = appointments.filter(a => a.appointment_date === todayStr)
  const upcomingAppointments = appointments.filter(a => a.appointment_date !== todayStr)
  return {
    todayCount: todayAppointments.length,
    upcoming: upcomingAppointments.length,
    upcomingRevenue: upcomingAppointments.reduce((acc, curr) => acc + sumAppointmentRevenue(curr), 0),
    estimatedRevenue: todayAppointments.reduce((acc, curr) => acc + sumAppointmentRevenue(curr), 0),
    realRevenue: todayAppointments.filter(a => a.status === 'completed').reduce((acc, curr) => acc + sumAppointmentRevenue(curr), 0),
  }
}
