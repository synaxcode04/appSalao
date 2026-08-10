import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DayTimeline from '../components/DayTimeline'

afterEach(cleanup)

const workingHours = {
  start_time: '08:00:00',
  end_time: '18:00:00',
  break_start_time: null,
  break_end_time: null,
}

describe('DayTimeline — exibição de serviços', () => {
  it('exibe os dois nomes quando agendamento tem 2 serviços via appointment_services', () => {
    const appt = {
      id: '1',
      appointment_date: '2026-08-10',
      start_time: '10:00:00',
      end_time: '11:30:00',
      status: 'scheduled',
      client_id: 'c1',
      service_id: 's1',
      professional_id: null,
      clients: { full_name: 'João Silva', phone: '31999999999' },
      services: { id: 's1', name: 'Barba', price: 40, duration_minutes: 30 },
      appointment_services: [
        { service_id: 's1', services: { id: 's1', name: 'Barba', price: 40, duration_minutes: 30 } },
        { service_id: 's2', services: { id: 's2', name: 'Corte de Cabelo', price: 60, duration_minutes: 60 } },
      ],
    }

    render(
      <DayTimeline
        appointments={[appt]}
        professionals={[]}
        timeBlocks={[]}
        workingHours={workingHours}
        date="2026-08-10"
        onAppointmentClick={() => {}}
        onEmptySlotClick={() => {}}
        slotMinutes={30}
      />
    )

    expect(screen.getByText('Barba, Corte de Cabelo')).toBeTruthy()
  })

  it('exibe somente o nome singular quando agendamento é legado (sem appointment_services)', () => {
    const appt = {
      id: '2',
      appointment_date: '2026-08-10',
      start_time: '09:00:00',
      end_time: '09:30:00',
      status: 'scheduled',
      client_id: 'c2',
      service_id: 's3',
      professional_id: null,
      clients: { full_name: 'Maria Lima', phone: '31988888888' },
      services: { id: 's3', name: 'Manicure', price: 30, duration_minutes: 30 },
    }

    render(
      <DayTimeline
        appointments={[appt]}
        professionals={[]}
        timeBlocks={[]}
        workingHours={workingHours}
        date="2026-08-10"
        onAppointmentClick={() => {}}
        onEmptySlotClick={() => {}}
        slotMinutes={30}
      />
    )

    expect(screen.getByText('Manicure')).toBeTruthy()
  })
})
