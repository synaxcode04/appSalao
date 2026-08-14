// ============================================================================
// MOCK DEV-ONLY / DESCARTÁVEL — painel do Dono (árvore /painel)
// ----------------------------------------------------------------------------
// Este arquivo NÃO faz parte do produto. Ele existe apenas para permitir
// visualizar as 9 páginas do painel do Dono (app/src/pages/owner/*.jsx +
// OwnerLayout.jsx) rodando `npm run dev`, SEM backend real (Supabase) e SEM
// as Vercel Functions `/api/*` (que não existem em dev).
//
// Segue o MESMO padrão arquitetural do mock do módulo cliente
// (app/src/dev/clientMock.js): um interceptor de `window.fetch` que devolve
// dados fictícios para a REST API do Supabase, com passthrough para qualquer
// URL não mapeada.
//
// ----------------------------------------------------------------------------
// DIFERENÇA CHAVE em relação ao clientMock: Supabase Auth REAL
// ----------------------------------------------------------------------------
// O cliente usa sessão leve (auth.uid() sempre NULL — ver seguranca.md). O
// Dono usa Supabase Auth de verdade (`supabase.auth.signInWithPassword`,
// `getUser`, `getSession`, `signOut`). Por isso este mock também intercepta
// os endpoints `/auth/v1/*` do GoTrue, além do REST `/rest/v1/*`.
//
// Credenciais fixas do "dono mock" (únicas aceitas por este mock):
//   email:  dono@mock.teste
//   senha:  mock123456
//
// Como o login foi resolvido:
//   1. `/auth/v1/token?grant_type=password` (chamado por signInWithPassword)
//      é interceptado: valida as credenciais fixas acima e devolve uma sessão
//      GoTrue válida (access_token, refresh_token, expires_in, expires_at,
//      token_type, user). O supabase-js PERSISTE essa sessão sozinho no
//      localStorage (não precisamos escrever nada manualmente para isso).
//   2. `/auth/v1/user` (GET) é interceptado e SEMPRE devolve o mesmo usuário
//      mock. Isso é necessário porque, ao investigar o supabase-js v2
//      (node_modules/@supabase/auth-js/dist/module/GoTrueClient.js,
//      `_getUser()` → `_useSession()` → `_request(GET .../user)`), confirmamos
//      que `getUser()` SEMPRE faz um round-trip de rede para revalidar o
//      usuário, mesmo com sessão em cache — diferente de `getSession()`, que
//      só lê o storage local (`__loadSession()` → `getItemAsync(this.storage,
//      this.storageKey)`), sem tocar a rede. Por isso não dá pra "só semear o
//      localStorage e nunca mais interceptar rede": getUser() exige os dois.
//   3. `/auth/v1/logout` e `PUT /auth/v1/user` (update de e-mail em
//      Settings.jsx) também são interceptados, para os fluxos de logout e de
//      edição de e-mail não estourarem erro de rede.
//
// Chave de storage: o supabase-js v2 usa `sb-<project-ref>-auth-token`, onde
// project-ref = hostname de VITE_SUPABASE_URL antes do primeiro ponto (ver
// node_modules/@supabase/supabase-js/src/SupabaseClient.ts:
// `sb-${baseUrl.hostname.split('.')[0]}-auth-token`). Calculamos essa chave
// em runtime a partir de import.meta.env.VITE_SUPABASE_URL (não fixamos um
// valor "chutado") — funciona com qualquer VITE_SUPABASE_URL configurada em
// .env.development.local (inclusive a dummy `https://mock.supabase.co` já
// usada pelo clientMock, cuja project-ref vira "mock").
//
// SEMEADURA DIRETA (OPT-IN, DESLIGADA por padrão): além do fluxo de login via
// formulário, é possível pular a tela de login semeando a sessão diretamente
// no localStorage no formato exato que o GoTrue espera — mesma ideia do
// `seedClientSession` do clientMock, adaptada ao formato de sessão real do
// supabase-js (access_token/refresh_token/expires_at no nível raiz do objeto,
// não aninhados em `{ session: ... }` — confirmado em `_isValidSession()`).
// Ligue `VITE_OWNER_MOCK_SEED_SESSION=1` para abrir `/painel` já logado, sem
// passar pelo formulário.
//
// ----------------------------------------------------------------------------
// COMPOSIÇÃO com o clientMock (sem duplicar a lógica de interceptação)
// ----------------------------------------------------------------------------
// Este arquivo NÃO cria um segundo `window.fetch =` que sobrescreve o do
// clientMock. `installOwnerMock()` envelopa o `window.fetch` JÁ instalado no
// momento em que é chamado (seja o do clientMock, seja o nativo): guarda essa
// função como `previousFetch` e só cai nela quando a requisição não pertence
// ao escopo deste mock. Por isso a ORDEM em main.jsx importa: instale
// `installClientMock()` primeiro e `installOwnerMock()` depois, para que o
// dono seja verificado primeiro e o cliente funcione como fallback (e o
// fallback final de ambos seja sempre o fetch nativo).
//
// Para evitar que os dois mocks disputem as mesmas tabelas REST (ambos usam
// nomes de tabela iguais: 'salons', 'services', 'professionals',
// 'working_hours', 'time_blocks', 'subscription_plans'), este mock só
// reivindica uma requisição REST quando o filtro `salon_id`/`owner_id` da URL
// (quando presente) bate com as constantes do salão/dono mock abaixo. Se a
// URL filtra por um `salon_id`/`owner_id` diferente (ex: o salão do
// clientMock), a requisição é ignorada aqui e cai no fallback — que é
// justamente o clientMock (ou o fetch nativo).
//
// ATIVAÇÃO: só quando `import.meta.env.DEV && (VITE_CLIENT_MOCK === '1' ||
// VITE_USE_MOCKS === 'true')` — mesma guarda do clientMock, ver main.jsx. O
// import é dinâmico e gated: este código JAMAIS entra no bundle de produção.
//
// DESCARTÁVEL: pode ser apagado a qualquer momento (junto com a chamada em
// main.jsx e as vars em .env.local) sem afetar o produto.
//
// LIMITAÇÕES CONHECIDAS (aceitáveis para um mock de teste visual):
//   - Supabase Realtime (WebSocket, usado por OwnerLayout para novas
//     notificações) NÃO é interceptado — só fetch HTTP. O canal tenta
//     conectar e falha silenciosamente em segundo plano; não quebra a UI.
//   - O modal de reagendamento (BookingEngine, aberto a partir de
//     DashboardHome) usa `/api/appointments` (ação `list_scheduled`) para
//     checar conflitos — esse endpoint é tratado pelo `handleApi` do
//     clientMock (fallback desta cadeia), que devolve lista vazia. O modal
//     funciona, mas sem conflitos reais simulados. Não é uma das 9 páginas
//     pedidas, então não implementamos uma segunda cópia dessa lógica aqui.
// ============================================================================

