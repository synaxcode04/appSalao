import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import AppointmentActionsModal from '../components/AppointmentActionsModal'

afterEach(cleanup)

const baseAppt = {
  id: '1',
  appointment_date: '2026-08-10',
  start_time: '10:00:00',
  end_time: '11:30:00',
  status: 'scheduled',
  client_id: 'c1',
  service_id: 's1',
  professional_id: null,
  clients: { full_name: 'João Silva', phone: '31999999999' },
  professionals: null,
}

describe('AppointmentActionsModal — exibição de serviços', () => {
  it('lista os dois serviços e exibe o total quando agendamento tem 2 serviços', () => {
    const appt = {
      ...baseAppt,
      services: { id: 's1', name: 'Barba', price: 40, duration_minutes: 30 },
      appointment_services: [
        { service_id: 's1', services: { id: 's1', name: 'Barba', price: 40, duration_minutes: 30 } },
        { service_id: 's2', services: { id: 's2', name: 'Corte de Cabelo', price: 60, duration_minutes: 60 } },
      ],
    }

    render(
      <AppointmentActionsModal
        appointment={appt}
        onClose={vi.fn()}
        onReschedule={vi.fn()}
        onWhatsApp={vi.fn()}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        canComplete={false}
      />
    )

    expect(screen.getByText(/Barba/)).toBeTruthy()
    expect(screen.getByText(/Corte de Cabelo/)).toBeTruthy()
    // preços individuais
    expect(screen.getByText(/R\$ 40,00/)).toBeTruthy()
    expect(screen.getByText(/R\$ 60,00/)).toBeTruthy()
    // total
    expect(screen.getByText(/R\$ 100,00/)).toBeTruthy()
  })

  it('exibe o serviço único e seu preço quando agendamento é legado', () => {
    const appt = {
      ...baseAppt,
      services: { id: 's3', name: 'Manicure', price: 30, duration_minutes: 30 },
    }

    render(
      <AppointmentActionsModal
        appointment={appt}
        onClose={vi.fn()}
        onReschedule={vi.fn()}
        onWhatsApp={vi.fn()}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        canComplete={false}
      />
    )

    expect(screen.getByText(/Manicure/)).toBeTruthy()
    expect(screen.getByText(/R\$ 30,00/)).toBeTruthy()
    // não deve exibir "Total" quando há só 1 serviço
    expect(screen.queryByText(/Total/)).toBeNull()
  })
})
