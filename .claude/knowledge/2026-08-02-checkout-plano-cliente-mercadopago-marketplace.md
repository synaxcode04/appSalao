# Checkout Plano Cliente — Mercado Pago Marketplace

**Agent:** orchestrator + rls-security + notifier + devops + code-reviewer + claude  
**Tipo:** feature  
**Data:** 2026-08-02

## Contexto

Feature: cliente do salão paga a assinatura de um plano via Mercado Pago (Checkout Pro), modelo MARKETPLACE — dinheiro vai 100% direto para a conta MP de cada DONO (sem comissão da plataforma), via OAuth por salão. Distinta da integração MP pré-existente (`criar-preferencia.js` + `mercado-pago-webhook.js`), que é a cobrança da LICENÇA do salão à plataforma (grava em payment_leads). Só Checkout Pro / pagamento manual avulso por ciclo de 30 dias — SEM recorrência/preapproval (fica para futuro).

## Achado crítico de infraestrutura

Existem DUAS pastas `api/`:
- `api/` (RAIZ do projeto) — versão órfã/desatualizada — `appointments.js` com 821 linhas
- `app/api/` — versão viva em produção — `appointments.js` com 1333 linhas

**Confirmação**: teste contra produção (`POST https://appsalao-psi.vercel.app/api/appointments` com action `list_client_subscriptions` retorna JSON de erro limpo, action que só existe na versão nova) prova que **a pasta servida em produção é `app/api/`**.

A `api/` da raiz é dangling (resíduo do incidente de 2026-08-01) — NÃO usar, NÃO deletar sem decisão explícita. **Todo endpoint novo vai em `app/api/`.**

## Arquitetura implementada

### OAuth Marketplace
- **`app/api/mp-oauth-start.js`**: dono inicia fluxo. Valida JWT do dono + ownership de salão, gera state HMAC anti-CSRF/replay (válido 10 min), redireciona para autorização MP
- **`app/api/mp-oauth-callback.js`**: troca `code` por tokens, grava em `salon_mp_credentials` com criação de índice para performance (salon_id, created_at), redireciona para `/painel/configuracoes?mp=conectado` ou `?mp=erro`
- **`app/api/_mpTokens.js`**: helper reutilizável. `getValidMpToken(salonId)` com refresh automático (margem de 60s antes do expirado)

### Criar preferência (checkout)
- **`app/api/criar-preferencia-plano.js`**: cria linha `client_subscriptions` com `payment_status='pending'`, usa token do DONO, `external_reference = client_subscriptions.id`, `notification_url` inclui `?salon_id=` (crítico em marketplace). Retorna 409 se salão não conectado ao MP
- Validações: salão existe, plano existe, cliente não tem outro ativo em ciclo corrente, dono autenticado

### Webhook de pagamento (fonte de verdade)
- **`app/api/mp-plano-webhook.js`**: 
  - Lê `salon_id` da query string (`notification_url?salon_id=...`)
  - Usa token do DONO (via `getValidMpToken(salon_id)`) para consultar `/v1/payments/{id}` — essencial em marketplace (token da plataforma não consegue acessar pagamentos da conta do vendedor)
  - Valida `payment.external_reference` contra `client_subscriptions.id`
  - Valida `sub.salon_id === salon_id` (defesa cross-tenant — cliente poderia forjar salon_id na query se não validasse)
  - HMAC validado via `crypto.timingSafeEqual`
  - Ativa: `payment_status='approved'`, `status='active'`, `started_at=now()`, `confirmed_by='webhook'`
  - **Idempotente**: ignora eventos duplicados (já em estado `approved`), não sobrescreve `started_at` se já definido

### Actions (serviço de negócio)
- **`get_salon_payment_options`** (appointments.js, `service_role`): retorna `{ mp_connected: boolean }` para cliente (sem auth) decidir se mostra "pagar pelo app"
- **`list_client_subscriptions`**: lista do cliente com filtro por status de pagamento (pending/approved/canceled)
- **`get_subscription_plan`**: retorna plano completo + serviços inclusos

