---
**Agent:** general-purpose (via orchestrator)
**Tipo:** feature

# Mock DEV-ONLY / descartável da casca do módulo cliente (/s/:slug)

## Contexto / objetivo
Permitir visualizar a "casca" (shell) da UI do módulo cliente rodando com
`npm run dev`, SEM backend real (Supabase) e SEM as Vercel Functions `/api/*`
(que não existem em dev). O mecanismo é dev-only, isolado e descartável — não
altera o produto nem entra no build de produção.

## Como funciona
Um único arquivo dev-only, `app/src/dev/clientMock.js`, exporta
`installClientMock()`, que:
1. Instala um interceptor em `window.fetch`:
   - URLs que começam com `VITE_SUPABASE_URL` → responde REST/PostgREST
     fictício (`salons` via `.single()` = objeto; `services`, `professionals`,
     `subscription_plans`, `time_blocks` = arrays; `working_hours` via
     `.maybeSingle()` = array com 1 linha, pois o postgrest-js pega `[0]`).
     Endpoints `/auth/*` respondem `{}` (cliente usa sessão leve, sem Supabase Auth).
   - `/api/*` (appointments, client-identity, notify, criar-preferencia-plano)
     → respostas fictícias no shape esperado (ex.: `{ appointments: [...] }`,
     `{ subscriptions: [...] }`, `{ client: {...} }`, `{ blocked: false }`).
   - Qualquer outra URL → passthrough para o `fetch` original.
2. Semeia uma sessão leve de cliente em `localStorage`
   (`client_session:<slug>`) para exibir o bottom-nav e liberar as rotas
   protegidas por `ClientRoute` (agenda/planos/historico/perfil).

Detalhe técnico chave: o `@supabase/postgrest-js` chama `fetch(...)` como
identificador livre (resolvido em runtime), então sobrescrever `window.fetch`
DEPOIS do `createClient` funciona. `.single()` envia
`Accept: application/vnd.pgrst.object+json` (devolver objeto); `.maybeSingle()`
usa Accept padrão de array e o cliente pega `[0]` (devolver array de 1 item).

## Onde vive / como ativar
- Mock: `app/src/dev/clientMock.js` (pasta `app/src/dev/` criada só para isso).
- Guard em `app/src/main.jsx` (topo do bootstrap, IIFE async antes do
  `createRoot`):
  ```js
  if (import.meta.env.DEV && import.meta.env.VITE_CLIENT_MOCK === '1') {
    const { installClientMock } = await import('./dev/clientMock.js')
    installClientMock()
  }
  ```
  Import dinâmico + guarda `import.meta.env.DEV` ⇒ tree-shaken no build de prod.
- Flag + creds DUMMY em `app/.env.development.local` (gitignored via `.env*.local`):
  `VITE_CLIENT_MOCK=1`, `VITE_SUPABASE_URL=https://mock.supabase.co`,
  `VITE_SUPABASE_ANON_KEY=mock-anon-key`.
  Usei `.env.development.local` (NÃO `.env.local`) de propósito: o Vite só o
  carrega em `mode=development` (`npm run dev`), então `npm run build`
  (mode=production) NÃO vê a flag nem as creds dummy — o `app/.env` real
  continua valendo no build, e nada de mock/dummy contamina produção.

## URL para acessar (dev)
`https://localhost:5173/s/11111111-1111-4111-8111-111111111111-salao-teste`
(a porta pode variar se 5173 estiver ocupada — ver output do Vite).
Sub-rotas: `/agenda`, `/planos`, `/historico`, `/perfil` e o index (detalhes do
salão + wizard de agendamento).

## Verificação
- `npm run build` passou (mode=production). Confirmado via grep que
  `installClientMock`/`MOCK_SALON_UUID`/`salao-teste` e as creds dummy
  (`mock.supabase.co`/`mock-anon-key`) NÃO aparecem em `dist/`.
- `npm run dev` sobe e responde HTTP 200 na rota da casca do cliente.

## Descartável
Para remover por completo: apagar `app/src/dev/clientMock.js`,
`app/.env.development.local` e o bloco `if (import.meta.env.DEV && ...)` de
`app/src/main.jsx`. Nada mais depende disso.

## Limitações conhecidas (honestidade)
- Push (OneSignal) não funciona no mock (SDK depende de rede/registro real);
  o botão "Ativar Avisos" no perfil não conclui.
- O `<link rel="manifest" href="/api/manifest?slug=...">` injetado pelo
  SalonLayout dá 404 em dev (não é `fetch`, é o browser) — inofensivo.
- "Pagar pelo app" (Mercado Pago) fica oculto de propósito
  (`get_salon_payment_options` → `mp_connected: false`).
