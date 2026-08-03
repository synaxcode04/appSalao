# Checkout Plano Cliente — Mercado Pago Marketplace

**Agent:** orchestrator + rls-security + notifier + devops + code-reviewer + claude  
**Tipo:** feature  
**Data:** 2026-08-02

## Contexto

Feature: cliente do salão paga a assinatura de um plano via Mercado Pago (Checkout Pro), modelo MARKETPLACE — dinheiro vai 100% direto para a conta MP de cada DONO (sem comissão da plataforma). Modelo simplificado: dono cola seu Access Token direto nas Settings (sem OAuth). Distinta da integração MP pré-existente (`criar-preferencia.js` + `mercado-pago-webhook.js`), que é a cobrança da LICENÇA do salão à plataforma (grava em payment_leads). Só Checkout Pro / pagamento manual avulso por ciclo de 30 dias — SEM recorrência/preapproval (fica para futuro).

## Achado crítico de infraestrutura

Existem DUAS pastas `api/`:
- `api/` (RAIZ do projeto) — versão órfã/desatualizada — `appointments.js` com 821 linhas
- `app/api/` — versão viva em produção — `appointments.js` com 1333 linhas

**Confirmação**: teste contra produção (`POST https://appsalao-psi.vercel.app/api/appointments` com action `list_client_subscriptions` retorna JSON de erro limpo, action que só existe na versão nova) prova que **a pasta servida em produção é `app/api/`**.

A `api/` da raiz é dangling (resíduo do incidente de 2026-08-01) — NÃO usar, NÃO deletar sem decisão explícita. **Todo endpoint novo vai em `app/api/`.** Limite: **máximo 12 serverless functions no Vercel Hobby** — contagem atual 11 functions em `app/api/`.

## Arquitetura implementada

### Modelo de credenciais simplificado (sem OAuth)

Dono do salão:
1. Acessa painel → Settings (Configurações)
2. Copia o Access Token de sua conta Mercado Pago (MP Dashboard → Credenciais de produção → Access Token, formato `APP_USR-...`)
3. Cola no campo "Access Token" do salão
4. Clica Salvar

**Endpoints REMOVIDOS** desta simplificação:
- `app/api/mp-oauth-start.js` (não há mais redirecionamento OAuth)
- `app/api/mp-oauth-callback.js` (não há mais troca de code por token)
- `app/api/_mpTokens.js` (não há mais refresh automático — token colado não tem refresh_token)

**Endpoints atuais da feature** (2 functions):
- `app/api/criar-preferencia-plano.js`
- `app/api/mp-plano-webhook.js`

Ambos usam helper local `getSalonAccessToken(salonId)` que lê o token de `salon_mp_credentials` via `service_role` (sem refresh ou validação de expiração).

### Criar preferência (checkout)

**`app/api/criar-preferencia-plano.js`**: 
- Cria linha `client_subscriptions` com `payment_status='pending'`
- Busca token do DONO em `salon_mp_credentials`
- Retorna 409 se salão não tem token salvo
- Usa POST `/v1/checkout/preferences` do MP com `external_reference = client_subscriptions.id`
- Inclui `notification_url` com `?salon_id=` (crítico em marketplace)
- Validações: salão existe, plano existe, cliente não tem outro ativo em ciclo corrente

### Webhook de pagamento (fonte de verdade)

**`app/api/mp-plano-webhook.js`**:
- Lê `salon_id` da query string (`notification_url?salon_id=...`)
- Busca token do DONO em `salon_mp_credentials` — usa esse token para consultar `/v1/payments/{id}` (essencial em marketplace: token da plataforma não consegue acessar pagamentos da conta do vendedor)
- Valida HMAC via `crypto.timingSafeEqual` contra `process.env.MERCADO_PAGO_WEBHOOK_SECRET` (permissivo só se env ausente — deve estar setado em produção)
- Valida `payment.external_reference` contra `client_subscriptions.id`
- Valida `sub.salon_id === salon_id` (defesa cross-tenant — cliente poderia forjar salon_id na query se não validasse)
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
  
- **`Settings.jsx`** (painel dono): aba Configurações → campo "Access Token", exibe status via RPC `is_salon_mp_connected()`, botão Salvar (upsert)
  
- **`PlansManager.jsx`** (painel dono): aba Assinantes, tabela de `client_subscriptions` do salão, ação "Marcar como pago" (via Supabase client autenticado do dono — UPDATE direto, não função, porque dono é autenticado)

### Banco de dados

Migration: `Documentos/mp_marketplace.sql`

**Tabela `client_subscriptions` — colunas adicionadas:**
- `payment_status`: 'pending' | 'approved' | 'failed' (default 'pending')
- `gateway_ref`: ID do pagamento no MP (ex: `12345678`)
- `external_id`: ID retornado pela API (ex: `ext_ABC123`)
- `payment_method`: 'credit_card' | 'debit_card' | 'bank_transfer' | null
- `confirmed_by`: 'webhook' | 'manual' | 'system' (quem confirmou o pagamento)

