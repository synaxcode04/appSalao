import { describe, it, expect, vi, beforeEach } from 'vitest'

// process.env deve ser definido antes do import do handler
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

// Mock createClient antes de importar o handler
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'
import handler from '../../api/client-identity.js'

// Cria uma chain fluente que se resolve como { data, error } ao ser aguardada
function makeChain(data, error = null) {
  const result = { data, error }
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  return chain
}

// from() que entrega as chains de 'clients' na ordem em que o handler as consome
// (guarda de posse → checagem de unicidade → UPDATE). Outras tabelas caem no fallback.
function makeFrom(clientsChains) {
  const queue = [...clientsChains]
  return (table) => {
    if (table === 'clients') {
      return queue.shift() || makeChain(null)
    }
    return makeChain(null)
  }
}

// Helper para criar req e res simulados
function makeReq(body) {
  return { method: 'POST', headers: {}, body }
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code
      return res
    },
    json(data) {
      res.body = data
      return res
    },
  }
  return res
}

// ──────────────────────────────────────────────────────────────────────────────
// AÇÃO: update — edição do perfil do cliente (nome, WhatsApp, nascimento, foto)
// Contrato: { action:'update', client_id (obrig), current_phone (obrig, prova de
// posse), full_name?, phone?, birth_date?, avatar_base64? (data URL) }
// ──────────────────────────────────────────────────────────────────────────────

describe('update — edição do perfil do cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sem client_id retorna 400', async () => {
    vi.mocked(createClient).mockReturnValue({ from: () => makeChain(null) })

    const req = makeReq({ action: 'update', current_phone: '11999999999', full_name: 'Novo Nome' })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('client_id is required')
  })

  it('sem current_phone retorna 400', async () => {
    vi.mocked(createClient).mockReturnValue({ from: () => makeChain(null) })

    const req = makeReq({ action: 'update', client_id: 'client1', full_name: 'Novo Nome' })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('current_phone is required for update action')
  })

  it('current_phone que NÃO bate com o phone do registro retorna 403', async () => {
    // Guarda de posse: cliente existe, mas o telefone informado não confere.
    const guardChain = makeChain({ phone: '11999999999' })

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([guardChain]),
    })

    const req = makeReq({
      action: 'update',
      client_id: 'client1',
      current_phone: '11888888888',
      full_name: 'Tentativa',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Sem permissão')
  })

  it('cliente inexistente na guarda de posse retorna 404', async () => {
    // PGRST116 = nenhuma linha → cliente não encontrado.
    const guardChain = makeChain(null, { code: 'PGRST116', message: 'no rows' })

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([guardChain]),
    })

    const req = makeReq({
      action: 'update',
      client_id: 'inexistente',
      current_phone: '11999999999',
      full_name: 'X',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Cliente não encontrado')
  })

  it('válido (current_phone bate) com apenas full_name chama UPDATE com { full_name } e retorna 200 { client }', async () => {
    const updatedClient = {
      id: 'client1',
      phone: '11999999999',
      full_name: 'Novo Nome',
      birth_date: null,
      avatar_url: null,
    }

    const guardChain = makeChain({ phone: '11999999999' })
    let updatePayload = null
    const updateChain = makeChain(updatedClient)
    updateChain.update = vi.fn((payload) => {
      updatePayload = payload
      return updateChain
    })

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([guardChain, updateChain]),
    })

    const req = makeReq({
      action: 'update',
      client_id: 'client1',
      current_phone: '(11) 99999-9999',
      full_name: 'Novo Nome',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.client).toEqual(updatedClient)
    // Apenas full_name deve compor o UPDATE — sem phone/birth_date/avatar_url.
    expect(updatePayload).toEqual({ full_name: 'Novo Nome' })
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'client1')
  })

  it('trocando phone para número já usado por OUTRO client_id retorna 409 e não faz UPDATE', async () => {
    const guardChain = makeChain({ phone: '11999999999' })
    // Checagem de unicidade encontra um cliente com esse telefone cujo id difere.
    const uniquenessChain = makeChain({ id: 'outro-cliente' })
    const updateChain = makeChain(null)

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([guardChain, uniquenessChain, updateChain]),
    })

    const req = makeReq({
      action: 'update',
      client_id: 'client1',
      current_phone: '11999999999',
      phone: '(11) 98888-7777',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body.error).toBe('Telefone já está em uso por outro cliente')
    // Não deve prosseguir para o UPDATE.
    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it('avatar_base64 como data URL: faz upload apenas da parte após a vírgula e grava avatar_url', async () => {
    const publicUrl = 'https://test.supabase.co/storage/v1/object/public/client-avatars/client1.jpg'

    const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'client1.jpg' }, error: null })
    const getPublicUrlMock = vi.fn().mockReturnValue({ data: { publicUrl } })
    const storageFromMock = vi.fn().mockReturnValue({
      upload: uploadMock,
      getPublicUrl: getPublicUrlMock,
    })

    const guardChain = makeChain({ phone: '11999999999' })
    let updatePayload = null
    const updateChain = makeChain({
      id: 'client1', phone: '11999999999', full_name: 'Nome', birth_date: null, avatar_url: publicUrl,
    })
    updateChain.update = vi.fn((payload) => {
      updatePayload = payload
      return updateChain
    })

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([guardChain, updateChain]),
      storage: { from: storageFromMock },
    })

    // Parte base64 = "hello". Prefixo data URL NÃO deve entrar no buffer.
    const base64Payload = 'aGVsbG8='
    const req = makeReq({
      action: 'update',
      client_id: 'client1',
      current_phone: '11999999999',
      avatar_base64: `data:image/jpeg;base64,${base64Payload}`,
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    // Upload no bucket correto, caminho {client_id}.{ext} (jpeg → jpg).
    expect(storageFromMock).toHaveBeenCalledWith('client-avatars')
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const [uploadPath, uploadBuffer, uploadOpts] = uploadMock.mock.calls[0]
    expect(uploadPath).toBe('client1.jpg')
    expect(Buffer.isBuffer(uploadBuffer)).toBe(true)
    expect(uploadOpts.upsert).toBe(true)
    // O buffer deve conter só a parte decodificada ("hello"), sem o prefixo data URL.
    expect(uploadBuffer.toString('utf-8')).toBe('hello')
    expect(uploadBuffer.equals(Buffer.from(base64Payload, 'base64'))).toBe(true)
    // A URL pública derivada vai para o UPDATE e para a resposta.
    expect(getPublicUrlMock).toHaveBeenCalledWith('client1.jpg')
    expect(updatePayload).toEqual({ avatar_url: publicUrl })
    expect(res.body.client.avatar_url).toBe(publicUrl)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Regressão de contrato: ação desconhecida continua retornando 400
// ──────────────────────────────────────────────────────────────────────────────

describe('ação desconhecida — não regride o comportamento existente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('action inválida retorna 400 Invalid or missing action', async () => {
    vi.mocked(createClient).mockReturnValue({ from: () => makeChain(null) })

    const req = makeReq({ action: 'frobnicate', client_id: 'client1' })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Invalid or missing action')
  })

  it('sem action retorna 400', async () => {
    vi.mocked(createClient).mockReturnValue({ from: () => makeChain(null) })

    const req = makeReq({ client_id: 'client1' })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Invalid or missing action')
  })
})
