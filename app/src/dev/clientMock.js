// ============================================================================
// MOCK DEV-ONLY / DESCARTÁVEL — módulo cliente (árvore /s/:slug)
// ----------------------------------------------------------------------------
// Este arquivo NÃO faz parte do produto. Ele existe apenas para permitir
// visualizar a "casca" (shell) da UI do cliente rodando com `npm run dev`,
// SEM backend real (Supabase) e SEM as Vercel Functions `/api/*` (que não
// existem em dev).
//
// Como funciona: instala um interceptor em `window.fetch` que devolve dados
// fictícios para:
//   - REST API do Supabase (URLs que começam com VITE_SUPABASE_URL)
//   - Endpoints serverless `/api/*`
// Qualquer URL não mapeada faz passthrough para o fetch original.
//
// Semeadura de sessão (OPT-IN, DESLIGADA por padrão): opcionalmente semeia uma
// "sessão leve" de cliente no localStorage (escopada pelo slug) para abrir a
// casca já identificada (bottom-nav visível e rotas ClientRoute acessíveis
// direto). Por padrão a casca abre DESLOGADA e o wizard começa pedindo o
// telefone (fluxo de cliente novo/reconhecido). Para semear a sessão logada,
// ligue `VITE_CLIENT_MOCK_SEED_SESSION=1` no `.env.development.local`.
//
// ATIVAÇÃO: só quando `import.meta.env.DEV && VITE_CLIENT_MOCK === '1'`.
// O import é dinâmico e gated em main.jsx — este código JAMAIS entra no bundle
// de produção (build roda em mode=production, onde import.meta.env.DEV=false).
//
// DESCARTÁVEL: pode ser apagado a qualquer momento (junto com o guard em
// main.jsx e as vars em .env.local) sem afetar o produto.
// ============================================================================

// UUID fixo do salão mockado. O slug usado na URL é `<UUID>-salao-teste`
// (o SalonLayout extrai os 36 primeiros chars como id do salão).
export const MOCK_SALON_UUID = '11111111-1111-4111-8111-111111111111'
export const MOCK_SALON_SLUG = `${MOCK_SALON_UUID}-salao-teste`
const MOCK_CLIENT_ID = 'c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1'
const MOCK_OWNER_ID = '0deadbee-0000-4000-8000-000000000000'

// ---------------------------------------------------------------------------
// Helpers de data (fuso local)
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysFromNow = (n) => new Date(Date.now() + n * 86400000)

const TODAY = new Date()
const TOMORROW_YMD = toYMD(daysFromNow(2))
const LAST_WEEK_YMD = toYMD(daysFromNow(-7))
const SUB_STARTED_ISO = daysFromNow(-10).toISOString()
const EXPIRES_ISO = daysFromNow(365).toISOString()

// ---------------------------------------------------------------------------
// Dados fictícios
// ---------------------------------------------------------------------------
const SALON = {
  id: MOCK_SALON_UUID,
  owner_id: MOCK_OWNER_ID,
  name: 'Salão Teste (MOCK)',
  address: 'Rua das Flores, 123 - Centro',
  phone: '(11) 99999-0000',
  latitude: -23.5505,
  longitude: -46.6333,
  logo_url: null,
  status: 'active',
  subscription_expires_at: EXPIRES_ISO,
  slot_interval_minutes: 30,
  is_active: true,
}

const SERVICES = [
  { id: 'svc-corte', salon_id: MOCK_SALON_UUID, name: 'Corte Masculino', description: 'Corte na tesoura ou máquina', price: 45, duration_minutes: 30, is_active: true },
  { id: 'svc-barba', salon_id: MOCK_SALON_UUID, name: 'Barba', description: 'Barba feita na navalha', price: 30, duration_minutes: 30, is_active: true },
  { id: 'svc-combo', salon_id: MOCK_SALON_UUID, name: 'Corte + Barba', description: 'Combo completo', price: 65, duration_minutes: 60, is_active: true },
]

const PROFESSIONALS = [
  { id: 'prof-joao', salon_id: MOCK_SALON_UUID, name: 'João', is_active: true },
  { id: 'prof-maria', salon_id: MOCK_SALON_UUID, name: 'Maria', is_active: true },
]