export const MOCK_OWNER_EMAIL = 'dono@mock.teste'
export const MOCK_OWNER_PASSWORD = 'mock123456'

const OWNER_SALON_ID = '22222222-2222-4222-8222-222222222222'
const OWNER_USER_ID = '55555555-5555-4555-8555-555555555555'

// ---------------------------------------------------------------------------
// Helpers de data (fuso local) — mesma ideia do clientMock.
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysFromNow = (n) => new Date(Date.now() + n * 86400000)
const TODAY_YMD = toYMD(new Date())

// ---------------------------------------------------------------------------
// Usuário/sessão de autenticação (GoTrue) mockados.
// ---------------------------------------------------------------------------
const OWNER_AUTH_USER = {
  id: OWNER_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: MOCK_OWNER_EMAIL,
  email_confirmed_at: daysFromNow(-90).toISOString(),
  phone: '',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: daysFromNow(-90).toISOString(),
  updated_at: daysFromNow(-90).toISOString(),
}

function buildSession() {
  const nowSec = Math.floor(Date.now() / 1000)
  const expiresIn = 60 * 60 * 24 * 365 // 1 ano: evita qualquer refresh automático durante a sessão de dev.
  return {
    access_token: 'mock-owner-access-token',
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: nowSec + expiresIn,
    refresh_token: 'mock-owner-refresh-token',
    user: OWNER_AUTH_USER,
  }
}