### Frontend

- **`ClientPlans.jsx`**: exibe planos com 2 opções de pagamento:
  - Condicional: "Pagar pelo app" (se salão conectado ao MP, mostra Checkout Pro)
  - Sempre presente: "Pagar direto com dono via WhatsApp" (fallback)
  
- **`PaymentReturn.jsx`** + rota `/s/:slug/pagamento`: retorna do Checkout Pro (success/failure/pending). Lê parâmetro GET, atualiza UI com status
  
- **`Settings.jsx`** (painel dono): aba Configurações → Conectar MP, exibe status via RPC `is_salon_mp_connected()`
  
- **`PlansManager.jsx`** (painel dono): aba Assinantes, tabela de `client_subscriptions` do salão, ação "Marcar como pago" (via Supabase client autenticado do dono — UPDATE direto, não função, porque dono é autenticado)

### Banco de dados

Migration: `Documentos/mp_marketplace.sql`

Colunas adicionadas a `client_subscriptions`:
- `payment_status`: 'pending' | 'approved' | 'failed' (default 'pending')
- `gateway_ref`: ID do pagamento no MP (ex: `12345678`)
- `external_id`: ID retornado pela API (ex: `ext_ABC123`)
- `payment_method`: 'credit_card' | 'debit_card' | 'bank_transfer' | null
- `confirmed_by`: 'webhook' | 'manual' | 'system' (quem confirmou o pagamento)

Tabela: `salon_mp_credentials`
- `salon_id` (FK, unique, indexed)
- `access_token` (encrypted via `pgcrypto`)
- `refresh_token` (encrypted via `pgcrypto`)
- `token_expires_at` (timestamp)
- `created_at`, `updated_at`
- **RLS: DESABILITADO** (tabela acessível só via `service_role` — políticas NUNCA seriam suficientes para proteger credentials, mesmo com EXISTS JOIN). Nenhuma policy configurada; `supabase.from('salon_mp_credentials')` retornará erro se tentado com `anon` ou `authenticated`. Acesso sempre via Vercel Functions com token `service_role`.

Função PL/pgSQL: `is_salon_mp_connected(p_salon_id)`
- SECURITY DEFINER (roda com direitos da owner, não do chamador)
- Retorna `boolean` — dono vê só `true/false` se seu salão está conectado (não vê credenciais, token expirado, nada)
- Necessária porque **VIEW com RLS não existe no Postgres** — `ALTER VIEW ... ENABLE ROW LEVEL SECURITY` é inválido

## Armadilhas descobertas

### 1. Token da plataforma vs. token do dono em marketplace
Erro inicial: usar token da plataforma (`MP_CLIENT_ID`/`MP_CLIENT_SECRET` em Bearer) para consultar `/v1/payments/{id}` que caiu na conta do vendedor (dono).

**Resultado**: 404 — a API do MP não consegue retornar um pagamento "alheio" nem que a plataforma tenha acesso via OAuth.

**Solução**: usar o **token do DONO** (armazenado em `salon_mp_credentials.access_token`, refreshado se expirado). O webhook então:
1. Extrai `salon_id` da query (`notification_url?salon_id=...`)
2. Busca credenciais do DONO em `salon_mp_credentials` WHERE `salon_id = ?`
3. Chama `/v1/payments/{id}` com Bearer do DONO

### 2. HMAC — booleano vs. erro
`crypto.timingSafeEqual(hmac, recebida)` retorna **booleano**, não lança erro.

Erro pego em review: `if (!crypto.timingSafeEqual(...)) return 400` foi reescrito como `return crypto.timingSafeEqual(...) ? 200 : 400`, evitando a sutileza.

**Sempre verificar o retorno**, nunca passar como condição de erro.