// working_hours por dia da semana (0=Dom ... 6=Sáb). Seg–Sáb aberto; Dom fechado.
const workingHoursForDay = (dow) => {
  if (dow === 0) return null // domingo fechado -> sem slots
  return {
    id: `wh-${dow}`,
    salon_id: MOCK_SALON_UUID,
    day_of_week: dow,
    start_time: '09:00:00',
    end_time: '18:00:00',
    break_start_time: '12:00:00',
    break_end_time: '13:00:00',
    has_lunch_break: true,
  }
}

// Assinatura ativa (aprovada) do cliente neste salão + plano com cota.
const ACTIVE_SUBSCRIPTION = {
  id: 'sub-ativa',
  plan_id: 'plan-mensal-corte',
  client_id: MOCK_CLIENT_ID,
  salon_id: MOCK_SALON_UUID,
  status: 'active',
  payment_status: 'approved',
  payment_method: 'external',
  started_at: SUB_STARTED_ISO,
  created_at: SUB_STARTED_ISO,
  subscription_plans: {
    id: 'plan-mensal-corte',
    name: 'Plano Corte Mensal',
    description: 'Cortes ilimitados no mês, com preço fixo.',
    price: 129.9,
    subscription_plan_services: [
      { service_id: 'svc-corte', monthly_quota: 4, services: { id: 'svc-corte', name: 'Corte Masculino', price: 45 } },
    ],
    subscription_plan_days: [
      { day_of_week: 1 }, { day_of_week: 2 }, { day_of_week: 3 }, { day_of_week: 4 }, { day_of_week: 5 },
    ],
  },
}

// Planos ofertados pelo salão (SELECT via supabase). Id diferente do plano já
// assinado, para aparecer na seção "Planos disponíveis".
const OFFERED_PLANS = [
  {
    id: 'plan-barba-vip',
    name: 'Plano Barba VIP',
    description: 'Barba impecável toda semana.',
    price: 89.9,
    is_active: true,
    subscription_plan_services: [
      { service_id: 'svc-barba', monthly_quota: 4, services: { id: 'svc-barba', name: 'Barba', price: 30 } },
    ],
    subscription_plan_days: [
      { day_of_week: 2 }, { day_of_week: 4 }, { day_of_week: 6 },
    ],
  },
]

// Agendamentos do cliente. Um agendado (futuro) e um concluído (passado).
const APPOINTMENTS = [
  {
    id: 'appt-agendado',
    salon_id: MOCK_SALON_UUID,
    client_id: MOCK_CLIENT_ID,
    service_id: 'svc-corte',
    professional_id: 'prof-joao',
    appointment_date: TOMORROW_YMD,
    start_time: '10:00:00',
    end_time: '10:30:00',
    status: 'scheduled',
    salons: { id: MOCK_SALON_UUID, name: SALON.name, address: SALON.address, latitude: SALON.latitude, longitude: SALON.longitude },
    professionals: { id: 'prof-joao', name: 'João' },
    services: { id: 'svc-corte', name: 'Corte Masculino', price: 45, duration_minutes: 30 },
  },
  {
    id: 'appt-concluido',
    salon_id: MOCK_SALON_UUID,
    client_id: MOCK_CLIENT_ID,
    service_id: 'svc-combo',
    professional_id: 'prof-maria',
    appointment_date: LAST_WEEK_YMD,
    start_time: '14:00:00',
    end_time: '15:00:00',
    status: 'completed',
    salons: { id: MOCK_SALON_UUID, name: SALON.name, address: SALON.address, latitude: SALON.latitude, longitude: SALON.longitude },
    professionals: { id: 'prof-maria', name: 'Maria' },
    services: { id: 'svc-combo', name: 'Corte + Barba', price: 65, duration_minutes: 60 },
  },
]

const NOTIFICATIONS = [
  {
    id: 'notif-1',
    salon_id: MOCK_SALON_UUID,
    client_id: MOCK_CLIENT_ID,
    title: 'Agendamento confirmado',
    message: 'Seu horário de Corte Masculino foi confirmado. Até breve!',
    created_at: daysFromNow(-1).toISOString(),
    is_read: false,
  },
]

const CLIENT_IDENTITY = {
  id: MOCK_CLIENT_ID,
  full_name: 'Cliente Teste',
  phone: '(11) 98888-0001',
  birth_date: '1990-05-20',
  avatar_url: null,
}

