import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendPushNotification } from '../utils/notification'

describe('sendPushNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockFetchOk = () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
  }

  it('new_appointment envia para owner (recipientRole=owner no payload)', async () => {
    mockFetchOk()
    await sendPushNotification('new_appointment', 'owner-uid-1', 'Novo Agendamento', 'Cliente agendou.')
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('new_appointment')
    expect(body.targetExternalId).toBe('owner-uid-1')
  })

  it('client_canceled envia para owner (recipientRole=owner no payload)', async () => {
    mockFetchOk()
    await sendPushNotification('client_canceled', 'owner-uid-2', 'Cancelado', 'Cliente cancelou.')
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('client_canceled')
    expect(body.targetExternalId).toBe('owner-uid-2')
  })

  it('owner_canceled envia para client (recipientRole=client no payload)', async () => {
    mockFetchOk()
    await sendPushNotification('owner_canceled', 'client-uid-1', 'Cancelado pelo salão', 'O salão cancelou.')
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('owner_canceled')
    expect(body.targetExternalId).toBe('client-uid-1')
  })

  it('client_rescheduled envia para owner (recipientRole=owner no payload)', async () => {
    mockFetchOk()
    await sendPushNotification('client_rescheduled', 'owner-uid-3', 'Reagendado', 'Cliente reagendou.')
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('client_rescheduled')
    expect(body.targetExternalId).toBe('owner-uid-3')
  })

  it('owner_rescheduled envia para client (recipientRole=client no payload)', async () => {
    mockFetchOk()
    await sendPushNotification('owner_rescheduled', 'client-uid-2', 'Reagendado pelo salão', 'O salão reagendou.')
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('owner_rescheduled')
    expect(body.targetExternalId).toBe('client-uid-2')
  })

  it('completed_by_owner envia para client (recipientRole=client no payload)', async () => {
    mockFetchOk()
    await sendPushNotification('completed_by_owner', 'client-uid-3', 'Concluído', 'Serviço concluído pelo salão.')
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('completed_by_owner')
    expect(body.targetExternalId).toBe('client-uid-3')
  })

  it('new_review envia para owner (recipientRole=owner no payload)', async () => {
    mockFetchOk()
    await sendPushNotification('new_review', 'owner-uid-5', 'Nova Avaliação', 'Você recebeu uma avaliação.')
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('new_review')
    expect(body.targetExternalId).toBe('owner-uid-5')
  })

  it('evento inválido retorna null sem chamar a API quando o servidor rejeita com 400', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Evento desconhecido' }),
    })
    const result = await sendPushNotification('evento_inexistente', 'user-x', 'Título', 'Mensagem')
    expect(result).toBeNull()
    expect(fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.event).toBe('evento_inexistente')
  })
})
