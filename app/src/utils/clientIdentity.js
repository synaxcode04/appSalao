// Helpers para o cadastro de cliente por identidade global (telefone).
//
// O frontend NUNCA acessa as tabelas `clients`/`salon_clients` diretamente pelo
// supabase client — a RLS bloqueia esse acesso. Todo acesso passa pela Vercel
// Function `/api/client-identity` (service_role, server-side), no mesmo padrão
// de `notification.js`.

const ENDPOINT = '/api/client-identity'

/**
 * Aplica a máscara de telefone brasileira "(DD) NNNNN-NNNN" a partir de uma
 * entrada livre. Compartilhado entre o cadastro (Register) e o fluxo inline de
 * identificação no agendamento (ClientIdentityForm) para não duplicar a lógica.
 *
 * @param {string} raw - valor livre digitado pelo usuário
 * @returns {string} telefone formatado
 */
export function formatPhone(raw) {
  let value = String(raw || '').replace(/\D/g, '')
  if (value.length > 11) value = value.slice(0, 11)

  let formatted = value
  if (value.length > 2) {
    formatted = `(${value.slice(0, 2)}) ` + value.slice(2)
  }
  if (value.length > 7) {
    formatted = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`
  }
  return formatted
}

/**
 * Procura a identidade global do cliente pelo telefone.
 * Retorna o objeto do cliente quando existe, ou null quando não há cadastro
 * (HTTP 404) — sem lançar. Lança apenas em erros reais de servidor/rede.
 *
 * @param {string} phone - telefone em formato livre (normalizado no servidor)
 * @returns {Promise<object|null>}
 */
export async function lookupClient(phone) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'lookup', phone })
  })

  if (response.status === 404) return null

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const message = (data && data.error) || `Falha na requisição (${response.status})`
    throw new Error(message)
  }

  return data ? data.client : null
}

async function callClientIdentity(payload) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const message = (data && data.error) || `Falha na requisição (${response.status})`
    throw new Error(message)
  }

  return data
}

/**
 * Cria ou reutiliza a identidade global do cliente pelo telefone.
 * A normalização do telefone é feita no servidor.
 *
 * @param {{ phone: string, full_name: string, birth_date?: string }} params
 * @returns {Promise<{ client: object, created: boolean }>}
 */
export const createOrGetClient = ({ phone, full_name, birth_date }) =>
  callClientIdentity({
    action: 'create_or_get',
    phone,
    full_name,
    ...(birth_date ? { birth_date } : {})
  })

/**
 * Vincula (idempotente) a identidade do cliente a um salão. Se o cliente ainda
 * não existir, cria — por isso `full_name` é enviado junto.
 *
 * @param {{ phone: string, full_name: string, birth_date?: string, salon_id: string }} params
 * @returns {Promise<{ salon_client: object, client_id: string }>}
 */
export const linkClientToSalon = ({ phone, full_name, birth_date, salon_id }) =>
  callClientIdentity({
    action: 'link_to_salon',
    phone,
    full_name,
    ...(birth_date ? { birth_date } : {}),
    salon_id
  })