// Telefones "já cadastrados" no mock, mapeados por DÍGITOS normalizados
// (sem máscara) -> objeto de cliente. O lookup normaliza o telefone recebido e
// consulta este mapa:
//   - Cliente JÁ CADASTRADO (reconhecido, entra direto): (11) 98888-0001
//   - Cliente NOVO (não reconhecido -> pede nome + nascimento): qualquer outro
//     telefone válido, ex. (11) 97777-1234
const digitsOnly = (value) => String(value || '').replace(/\D/g, '')
const REGISTERED_PHONES = {
  [digitsOnly(CLIENT_IDENTITY.phone)]: CLIENT_IDENTITY, // '11988880001'
}

// ---------------------------------------------------------------------------
// Utilidades de request/response
// ---------------------------------------------------------------------------
const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

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
// Handler: REST API do Supabase
// ---------------------------------------------------------------------------
const handleSupabase = (url, input, init) => {
  const u = new URL(url)
  const path = u.pathname // /rest/v1/<table>  ou  /auth/v1/...
  const accept = getHeader(input, init, 'Accept') || ''
  const wantsSingleObject = accept.includes('application/vnd.pgrst.object+json')

  // Endpoints de auth: o cliente não usa Supabase Auth (sessão leve). Devolve
  // vazio/ok para qualquer chamada eventual do GoTrue sem estourar erro.
  if (path.startsWith('/auth/')) {
    return jsonResponse({}, 200)
  }

  const restMatch = path.match(/\/rest\/v1\/([^/?]+)/)
  const table = restMatch ? restMatch[1] : null

  switch (table) {
    case 'salons':
      // .single() -> objeto direto
      return jsonResponse(wantsSingleObject ? SALON : [SALON])

    case 'services':
      return jsonResponse(SERVICES)

    case 'professionals':
      return jsonResponse(PROFESSIONALS)

    case 'working_hours': {
      // .maybeSingle() usa Accept padrão (array); o postgrest-js pega [0].
      const dowParam = u.searchParams.get('day_of_week') // ex: "eq.3"
      const dow = dowParam ? parseInt(dowParam.replace('eq.', ''), 10) : TODAY.getDay()
      const row = workingHoursForDay(dow)
      return jsonResponse(row ? [row] : [])
    }

    case 'time_blocks':
      return jsonResponse([]) // sem bloqueios avulsos

    case 'subscription_plans':
      return jsonResponse(OFFERED_PLANS)

    case 'profiles':
      // Não deve ser chamado (sem sessão auth), mas responde defensivamente.
      return jsonResponse(wantsSingleObject ? null : [])

    default:
      // Tabela não mapeada: devolve lista vazia (ou objeto null para single),
      // evitando erro de rede e mantendo a casca renderizável.
      return jsonResponse(wantsSingleObject ? null : [])
  }
}

// ---------------------------------------------------------------------------
// Handler: Vercel Functions /api/*
// ---------------------------------------------------------------------------
const handleAppointments = (body) => {
  switch (body.action) {
    case 'list_by_client':
      return jsonResponse({ appointments: APPOINTMENTS })
    case 'list_history':
      return jsonResponse({ appointments: APPOINTMENTS })
    case 'list_scheduled':
      // Usado pelo cálculo de slots para checar conflitos. Vazio = todos livres.
      return jsonResponse({ appointments: [] })
    case 'list_notifications':
      return jsonResponse({ notifications: NOTIFICATIONS })
    case 'mark_notifications_read':
      return jsonResponse({ success: true })
    case 'cancel':
      return jsonResponse({ success: true, owner_id: MOCK_OWNER_ID })
    case 'reschedule':
      return jsonResponse({ success: true, owner_id: MOCK_OWNER_ID })
    case 'create':
      return jsonResponse({ success: true, id: 'appt-novo', owner_id: MOCK_OWNER_ID })
    case 'get_salon_contact':
      return jsonResponse({ phone: SALON.phone })
    case 'get_salon_payment_options':
      return jsonResponse({ mp_connected: false })
    case 'list_client_subscriptions':
      return jsonResponse({ subscriptions: [ACTIVE_SUBSCRIPTION] })
    case 'subscribe':
      return jsonResponse({ success: true })
    case 'cancel_subscription':
      return jsonResponse({ success: true })
    default:
      return jsonResponse({ error: `mock: acao desconhecida em /api/appointments: ${body.action}` }, 400)
  }
}