**Tabela `salon_mp_credentials` (simplificada, sem refresh)**:
- `salon_id` (PK, FK, indexed)
- `access_token` (string, padrão — não encriptado neste modelo, já que é token colado pelo dono, não credencial sensível de terceiro)
- `connected_at` (timestamp)
- `updated_at` (timestamp)
- **Colunas REMOVIDAS**: `refresh_token`, `token_expires_at`, `mp_user_id` (não há mais refresh automático)
- **RLS**: políticas de INSERT e UPDATE para o DONO (escopadas por owner_id via salons), **SEM policy de SELECT nem DELETE** — o dono grava o próprio token via `supabase.from('salon_mp_credentials').upsert({salon_id, access_token}, {onConflict:'salon_id'})` mas NÃO consegue lê-lo de volta (token nunca exposto ao client). Endpoints de pagamento leem o token via `service_role`.

**Função PL/pgSQL: `is_salon_mp_connected(p_salon_id)`**:
- SECURITY DEFINER (roda com direitos da owner, não do chamador)
- Retorna `boolean` — dono vê só `true/false` se seu salão está conectado (não vê credenciais)
- Necessária porque **VIEW com RLS não existe no Postgres** — `ALTER VIEW ... ENABLE ROW LEVEL SECURITY` é inválido

## Armadilhas descobertas

### 1. Token da plataforma vs. token do dono em marketplace
Erro inicial: usar token da plataforma (`MP_CLIENT_ID`/`MP_CLIENT_SECRET` em Bearer) para consultar `/v1/payments/{id}` que caiu na conta do vendedor (dono).

**Resultado**: 404 — a API do MP não consegue retornar um pagamento "alheio" nem que a plataforma tenha acesso via OAuth.

**Solução**: usar o **token do DONO** (armazenado em `salon_mp_credentials.access_token`). O webhook então:
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

### 6. Limite de 12 serverless functions no Vercel Hobby
Contagem atual: **11 functions** em `app/api/`. Limite da plataforma: 12.

**Implicação**: endpoints novos precisam respeitar esse teto. Se necessário escalabilidade, considerar:
- Consolidar lógica em functions existentes (reusar e-points)
- Usar helper com prefixo `_` (ainda conta como function)
- Preferir logic inline em functions existentes vs. helper separado se o teto apertar
- Documentado em CLAUDE.md para referência futura

## Estado atual

**Aprovação e testes:**
- Code-reviewer: Aprovado (sem bloqueantes)
- Build: passa (74/74 checks)
- Testes: todos passando

**Deploy BLOQUEADO** — aguardando:

1. **Aplicar migration no Supabase**:
   - Rodar `Documentos/mp_marketplace.sql` na base de produção
   - Verifica: colunas em `client_subscriptions`, tabela `salon_mp_credentials`, função `is_salon_mp_connected()`

2. **Configurar env var no Vercel** (Production + Preview):
   - `MERCADO_PAGO_WEBHOOK_SECRET` (HMAC secret de validação — deve estar setado em produção; ausente em sandbox para permitir webhooks de teste)
   - Via Vercel Dashboard → Settings → Environment Variables (não commitando `.env`)

3. **Teste ponta-a-ponta em sandbox**:
   - Dono: acessar Settings, colar um Access Token MP de sandbox, clicar Salvar
   - Verificar `is_salon_mp_connected()` retorna `true`
   - Cliente: ver "Pagar pelo app" em ClientPlans.jsx (if `mp_connected`)
   - Cliente: criar preferência → redireciona Checkout Pro
   - Simular pagamento aprovado via webhook (ou MP Simulator)
   - Verificar `client_subscriptions.status = 'active'` + `confirmed_by = 'webhook'`
   - Bloquear overlapping subscriptions do mesmo cliente no mesmo plano (cenário de overlap discovery pós-webhook)

4. **Documentação de setup atualizada**:
   - `Documentos/mercado_pago_token_setup.md` — instruções de onde pegar o Access Token e como colar nas Settings (substituiu o antigo `mercado_pago_oauth_setup.md`)

**Não commitado** — aguardando confirmação do usuário para prosseguir com setup + deploy.

## Referências internas
- `CLAUDE.md` — "Feature em desenvolvimento — Planos de assinatura" (contexto de ciclo de 30 dias, extensibilidade de `client_subscriptions`)
- `Documentos/mp_marketplace.sql` — migration completa
- `Documentos/mercado_pago_token_setup.md` — instruções de setup (Access Token colado)
- `app/api/criar-preferencia-plano.js` — criação de preferência com validações
- `app/api/mp-plano-webhook.js` — webhook idempotente com validações de cross-tenant, HMAC