function computeStorageKey() {
  const raw = import.meta.env.VITE_SUPABASE_URL || ''
  try {
    const ref = new URL(raw).hostname.split('.')[0]
    return ref ? `sb-${ref}-auth-token` : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Dados fictícios (banco em memória, mutável — recriado a cada reload da
// página, já que o módulo é reavaliado do zero. Isso permite testar CRUD real
// (criar/editar/excluir serviço, profissional, plano, bloqueio etc.) sem
// persistência entre reloads — coerente com a natureza descartável do mock).
// ---------------------------------------------------------------------------
function seedDB() {
  const salons = [{
    id: OWNER_SALON_ID,
    owner_id: OWNER_USER_ID,
    name: 'Salão Dono (MOCK)',
    address: 'Av. Afonso Pena, 1500 - Centro, Belo Horizonte - MG, 30130-005',
    logradouro: 'Av. Afonso Pena',
    numero: '1500',
    bairro: 'Centro',
    cep: '30130-005',
    cidade: 'Belo Horizonte',
    estado: 'MG',
    google_review_link: null,
    latitude: -19.9227,
    longitude: -43.9451,
    logo_url: null,
    status: 'active',
    subscription_expires_at: daysFromNow(365).toISOString(),
    slot_interval_minutes: 30,
    is_active: true,
  }]

  const services = [
    { id: 'ow-svc-corte', salon_id: OWNER_SALON_ID, name: 'Corte Masculino', duration_minutes: 30, price: 45.0 },
    { id: 'ow-svc-barba', salon_id: OWNER_SALON_ID, name: 'Barba', duration_minutes: 30, price: 30.0 },
    { id: 'ow-svc-combo', salon_id: OWNER_SALON_ID, name: 'Corte + Barba', duration_minutes: 60, price: 65.0 },
    { id: 'ow-svc-hidra', salon_id: OWNER_SALON_ID, name: 'Hidratação', duration_minutes: 45, price: 80.0 },
  ]

  const professionals = [
    { id: 'ow-prof-ana', salon_id: OWNER_SALON_ID, name: 'Ana Ferreira', is_active: true, created_at: daysFromNow(-60).toISOString() },
    { id: 'ow-prof-bruno', salon_id: OWNER_SALON_ID, name: 'Bruno Alves', is_active: true, created_at: daysFromNow(-45).toISOString() },
  ]

  // Segunda a sábado 09:00-18:00 com almoço 12:00-13:00; domingo fechado (sem linha).
  const working_hours = [1, 2, 3, 4, 5, 6].map((dow) => ({
    id: `ow-wh-${dow}`,
    salon_id: OWNER_SALON_ID,
    day_of_week: dow,
    start_time: '09:00:00',
    end_time: '18:00:00',
    has_lunch_break: true,
    break_start_time: '12:00:00',
    break_end_time: '13:00:00',
  }))

  const time_blocks = [
    { id: 'ow-block-1', salon_id: OWNER_SALON_ID, professional_id: 'ow-prof-bruno', block_date: toYMD(daysFromNow(1)), start_time: '09:00:00', end_time: '10:00:00', reason: 'Consulta médica' },
  ]

  const clients = [
    { id: 'ow-client-1', full_name: 'Fernanda Lima', phone: '(31) 99111-0001', birth_date: '1992-03-14' },
    { id: 'ow-client-2', full_name: 'Gustavo Rocha', phone: '(31) 99111-0002', birth_date: '1988-07-22' },
    { id: 'ow-client-3', full_name: 'Helena Dias', phone: '(31) 99111-0003', birth_date: '1995-11-05' },
    { id: 'ow-client-4', full_name: 'Igor Souza', phone: '(31) 99111-0004', birth_date: '1990-01-30' },
    { id: 'ow-client-5', full_name: 'Julia Prado', phone: '(31) 99111-0005', birth_date: '2000-09-18' },
  ]

  const salon_clients = [
    { id: 'ow-sc-1', salon_id: OWNER_SALON_ID, client_id: 'ow-client-1', is_active: true, created_at: daysFromNow(-40).toISOString() },
    { id: 'ow-sc-2', salon_id: OWNER_SALON_ID, client_id: 'ow-client-2', is_active: true, created_at: daysFromNow(-35).toISOString() },
    { id: 'ow-sc-3', salon_id: OWNER_SALON_ID, client_id: 'ow-client-3', is_active: true, created_at: daysFromNow(-20).toISOString() },
    { id: 'ow-sc-4', salon_id: OWNER_SALON_ID, client_id: 'ow-client-4', is_active: false, created_at: daysFromNow(-15).toISOString() },
    { id: 'ow-sc-5', salon_id: OWNER_SALON_ID, client_id: 'ow-client-5', is_active: true, created_at: daysFromNow(-5).toISOString() },
  ]

  const appointments = [
    { id: 'ow-appt-1', salon_id: OWNER_SALON_ID, client_id: 'ow-client-1', service_id: 'ow-svc-corte', professional_id: 'ow-prof-ana', appointment_date: TODAY_YMD, start_time: '10:00:00', end_time: '10:30:00', status: 'scheduled' },
    { id: 'ow-appt-2', salon_id: OWNER_SALON_ID, client_id: 'ow-client-2', service_id: 'ow-svc-combo', professional_id: 'ow-prof-bruno', appointment_date: TODAY_YMD, start_time: '14:00:00', end_time: '15:00:00', status: 'scheduled' },
    { id: 'ow-appt-3', salon_id: OWNER_SALON_ID, client_id: 'ow-client-3', service_id: 'ow-svc-barba', professional_id: 'ow-prof-ana', appointment_date: toYMD(daysFromNow(-1)), start_time: '11:00:00', end_time: '11:30:00', status: 'completed' },
    { id: 'ow-appt-4', salon_id: OWNER_SALON_ID, client_id: 'ow-client-5', service_id: 'ow-svc-corte', professional_id: 'ow-prof-bruno', appointment_date: toYMD(daysFromNow(-5)), start_time: '09:30:00', end_time: '10:00:00', status: 'completed' },
    { id: 'ow-appt-5', salon_id: OWNER_SALON_ID, client_id: 'ow-client-4', service_id: 'ow-svc-corte', professional_id: 'ow-prof-ana', appointment_date: toYMD(daysFromNow(-2)), start_time: '16:00:00', end_time: '16:30:00', status: 'canceled' },
  ]

  const notifications = [
    { id: 'ow-notif-1', salon_id: OWNER_SALON_ID, client_id: null, title: 'Novo agendamento', message: 'Fernanda Lima agendou Corte Masculino para hoje às 10:00.', created_at: daysFromNow(-0.02).toISOString(), is_read: false },
    { id: 'ow-notif-2', salon_id: OWNER_SALON_ID, client_id: null, title: 'Serviço concluído', message: 'O atendimento de Helena Dias foi marcado como concluído.', created_at: daysFromNow(-1).toISOString(), is_read: true },
  ]

  const subscription_plans = [
    { id: 'ow-plan-corte', salon_id: OWNER_SALON_ID, name: 'Plano Corte Mensal', description: 'Cortes dentro da cota, com preço fixo, direto com o salão.', price: 99.9, is_active: true, created_at: daysFromNow(-30).toISOString() },
    { id: 'ow-plan-barba', salon_id: OWNER_SALON_ID, name: 'Plano Barba VIP', description: 'Barba feita nos dias combinados da semana.', price: 79.9, is_active: true, created_at: daysFromNow(-20).toISOString() },
  ]

  const subscription_plan_services = [
    { id: 'ow-pps-1', plan_id: 'ow-plan-corte', salon_id: OWNER_SALON_ID, service_id: 'ow-svc-corte', monthly_quota: 4 },
    { id: 'ow-pps-2', plan_id: 'ow-plan-barba', salon_id: OWNER_SALON_ID, service_id: 'ow-svc-barba', monthly_quota: 4 },
  ]

  // Plano corte vale todos os dias (sem linhas); plano barba só ter/qui/sáb.
  const subscription_plan_days = [
    { id: 'ow-ppd-1', plan_id: 'ow-plan-barba', salon_id: OWNER_SALON_ID, day_of_week: 2 },
    { id: 'ow-ppd-2', plan_id: 'ow-plan-barba', salon_id: OWNER_SALON_ID, day_of_week: 4 },
    { id: 'ow-ppd-3', plan_id: 'ow-plan-barba', salon_id: OWNER_SALON_ID, day_of_week: 6 },
  ]

  const client_subscriptions = [
    { id: 'ow-sub-1', plan_id: 'ow-plan-corte', client_id: 'ow-client-1', salon_id: OWNER_SALON_ID, status: 'active', payment_status: 'approved', payment_method: 'external', confirmed_by: 'owner', started_at: daysFromNow(-10).toISOString(), created_at: daysFromNow(-10).toISOString() },
  ]

  const profiles = [
    { id: OWNER_USER_ID, role: 'owner', phone: '(31) 99000-0000' },
  ]

  return {
    salons,
    services,
    professionals,
    working_hours,
    time_blocks,
    clients,
    salon_clients,
    appointments,
    notifications,
    subscription_plans,
    subscription_plan_services,
    subscription_plan_days,
    client_subscriptions,
    profiles,
    salon_mp_credentials: [],
  }
}

let DB = null
let idCounter = 1
const genId = (table) => `ow-${table}-${idCounter++}`

// ---------------------------------------------------------------------------
// Utilidades de request/response — mesma forma do clientMock (arquivo
// autocontido/descartável; não importamos as privadas de clientMock.js).
// ---------------------------------------------------------------------------
const jsonResponse = (payload, status = 200) => {
  if (status === 204) return new Response(null, { status: 204 })
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const getUrlString = (input) => {
  if (typeof input === 'string') return input
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString()
  if (input && typeof input.url === 'string') return input.url // Request
  return String(input)
}

const getHeader = (input, init, name) => {
  const read = (h) => {
    if (!h) return null
    if (typeof h.get === 'function') return h.get(name)
    const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase())
    return key ? h[key] : null
  }
  const fromInit = read(init && init.headers)
  if (fromInit) return fromInit
  if (typeof Request !== 'undefined' && input instanceof Request) return read(input.headers)
  return null
}

const getMethod = (input, init) => {
  if (init && init.method) return String(init.method).toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
  return 'GET'
}

const getBody = async (input, init) => {
  if (init && typeof init.body === 'string') return init.body
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try { return await input.clone().text() } catch { return '' }
  }
  return ''
}

const parseJsonBody = async (input, init) => {
  const raw = await getBody(input, init)
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

// ---------------------------------------------------------------------------
// Filtros/ordenação/limite genéricos ao estilo PostgREST, aplicados sobre o
// "banco" em memória — evita reimplementar caso a caso para cada tabela.
// ---------------------------------------------------------------------------
const RESERVED_QUERY_KEYS = new Set(['select', 'order', 'limit', 'offset'])

const queryFilterFields = (u) =>
  [...new Set([...u.searchParams.keys()])].filter((k) => !RESERVED_QUERY_KEYS.has(k))

const parseOps = (u, key) =>
  u.searchParams.getAll(key).map((raw) => {
    const idx = raw.indexOf('.')
    return idx === -1 ? { op: 'eq', val: raw } : { op: raw.slice(0, idx), val: raw.slice(idx + 1) }
  })

function applyFilters(rows, u, fields) {
  let list = rows
  for (const field of fields) {
    for (const { op, val } of parseOps(u, field)) {
      list = list.filter((row) => {
        const rv = row[field]
        switch (op) {
          case 'eq': return String(rv) === val
          case 'neq': return String(rv) !== val
          case 'gte': return rv >= val
          case 'lte': return rv <= val
          case 'gt': return rv > val
          case 'lt': return rv < val
          case 'is': return val === 'null' ? (rv === null || rv === undefined) : String(rv) === val
          default: return true
        }
      })
    }
  }
  return list
}

function applyOrder(rows, u) {
  const orderParam = u.searchParams.get('order')
  if (!orderParam) return rows
  const specs = orderParam.split(',').map((part) => {
    const [col, dir] = part.split('.')
    return { col, desc: dir === 'desc' }
  })
  return rows.slice().sort((a, b) => {
    for (const { col, desc } of specs) {
      const av = a[col]
      const bv = b[col]
      if (av === bv) continue
      const cmp = av > bv ? 1 : -1
      return desc ? -cmp : cmp
    }
    return 0
  })
}

function applyLimit(rows, u) {
  const limitParam = u.searchParams.get('limit')
  if (!limitParam) return rows
  const n = parseInt(limitParam, 10)
  return Number.isFinite(n) ? rows.slice(0, n) : rows
}

// ---------------------------------------------------------------------------
// Embutidos (joins) calculados na leitura, refletindo o estado atual do DB.
// ---------------------------------------------------------------------------
function embedAppointment(row) {
  const prof = DB.professionals.find((p) => p.id === row.professional_id) || null
  const svc = DB.services.find((s) => s.id === row.service_id) || null
  const client = DB.clients.find((c) => c.id === row.client_id) || null
  const svcEmbed = svc ? { id: svc.id, name: svc.name, price: svc.price, duration_minutes: svc.duration_minutes } : null
  return {
    ...row,
    professionals: prof ? { id: prof.id, name: prof.name } : null,
    services: svcEmbed,
    appointment_services: svcEmbed ? [{ service_id: svc.id, services: svcEmbed }] : [],
    clients: client ? { full_name: client.full_name, phone: client.phone } : null,
  }
}

function embedPlan(plan) {
  const planServices = DB.subscription_plan_services
    .filter((ps) => ps.plan_id === plan.id)
    .map((ps) => {
      const svc = DB.services.find((s) => s.id === ps.service_id) || null
      return {
        service_id: ps.service_id,
        monthly_quota: ps.monthly_quota,
        services: svc ? { id: svc.id, name: svc.name, price: svc.price } : null,
      }
    })
  const planDays = DB.subscription_plan_days
    .filter((d) => d.plan_id === plan.id)
    .map((d) => ({ day_of_week: d.day_of_week }))
  return { ...plan, subscription_plan_services: planServices, subscription_plan_days: planDays }
}

function embedSubscription(sub) {
  const client = DB.clients.find((c) => c.id === sub.client_id) || null
  const plan = DB.subscription_plans.find((p) => p.id === sub.plan_id) || null
  return {
    ...sub,
    clients: client ? { full_name: client.full_name, phone: client.phone } : null,
    subscription_plans: plan ? { name: plan.name } : null,
  }
}

function embedSalonClient(row) {
  const client = DB.clients.find((c) => c.id === row.client_id) || null
  return {
    ...row,
    clients: client ? { id: client.id, phone: client.phone, full_name: client.full_name, birth_date: client.birth_date } : null,
  }
}

const EMBEDDERS = {
  appointments: embedAppointment,
  subscription_plans: embedPlan,
  client_subscriptions: embedSubscription,
  salon_clients: embedSalonClient,
}

const embedRows = (table, rows) => (EMBEDDERS[table] ? rows.map(EMBEDDERS[table]) : rows)

// ---------------------------------------------------------------------------
// Escopo: só reivindicamos a requisição se o filtro salon_id/owner_id da URL
// (quando presente) bate com o salão/dono deste mock — ver nota de composição
// no topo do arquivo.
// ---------------------------------------------------------------------------
const eqVal = (raw) => (raw && raw.startsWith('eq.') ? raw.slice(3) : null)

function ownerScopeMatches(u) {
  const salonId = u.searchParams.get('salon_id')
  if (salonId) return eqVal(salonId) === OWNER_SALON_ID
  const ownerId = u.searchParams.get('owner_id')
  if (ownerId) return eqVal(ownerId) === OWNER_USER_ID
  return true
}

// ---------------------------------------------------------------------------
// Handler: REST API do Supabase (tabelas + RPC)
// ---------------------------------------------------------------------------
function readTable(table, u, wantsSingleObject) {
  let rows = applyFilters(DB[table] || [], u, queryFilterFields(u))
  rows = applyOrder(rows, u)
  rows = applyLimit(rows, u)
  rows = embedRows(table, rows)
  if (wantsSingleObject) return rows[0] ?? null
  return rows
}

async function writeTable(table, method, u, input, init) {
  const body = await parseJsonBody(input, init)
  const rows = Array.isArray(body) ? body : [body]
  DB[table] = DB[table] || []

  if (method === 'POST') {
    // Upsert dedicado para salon_mp_credentials (onConflict: 'salon_id').
    if (table === 'salon_mp_credentials') {
      return rows.map((r) => {
        const idx = DB.salon_mp_credentials.findIndex((x) => x.salon_id === r.salon_id)
        const row = { salon_id: r.salon_id, access_token: r.access_token, updated_at: r.updated_at || new Date().toISOString() }
        if (idx >= 0) DB.salon_mp_credentials[idx] = row
        else DB.salon_mp_credentials.push(row)
        return row
      })
    }

    return rows.map((r) => {
      const row = { created_at: new Date().toISOString(), ...r, id: r.id || genId(table) }
      DB[table].push(row)
      return row
    })
  }

  const filterFields = queryFilterFields(u)

  if (method === 'PATCH') {
    const target = applyFilters(DB[table], u, filterFields)
    target.forEach((row) => Object.assign(row, body))
    return target
  }

  if (method === 'DELETE') {
    const target = applyFilters(DB[table], u, filterFields)
    const removeIds = new Set(target.map((r) => r.id))
    DB[table] = DB[table].filter((r) => !removeIds.has(r.id))
    // ON DELETE CASCADE conceitual para planos (ver CLAUDE.md: exclusão de
    // plano remove as linhas-filhas de serviços/dias vinculadas).
    if (table === 'subscription_plans') {
      DB.subscription_plan_services = DB.subscription_plan_services.filter((x) => !removeIds.has(x.plan_id))
      DB.subscription_plan_days = DB.subscription_plan_days.filter((x) => !removeIds.has(x.plan_id))
    }
    return target
  }

  return []
}

function handleRpc(name) {
  if (name === 'is_salon_mp_connected') {
    const connected = DB.salon_mp_credentials.some((c) => c.salon_id === OWNER_SALON_ID)
    return jsonResponse(connected)
  }
  return jsonResponse(null)
}

async function handleRest(path, u, input, init) {
  if (path.startsWith('/rest/v1/rpc/')) {
    return handleRpc(path.slice('/rest/v1/rpc/'.length))
  }

  const restMatch = path.match(/\/rest\/v1\/([^/?]+)/)
  const table = restMatch ? restMatch[1] : null
  if (!table || !(table in DB)) return null // tabela fora do escopo deste mock
  if (!ownerScopeMatches(u)) return null // filtro aponta pra outro salão/dono (ex: clientMock)

  const method = getMethod(input, init)
  const accept = getHeader(input, init, 'Accept') || ''
  const wantsSingleObject = accept.includes('application/vnd.pgrst.object+json')

  if (method === 'GET' || method === 'HEAD') {
    return jsonResponse(readTable(table, u, wantsSingleObject))
  }

  const result = await writeTable(table, method, u, input, init)
  return jsonResponse(wantsSingleObject ? (result[0] ?? null) : result)
}

// ---------------------------------------------------------------------------
// Handler: Supabase Auth (GoTrue) — ver nota de topo sobre por que
// getUser() precisa de round-trip de rede mesmo com sessão em storage.
// ---------------------------------------------------------------------------
async function handleAuthToken(u, input, init) {
  const grantType = u.searchParams.get('grant_type')
  if (grantType === 'password') {
    const body = await parseJsonBody(input, init)
    if (body.email === MOCK_OWNER_EMAIL && body.password === MOCK_OWNER_PASSWORD) {
      return jsonResponse(buildSession())
    }
    return jsonResponse({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400)
  }
  // grant_type=refresh_token (ou outro): mock sempre "renova" com sucesso.
  return jsonResponse(buildSession())
}

async function handleAuthUpdateUser(input, init) {
  const body = await parseJsonBody(input, init)
  const updated = { ...OWNER_AUTH_USER, ...(body.email ? { email: body.email } : {}) }
  return jsonResponse({ user: updated })
}

async function handleAuth(path, u, input, init) {
  if (path === '/auth/v1/token') return handleAuthToken(u, input, init)
  if (path === '/auth/v1/user') {
    const method = getMethod(input, init)
    if (method === 'PUT') return handleAuthUpdateUser(input, init)
    return jsonResponse({ user: OWNER_AUTH_USER }) // GET
  }
  if (path === '/auth/v1/logout') return jsonResponse(null, 204)
  // Outro endpoint de auth não mapeado: 200 vazio (não quebra a casca).
  return jsonResponse({})
}

// ---------------------------------------------------------------------------
// Handler: Supabase Storage (upload de logo em Settings.jsx)
// ---------------------------------------------------------------------------
function handleStorage(path) {
  if (path.startsWith('/storage/v1/object/')) {
    return jsonResponse({ Key: path.replace('/storage/v1/object/', '') })
  }
  return jsonResponse({})
}

async function tryHandleOwnerSupabase(url, input, init) {
  const u = new URL(url)
  const path = u.pathname

  if (path.startsWith('/auth/')) return handleAuth(path, u, input, init)
  if (path.startsWith('/rest/')) return handleRest(path, u, input, init)
  if (path.startsWith('/storage/')) return handleStorage(path)

  return null
}

// ---------------------------------------------------------------------------
// Semente da sessão do dono (localStorage), formato real do supabase-js.
// ---------------------------------------------------------------------------
function seedOwnerSession() {
  // OPT-IN: por padrão NÃO semeia — abre /login normalmente, e o dono entra
  // digitando as credenciais mock. Ligue VITE_OWNER_MOCK_SEED_SESSION=1 para
  // pular a tela de login e abrir /painel já autenticado.
  if (import.meta.env.VITE_OWNER_MOCK_SEED_SESSION !== '1') return
  const key = computeStorageKey()
  if (!key) return
  try {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(buildSession()))
    }
  } catch {
    // localStorage indisponível: o dono ainda pode logar via /login manualmente.
  }
}

// ---------------------------------------------------------------------------
// Instalação do interceptor — envelopa o fetch já instalado (clientMock ou
// nativo), sem duplicar a lógica de composição (ver nota de topo).
// ---------------------------------------------------------------------------
export function installOwnerMock() {
  if (window.__OWNER_MOCK_INSTALLED__) return
  window.__OWNER_MOCK_INSTALLED__ = true

  DB = seedDB()

  const SUPA = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  seedOwnerSession()

  const previousFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    let url
    try {
      url = getUrlString(input)
    } catch {
      return previousFetch(input, init)
    }

    if (SUPA && url.startsWith(SUPA)) {
      try {
        const handled = await tryHandleOwnerSupabase(url, input, init)
        if (handled) return handled
      } catch {
        // Falha inesperada no mock: não derruba o painel.
        return jsonResponse({ error: 'owner mock interno falhou' }, 500)
      }
    }

    return previousFetch(input, init)
  }

  // Log dev-only para orientar o usuário no console do navegador.
  // eslint-disable-next-line no-console
  console.info(
    `[owner-mock] Ativo. Login em /login?role=owner com ${MOCK_OWNER_EMAIL} / ${MOCK_OWNER_PASSWORD}`,
  )
}

export default installOwnerMock