const handleClientIdentity = (body) => {
  switch (body.action) {
    case 'lookup': {
      // Normaliza o telefone recebido e consulta a lista de cadastrados.
      // Cadastrado -> reconhece (entra direto). Não cadastrado -> 404 para o
      // lookupClient retornar null e o wizard ir pro step de cadastro.
      const client = REGISTERED_PHONES[digitsOnly(body.phone)]
      if (client) return jsonResponse({ client })
      return jsonResponse({}, 404)
    }
    case 'link_to_salon':
      return jsonResponse({ client_id: MOCK_CLIENT_ID, salon_client: { salon_id: MOCK_SALON_UUID, client_id: MOCK_CLIENT_ID } })
    case 'create_or_get':
      return jsonResponse({ client: CLIENT_IDENTITY, created: false })
    case 'check_active':
      return jsonResponse({ blocked: false })
    case 'update':
      return jsonResponse({
        client: {
          ...CLIENT_IDENTITY,
          ...(body.full_name != null ? { full_name: body.full_name } : {}),
          ...(body.phone != null ? { phone: body.phone } : {}),
          ...(body.birth_date != null ? { birth_date: body.birth_date } : {}),
          ...(body.avatar_base64 != null ? { avatar_url: body.avatar_base64 } : {}),
        },
      })
    default:
      return jsonResponse({ error: `mock: acao desconhecida em /api/client-identity: ${body.action}` }, 400)
  }
}

const handleApi = async (path, input, init) => {
  const body = await parseJsonBody(input, init)

  if (path.startsWith('/api/appointments')) return handleAppointments(body)
  if (path.startsWith('/api/client-identity')) return handleClientIdentity(body)
  if (path.startsWith('/api/notify')) return jsonResponse({ success: true })
  if (path.startsWith('/api/criar-preferencia-plano')) {
    // Pagamento pelo app fica indisponível no mock (mp_connected=false).
    return jsonResponse({ error: 'Pagamento pelo app indisponível no mock.' }, 409)
  }

  // Outros /api/* não mapeados: 200 vazio para não quebrar a casca.
  return jsonResponse({})
}

// ---------------------------------------------------------------------------
// Semente da sessão leve do cliente (localStorage), escopada por slug.
// ---------------------------------------------------------------------------
const seedClientSession = () => {
  // OPT-IN: por padrão NÃO semeia — a casca abre deslogada e o wizard começa
  // pedindo o telefone. Ligue VITE_CLIENT_MOCK_SEED_SESSION=1 para abrir logado.
  if (import.meta.env.VITE_CLIENT_MOCK_SEED_SESSION !== '1') return
  try {
    const key = `client_session:${MOCK_SALON_SLUG}`
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({
        client_id: MOCK_CLIENT_ID,
        phone: CLIENT_IDENTITY.phone,
        full_name: CLIENT_IDENTITY.full_name,
        birth_date: CLIENT_IDENTITY.birth_date,
        avatar_url: CLIENT_IDENTITY.avatar_url,
      }))
    }
  } catch {
    // localStorage indisponível: a casca ainda renderiza a página pública (index).
  }
}

// ---------------------------------------------------------------------------
// Instalação do interceptor
// ---------------------------------------------------------------------------
export function installClientMock() {
  if (window.__CLIENT_MOCK_INSTALLED__) return
  window.__CLIENT_MOCK_INSTALLED__ = true

  const SUPA = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  seedClientSession()

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    let url
    try {
      url = getUrlString(input)
    } catch {
      return originalFetch(input, init)
    }

    try {
      if (SUPA && url.startsWith(SUPA)) {
        return handleSupabase(url, input, init)
      }
      // Endpoints serverless: relativos (/api/...) ou absolutos terminando em /api/...
      const apiIdx = url.indexOf('/api/')
      if (url.startsWith('/api/') || apiIdx >= 0) {
        const apiPath = url.startsWith('/api/') ? url : url.slice(apiIdx)
        return await handleApi(apiPath, input, init)
      }
    } catch (err) {
      // Falha inesperada no mock: não derruba a casca.
      return jsonResponse({ error: 'mock interno falhou' }, 500)
    }

    // Passthrough para qualquer outra URL (OneSignal SDK, assets, etc.)
    return originalFetch(input, init)
  }

  // Log dev-only para orientar o usuário no console do navegador.
  // eslint-disable-next-line no-console
  console.info(
    `[client-mock] Ativo. Acesse a casca do cliente em: /s/${MOCK_SALON_SLUG}`,
  )
}

export default installClientMock