### 3. RLS em VIEW não existe
Tentativa: criar VIEW com colunas derivadas e `ALTER VIEW ... ENABLE ROW LEVEL SECURITY`.

**Resultado**: erro no Postgres — não é sintaxe válida.

**Solução**: função SECURITY DEFINER + RPC. O dono chama `is_salon_mp_connected()` (RPC) e recebe `{ is_connected: boolean }`. A função só retorna boolean, sem vazar credenciais da tabela base.

### 4. ESLint — globals para Node
Arquivos `app/api/**` rodando em Node (processo Vercel), não browser.

Erro inicial: ESLint não reconhecia `process`, `Buffer`, `crypto`.

**Solução** em `eslint.config.js`:
```js
{
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.node,  // ← ADICIONADO
    }
  }
}
```

### 5. Validação de cross-tenant no webhook
Cliente pode forjar `notification_url?salon_id=123` para ativar assinatura de outro salão.

**Defesa em camadas**:
1. `external_reference` validado contra `client_subscriptions.id` (garante que o `id` existe e é do salão — porque cliente criou via `criar-preferencia-plano.js` que validou ownership)
2. `payment.external_reference` depois é consultado no DB — sua `salon_id` é comparada com a da query
3. Idempotência (se já `approved`, ignora duplicata)

## Estado atual / pendências (não deployado)

**Aprovação e testes:**
- Code-reviewer: Aprovado (sem bloqueantes)
- Build: passa (74/74 checks)
- Testes: todos passando

**Deploy BLOQUEADO** — aguardando:

1. **Configurar app OAuth no Mercado Pago**:
   - Criar aplicação em [Aplicaciones — Developers MP](https://www.mercadopago.com.br/developers/pt-BR/docs/checkout-pro/integration-configuration/how-to-integrate)
   - Coletar `Client ID` e `Client Secret` (sandbox + produção)
   - Configurar Redirect URI em `https://appsalao-psi.vercel.app/api/mp-oauth-callback`
   - Documentado em `Documentos/mercado_pago_oauth_setup.md` (criar se não existir)

2. **Configurar env vars no Vercel** (Production + Preview):
   - `MP_CLIENT_ID`
   - `MP_CLIENT_SECRET`
   - Via Vercel Dashboard → Settings → Environment Variables (não commitando `.env`)

3. **Aplicar migration no Supabase**:
   - Rodar `Documentos/mp_marketplace.sql` na base de produção
   - Verifica: colunas em `client_subscriptions`, tabela `salon_mp_credentials`, função `is_salon_mp_connected()`

4. **Teste ponta-a-ponta em sandbox**:
   - Dono: conectar ao MP via `/painel/configuracoes`
   - Cliente: ver "Pagar pelo app" em ClientPlans.jsx (if `mp_connected`)
   - Cliente: criar preferência → redireciona Checkout Pro
   - Simular pagamento aprovado via webhook (ou MP Simulator)
   - Verificar `client_subscriptions.status = 'active'` + `confirmed_by = 'webhook'`
   - Bloquear overlapping subscriptions do mesmo cliente no mesmo plano (cenário de overlap discovery pós-webhook)

**Não commitado** — aguardando confirmação do usuário para prosseguir com setup + deploy.

## Referências internas
- `CLAUDE.md` — "Feature em desenvolvimento — Planos de assinatura" (contexto de ciclo de 30 dias, extensibilidade de `client_subscriptions`)
- `Documentos/mp_marketplace.sql` — migration completa
- `Documentos/mercado_pago_oauth_setup.md` — instruções de app OAuth (criar se necessário)
- `app/api/_mpTokens.js` — refresh automático do token do dono
- `app/api/mp-oauth-start.js`, `mp-oauth-callback.js` — fluxo OAuth
- `app/api/criar-preferencia-plano.js` — criação de preferência com validações
- `app/api/mp-plano-webhook.js` — webhook idempotente com validações de cross-tenant
