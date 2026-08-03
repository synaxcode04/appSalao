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
// AÇÃO: lookup — procura cliente por telefone
// ──────────────────────────────────────────────────────────────────────────────

describe('lookup — procura cliente por telefone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cliente não encontrado (telefone inexistente) retorna 404', async () => {
    const chain = makeChain(null, { code: 'PGRST116', message: 'no rows' })

    vi.mocked(createClient).mockReturnValue({
      from: () => chain,
    })

    const req = makeReq({ action: 'lookup', phone: '11999999999' })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Cliente não encontrado')
    expect(res.body.client).toBeNull()
  })

  it('cliente encontrado retorna 200 com { client } contendo id, phone, full_name, birth_date, avatar_url, created_at', async () => {
    const clientData = {
      id: 'client1',
      phone: '11999999999',
      full_name: 'João Silva',
      birth_date: '1990-05-15',
      avatar_url: 'https://test.supabase.co/storage/v1/object/public/client-avatars/client1.jpg',
      created_at: '2026-08-01T10:00:00Z',
    }

    const chain = makeChain(clientData)

    vi.mocked(createClient).mockReturnValue({
      from: () => chain,
    })

    const req = makeReq({ action: 'lookup', phone: '(11) 99999-9999' })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.client).toEqual(clientData)
    // Confirma que o select incluiu todos os campos esperados
    expect(res.body.client).toHaveProperty('id')
    expect(res.body.client).toHaveProperty('phone')
    expect(res.body.client).toHaveProperty('full_name')
    expect(res.body.client).toHaveProperty('birth_date')
    expect(res.body.client).toHaveProperty('avatar_url')
    expect(res.body.client).toHaveProperty('created_at')
  })

  it('select() chamado com birth_date e avatar_url no lookup', async () => {
    const clientData = {
      id: 'client1',
      phone: '11999999999',
      full_name: 'Test',
      birth_date: '1990-01-01',
      avatar_url: 'https://example.com/avatar.jpg',
      created_at: '2026-08-01T10:00:00Z',
    }

    const chain = makeChain(clientData)
    const selectSpy = vi.spyOn(chain, 'select')

    vi.mocked(createClient).mockReturnValue({
      from: () => chain,
    })

    const req = makeReq({ action: 'lookup', phone: '11999999999' })
    const res = makeRes()
    await handler(req, res)

    expect(selectSpy).toHaveBeenCalledWith('id, phone, full_name, birth_date, avatar_url, created_at')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// AÇÃO: create_or_get — UPSERT de cliente
// ──────────────────────────────────────────────────────────────────────────────

describe('create_or_get — UPSERT de cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cliente já existe retorna 200 { client, created: false } com id, phone, full_name, birth_date, avatar_url, created_at', async () => {
    const existingClient = {
      id: 'client1',
      phone: '11999999999',
      full_name: 'João Silva',
      birth_date: '1990-05-15',
      avatar_url: 'https://test.supabase.co/storage/v1/object/public/client-avatars/client1.jpg',
      created_at: '2026-08-01T10:00:00Z',
    }

    const lookupChain = makeChain(existingClient)

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([lookupChain]),
    })

    const req = makeReq({
      action: 'create_or_get',
      phone: '(11) 99999-9999',
      full_name: 'João Silva',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.client).toEqual(existingClient)
    expect(res.body.created).toBe(false)
    expect(res.body.client).toHaveProperty('birth_date')
    expect(res.body.client).toHaveProperty('avatar_url')
  })

  it('cliente não existe, cria novo e retorna 201 { client, created: true } com id, phone, full_name, birth_date, avatar_url, created_at', async () => {
    const newClient = {
      id: 'new-client-id',
      phone: '11999999999',
      full_name: 'Maria Santos',
      birth_date: '1992-03-20',
      avatar_url: null,
      created_at: '2026-08-03T10:00:00Z',
    }

    const lookupChain = makeChain(null, { code: 'PGRST116' })
    const insertChain = makeChain(newClient)

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([lookupChain, insertChain]),
    })

    const req = makeReq({
      action: 'create_or_get',
      phone: '11999999999',
      full_name: 'Maria Santos',
      birth_date: '1992-03-20',
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(201)
    expect(res.body.client).toEqual(newClient)
    expect(res.body.created).toBe(true)
    expect(res.body.client).toHaveProperty('birth_date')
    expect(res.body.client).toHaveProperty('avatar_url')
  })

  it('lookup select() chamado com birth_date e avatar_url', async () => {
    const existingClient = {
      id: 'client1',
      phone: '11999999999',
      full_name: 'Test',
      birth_date: '1990-01-01',
      avatar_url: 'https://example.com/avatar.jpg',
      created_at: '2026-08-01T10:00:00Z',
    }

    const lookupChain = makeChain(existingClient)
    const selectSpy = vi.spyOn(lookupChain, 'select')

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([lookupChain]),
    })

    const req = makeReq({
      action: 'create_or_get',
      phone: '11999999999',
      full_name: 'Test',
    })
    const res = makeRes()
    await handler(req, res)

    expect(selectSpy).toHaveBeenCalledWith('id, phone, full_name, birth_date, avatar_url, created_at')
  })

  it('insert select() chamado com birth_date e avatar_url quando cria novo cliente', async () => {
    const newClient = {
      id: 'new-id',
      phone: '11999999999',
      full_name: 'New User',
      birth_date: '1995-06-10',
      avatar_url: null,
      created_at: '2026-08-03T10:00:00Z',
    }

    const lookupChain = makeChain(null, { code: 'PGRST116' })
    const insertChain = makeChain(newClient)
    const insertSelectSpy = vi.spyOn(insertChain, 'select')

    vi.mocked(createClient).mockReturnValue({
      from: makeFrom([lookupChain, insertChain]),
    })

    const req = makeReq({
      action: 'create_or_get',
      phone: '11999999999',
      full_name: 'New User',
      birth_date: '1995-06-10',
    })
    const res = makeRes()
    await handler(req, res)

    expect(insertSelectSpy).toHaveBeenCalledWith('id, phone, full_name, birth_date, avatar_url, created_at')
  })
})

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

  it('current_phone que NÃO bata com o phone do registro retorna 403', async () => {
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

  it('válido (current_phone bata) com apenas full_name chama UPDATE com { full_name } e retorna 200 { client }', async () => {
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

  it('birth_date: null passa pela validação e chama UPDATE com { birth_date: null } para limpar o campo', async () => {
    const updatedClient = {
      id: 'client1',
      phone: '11999999999',
      full_name: 'João Silva',
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

    // Requisição com birth_date: null como único campo editável (além do obrigatório current_phone).
    const req = makeReq({
      action: 'update',
      client_id: 'client1',
      current_phone: '11999999999',
      birth_date: null,
    })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.client).toEqual(updatedClient)
    // O UPDATE deve conter { birth_date: null }.
    expect(updatePayload).toEqual({ birth_date: null })
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'client1')
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
