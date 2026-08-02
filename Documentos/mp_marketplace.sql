-- =============================================================================
-- mp_marketplace.sql — App Salão
-- Criado em: 2026-08-02
-- Descrição: Integração Mercado Pago Marketplace — token colado pelo dono em
--            Settings + colunas de pagamento em client_subscriptions.
--
-- !! APLICAÇÃO MANUAL !!
-- Execute este arquivo manualmente no Supabase Dashboard → SQL Editor.
-- NÃO aplicar via código ou deploy automatizado.
-- Supabase Dashboard → SQL Editor → New query → cole este arquivo → Run.
--
-- ORDEM DE EXECUÇÃO OBRIGATÓRIA (este arquivo é o 6º da sequência):
--   1. schema.sql
--   2. rls_fix.sql
--   3. add_slot_interval_minutes.sql
--   4. client_identity.sql
--   5. subscription_plans.sql   (cria client_subscriptions — FK obrigatória aqui)
--   6. mp_marketplace.sql       (este arquivo)
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- DROP POLICY IF EXISTS, blocos DO $$ para índices/constraints nomeadas.
-- Seguro para re-execução sem efeitos colaterais.
--
-- =============================================================================
-- DECISÕES DE ARQUITETURA
-- =============================================================================
--
-- A. TOKEN COLADO MANUALMENTE PELO DONO — SEM FLUXO OAUTH
--    O dono obtém o Access Token no painel do Mercado Pago e cola no campo de
--    Settings do app. Não há redirect OAuth, callback nem refresh_token.
--    As colunas refresh_token, expires_at e mp_user_id foram removidas da tabela
--    salon_mp_credentials por não fazerem sentido fora de um fluxo OAuth.
--
-- B. DONO GRAVA O TOKEN DIRETO VIA SUPABASE CLIENT AUTENTICADO
--    salon_mp_credentials tem RLS habilitado. Duas policies são criadas:
--      - INSERT: dono autentica (auth.uid()), verifica ownership, insere.
--      - UPDATE: dono autenticado pode substituir o próprio token (upsert).
--    NENHUMA policy SELECT é criada — o dono NÃO consegue ler o token de volta.
--    A leitura do token continua exclusiva de service_role (usada pelos endpoints
--    de pagamento). Essa assimetria (escreve mas não lê) é a proteção: o token
--    nunca é exposto ao client-side mesmo para o dono.
--
-- C. O DONO VÊ APENAS STATUS BOOLEANO DE CONEXÃO
--    A função SECURITY DEFINER public.is_salon_mp_connected(p_salon_id uuid)
--    expõe apenas um boolean (connected) sem nenhuma coluna de token.
--    Ela valida que auth.uid() é o dono de p_salon_id antes de retornar.
--    O token cru nunca sai do contexto service_role.
--
--    NOTA SOBRE A ABORDAGEM ESCOLHIDA (Opção B — função SECURITY DEFINER):
--    A view original com ALTER VIEW ... ENABLE ROW LEVEL SECURITY + CREATE POLICY
--    ON <view> foi REMOVIDA porque RLS não é suportado em views no PostgreSQL —
--    apenas em tabelas. Usar ALTER VIEW ... ENABLE ROW LEVEL SECURITY resultaria
--    em erro de execução ou, pior, em execução parcial que deixaria a view
--    exposta sem filtro de dono.
--    A Opção A (SECURITY INVOKER) foi descartada porque exigiria conceder SELECT
--    na tabela base salon_mp_credentials ao dono autenticado, reexpondo o token.
--    A Opção B (SECURITY DEFINER) resolve: a função lê salon_mp_credentials com
--    privilégios de seu definidor (service_role equivalente), valida ownership
--    internamente via auth.uid(), e retorna apenas o boolean — sem jamais expor
--    colunas de token ao chamador.
--
--    IMPACTO NO FRONTEND: app/src/pages/owner/Settings.jsx (ou equivalente que
--    exibia o status de conexão MP) DEVE chamar o RPC em vez de SELECT na tabela.
--    Exemplo de chamada:
--      const { data } = await supabase.rpc('is_salon_mp_connected', { p_salon_id: salonId })
--      // data === true  → conectado
--      // data === false → não conectado ou dono não autorizado
--
-- D. payment_status = 'approved' É OBRIGATÓRIO PARA COTA ATIVA
--    A migration anterior (subscription_plans.sql) modelou assinatura ativa
--    apenas com status = 'active'. Com a introdução do gateway, a semântica
--    muda: uma assinatura só gera direito a cota quando AMBOS:
--      status = 'active'  AND  payment_status = 'approved'
--    A Vercel Function que valida cota (appointments.js ou similar) DEVE
--    incluir AND payment_status = 'approved' em todo SELECT de assinaturas
--    ativas. Assinaturas criadas antes desta migration terão payment_status
--    DEFAULT 'pending' — o dono pode atualizá-las via painel (UPDATE via
--    Supabase client autenticado, coberto pela policy existente de UPDATE).
--    Para assinaturas pagas fora do app (dono confirmou no braço), o campo
--    payment_method = 'external' e confirmed_by = 'owner' documentam isso.
--
-- E. payment_method SEM DEFAULT — nullable intencional
--    Assinaturas criadas antes desta migration não têm método de pagamento.
--    Forçar default 'mercado_pago' incorreria em dado falso para registros
--    históricos. A Vercel Function que cria a assinatura define o valor
--    explicitamente. NULL significa "registrado antes da integração de
--    pagamento" — tratar como 'external' na camada de aplicação se necessário.
--
-- F. ISOLAMENTO MULTI-TENANT PRESERVADO
--    As novas colunas de client_subscriptions não afetam o invariante
--    (client_id, salon_id, plan_id). A tabela salon_mp_credentials tem
--    salon_id como PRIMARY KEY — um salão tem no máximo uma credencial.
--    Credenciais de donos diferentes são completamente isoladas.
--
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: ALTER TABLE public.client_subscriptions
-- Adiciona colunas de pagamento preparadas em subscription_plans.sql decisão 3.
-- =============================================================================

-- payment_status: estado do pagamento no gateway.
-- Valores esperados: 'pending' | 'approved' | 'rejected'
-- Default 'pending' é seguro: assinaturas antigas ficam pendentes e não geram
-- cota até o dono ou o webhook atualizarem para 'approved'.
-- CHECK permissivo abaixo — se o MP adicionar novos status no futuro (ex:
-- 'in_process', 'refunded'), a constraint não quebra o webhook. Valide os
-- valores críticos na camada de aplicação (Vercel Function), não só no CHECK.
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- ATENÇÃO: constraint nomeada — adicionar apenas se não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'client_subscriptions'
      AND constraint_name = 'client_subscriptions_payment_status_check'
  ) THEN
    ALTER TABLE public.client_subscriptions
      ADD CONSTRAINT client_subscriptions_payment_status_check
      CHECK (payment_status IN ('pending', 'approved', 'rejected', 'in_process', 'refunded', 'cancelled'));
  END IF;
END;
$$;

-- gateway_ref: id do pagamento retornado pelo Mercado Pago (campo `id` do objeto
-- payment na API). Gravado pelo webhook após confirmação.
-- Nullable: ausente até o webhook processar o evento.
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS gateway_ref TEXT;

-- external_id: id da preferência de checkout criada no MP (preference.id).
-- Gerado pela Vercel Function ao iniciar o fluxo de checkout antes do pagamento.
-- Permite reconciliar preferência → pagamento → assinatura.
-- Nullable: ausente em assinaturas criadas fora do fluxo MP (payment_method='external').
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS external_id TEXT;

-- payment_method: como o pagamento foi registrado.
-- 'mercado_pago' = fluxo Checkout Pro via app.
-- 'external'     = cliente pagou diretamente com o dono fora do app;
--                  dono confirma manualmente no painel (confirmed_by='owner').
-- NULL           = registrado antes da integração de pagamento — tratar como
--                  'external' na camada de aplicação se necessário.
-- SEM DEFAULT FORÇADO: ver decisão E no cabeçalho. Nullable intencional.
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'client_subscriptions'
      AND constraint_name = 'client_subscriptions_payment_method_check'
  ) THEN
    ALTER TABLE public.client_subscriptions
      ADD CONSTRAINT client_subscriptions_payment_method_check
      CHECK (payment_method IN ('mercado_pago', 'external'));
  END IF;
END;
$$;

-- confirmed_by: quem confirmou o pagamento.
-- 'webhook' = confirmado automaticamente pelo webhook do MP.
-- 'owner'   = dono confirmou manualmente no painel (casos 'external' ou fallback).
-- Nullable: ausente até a confirmação ocorrer.
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'client_subscriptions'
      AND constraint_name = 'client_subscriptions_confirmed_by_check'
  ) THEN
    ALTER TABLE public.client_subscriptions
      ADD CONSTRAINT client_subscriptions_confirmed_by_check
      CHECK (confirmed_by IN ('webhook', 'owner'));
  END IF;
END;
$$;

-- Índice para queries frequentes de webhook/reconciliação (buscar por gateway_ref)
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_gateway_ref
  ON public.client_subscriptions (gateway_ref)
  WHERE gateway_ref IS NOT NULL;

-- Índice para buscar por preferência de checkout (external_id)
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_external_id
  ON public.client_subscriptions (external_id)
  WHERE external_id IS NOT NULL;

-- Índice para filtrar assinaturas aprovadas por salão (query crítica de cota)
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_salon_payment_status
  ON public.client_subscriptions (salon_id, payment_status);


-- =============================================================================
-- SEÇÃO 2: CREATE TABLE public.salon_mp_credentials
-- Armazena o Access Token colado manualmente pelo dono em Settings.
--
-- MODELO: sem OAuth — sem refresh_token, expires_at, mp_user_id.
-- O dono obtém o token no painel do Mercado Pago e cola no app.
-- O token nunca é lido de volta pelo client-side (sem policy SELECT).
-- service_role lê o token para os endpoints de pagamento (bypassa RLS).
--
-- IDEMPOTÊNCIA: se a tabela já existia de uma execução anterior com as colunas
-- OAuth, os ALTER TABLE ... DROP COLUMN IF EXISTS abaixo as removem de forma
-- segura sem recriar a tabela inteira.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.salon_mp_credentials (
  -- Um salão tem no máximo uma credencial (PK = salon_id)
  salon_id      UUID        PRIMARY KEY
                            REFERENCES public.salons(id) ON DELETE CASCADE,

  -- Access Token colado pelo dono. NOT NULL: uma linha só existe se o dono
  -- colou um token. Para desconectar, a linha é deletada (via service_role ou
  -- policy DELETE futura — não criada agora).
  access_token  TEXT        NOT NULL,

  -- Quando o token foi colado pela primeira vez.
  connected_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Atualizado sempre que o dono substitui o token.
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Remove colunas do fluxo OAuth caso a tabela já existisse de execução anterior.
-- Idempotente: DROP COLUMN IF EXISTS não falha se a coluna não existir.
ALTER TABLE public.salon_mp_credentials DROP COLUMN IF EXISTS refresh_token;
ALTER TABLE public.salon_mp_credentials DROP COLUMN IF EXISTS expires_at;
ALTER TABLE public.salon_mp_credentials DROP COLUMN IF EXISTS mp_user_id;

-- RLS habilitado.
ALTER TABLE public.salon_mp_credentials ENABLE ROW LEVEL SECURITY;

-- Remove policies anteriores caso existam (idempotência de re-execução).
DROP POLICY IF EXISTS "Owners can insert their mp credentials" ON public.salon_mp_credentials;
DROP POLICY IF EXISTS "Owners can update their mp credentials" ON public.salon_mp_credentials;

-- INSERT: dono autenticado insere o token do próprio salão.
-- auth.uid() IS NOT NULL garante que anon nunca passa — defesa em profundidade
-- além do REVOKE abaixo.
CREATE POLICY "Owners can insert their mp credentials"
ON public.salon_mp_credentials FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = salon_mp_credentials.salon_id
      AND s.owner_id = auth.uid()
  )
);

-- UPDATE: dono autenticado substitui o token do próprio salão (upsert).
-- USING valida a linha existente; WITH CHECK valida o novo valor.
-- Ambos usam a mesma verificação de ownership.
CREATE POLICY "Owners can update their mp credentials"
ON public.salon_mp_credentials FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = salon_mp_credentials.salon_id
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = salon_mp_credentials.salon_id
      AND s.owner_id = auth.uid()
  )
);

-- SEM policy SELECT: o dono NÃO consegue ler o token de volta via anon key.
-- O status de conexão é obtido via RPC is_salon_mp_connected (retorna boolean).
-- SEM policy DELETE: remoção de credencial é operação administrativa futura
-- (via service_role ou policy dedicada quando necessário).

-- Índice para lookup futuro por access_token (reconciliação, se necessário).
-- Mantido mínimo: sem índice em mp_user_id (coluna removida).
-- Nenhum índice adicional necessário com o modelo de token colado.


-- =============================================================================
-- SEÇÃO 3: FUNÇÃO public.is_salon_mp_connected(p_salon_id uuid)
--
-- BLOQUEANTE CORRIGIDO: a abordagem anterior usava ALTER VIEW ... ENABLE ROW
-- LEVEL SECURITY + CREATE POLICY ON <view>, que é INVÁLIDO no PostgreSQL —
-- RLS só é suportado em tabelas, não em views. A migration falharia ou, em
-- execução parcial, exporia a view sem filtro de dono (todos os donos
-- autenticados veriam o status de conexão de todos os salões).
--
-- ABORDAGEM ESCOLHIDA: Opção B — função SECURITY DEFINER.
-- Motivo da escolha sobre Opção A (SECURITY INVOKER + view filtrada):
--   A Opção A exigiria conceder SELECT em salon_mp_credentials ao dono para
--   que a view funcionasse com SECURITY INVOKER — reexpondo o access_token.
--   A Opção B executa com os privilégios do definidor (sem precisar expor
--   SELECT na tabela base ao dono), valida ownership internamente via
--   auth.uid(), e retorna apenas boolean — o token nunca é acessível ao
--   chamador.
--
-- COMPATIBILIDADE COM MODELO DE TOKEN COLADO:
--   A função verifica access_token IS NOT NULL — segue 100% válida com a
--   tabela simplificada (sem refresh_token/expires_at/mp_user_id).
--
-- GARANTIAS:
--   (1) access_token nunca legível pelo dono autenticado.
--   (2) Dono só obtém resultado para o próprio salão (ownership validado
--       internamente). Para salon_id de outro dono, retorna FALSE.
--   (3) auth.uid() IS NULL (anon/cliente sem sessão) → retorna FALSE.
--   (4) Sintaxe 100% válida no PostgreSQL/Supabase.
--
-- IMPACTO NO FRONTEND — AÇÃO NECESSÁRIA:
--   app/src/pages/owner/Settings.jsx (ou qualquer componente que exibia o
--   status de conexão MP via SELECT na view salon_mp_connection_status) DEVE
--   ser atualizado para chamar o RPC em vez de ler a view.
--   Exemplo de chamada no frontend (supabase.js client autenticado como dono):
--
--     const { data: connected, error } = await supabase
--       .rpc('is_salon_mp_connected', { p_salon_id: salonId })
--     // connected === true  → MP conectado
--     // connected === false → não conectado ou dono não é owner do salão
--     // error               → tratar como não conectado / logar
--
--   A view salon_mp_connection_status é removida por esta migration (DROP VIEW
--   abaixo). Qualquer SELECT direto na view falhará com "relation does not
--   exist" após aplicar este arquivo — isso é intencional e deve ser corrigido
--   no frontend antes do deploy.
-- =============================================================================

-- Remove a view inválida (caso exista de execução anterior parcial).
-- Idempotente: IF EXISTS garante que re-execução não falha se já foi removida.
DROP VIEW IF EXISTS public.salon_mp_connection_status;

-- Cria (ou substitui) a função SECURITY DEFINER.
-- SECURITY DEFINER: executa com privilégios do owner da função (postgres/service),
-- que bypassa RLS em salon_mp_credentials — sem nunca expor o token ao chamador.
-- search_path fixo (set_config): boa prática de segurança para funções SECURITY
-- DEFINER, evita search_path injection.
CREATE OR REPLACE FUNCTION public.is_salon_mp_connected(p_salon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_connected BOOLEAN;
BEGIN
  -- Rejeita chamadas anônimas (cliente sem sessão, anon key puro).
  -- auth.uid() é NULL quando não há sessão Supabase Auth ativa.
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Valida que o chamador é o dono do salão solicitado.
  -- Sem esta verificação, qualquer dono autenticado consultaria status de
  -- qualquer salão passando um salon_id arbitrário.
  SELECT owner_id INTO v_owner_id
  FROM public.salons
  WHERE id = p_salon_id;

  IF v_owner_id IS NULL OR v_owner_id <> auth.uid() THEN
    -- Salão não existe ou chamador não é o dono — retorna FALSE sem vazar
    -- informação de existência do salão.
    RETURN FALSE;
  END IF;

  -- Verifica existência de credencial na tabela base (lida com privilégio
  -- SECURITY DEFINER — access_token nunca é retornado ao chamador).
  SELECT (access_token IS NOT NULL) INTO v_connected
  FROM public.salon_mp_credentials
  WHERE salon_id = p_salon_id;

  -- Se não há linha na tabela, v_connected será NULL → retorna FALSE.
  RETURN COALESCE(v_connected, FALSE);
END;
$$;

-- Revoga acesso público padrão e concede apenas a roles autenticadas.
-- 'authenticated' cobre donos logados via Supabase Auth.
-- anon não deve chamar esta função (já tratado internamente pelo auth.uid() IS NULL,
-- mas revogar EXECUTE em anon é defesa em profundidade).
REVOKE ALL ON FUNCTION public.is_salon_mp_connected(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_salon_mp_connected(UUID) TO authenticated;


-- =============================================================================
-- FIM DA MIGRATION
-- =============================================================================
--
-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO MANUAL (Supabase Dashboard após aplicar)
-- =============================================================================
--
-- client_subscriptions — novas colunas
-- -------------------------------------
-- [ ] SELECT column_name FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'client_subscriptions'
--     AND column_name IN ('payment_status','gateway_ref','external_id',
--                         'payment_method','confirmed_by');
--     → Deve retornar 5 linhas.
-- [ ] INSERT de nova client_subscription sem as novas colunas → sucesso;
--     SELECT da linha: payment_status = 'pending', demais = NULL.
-- [ ] UPDATE payment_status = 'approved' em assinatura do salão A pelo dono A
--     → sucesso (coberto pela policy UPDATE existente de subscription_plans.sql).
-- [ ] payment_status = 'invalid_value' → erro (CHECK violation).
-- [ ] payment_method = 'stripe' → erro (CHECK violation).
-- [ ] confirmed_by = 'admin' → erro (CHECK violation).
--
-- salon_mp_credentials — estrutura simplificada (sem colunas OAuth)
-- -----------------------------------------------------------------
-- [ ] SELECT column_name FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'salon_mp_credentials';
--     → Deve retornar APENAS: salon_id, access_token, connected_at, updated_at.
--     → NÃO deve conter: refresh_token, expires_at, mp_user_id.
--
-- salon_mp_credentials — INSERT/UPDATE pelo dono autenticado
-- ----------------------------------------------------------
-- [ ] Logado como dono do salão A: INSERT INTO salon_mp_credentials
--     (salon_id, access_token) VALUES ('<salon_A_id>', 'token_teste') → sucesso.
-- [ ] Mesmo dono: UPDATE salon_mp_credentials SET access_token = 'token_novo'
--     WHERE salon_id = '<salon_A_id>' → sucesso (upsert de token).
-- [ ] Logado como dono do salão A tentando INSERT com salon_id = '<salon_B_id>'
--     (de outro dono) → erro RLS (policy WITH CHECK rejeita).
-- [ ] Não autenticado (anon key): INSERT em salon_mp_credentials → erro RLS.
--
-- salon_mp_credentials — token NUNCA lido pelo client-side
-- --------------------------------------------------------
-- [ ] Logado como dono do salão A: SELECT * FROM salon_mp_credentials
--     → 0 linhas retornadas (sem policy SELECT = bloqueio total para authenticated).
-- [ ] Com anon key: SELECT * FROM salon_mp_credentials
--     → 0 linhas retornadas (mesma razão).
-- [ ] Com service_role (SQL Editor do Dashboard): SELECT * FROM salon_mp_credentials
--     → retorna as linhas normalmente (service_role bypassa RLS).
-- [ ] ON DELETE CASCADE: deletar salão referenciado → linha em
--     salon_mp_credentials é removida automaticamente.
--
-- is_salon_mp_connected — função RPC (status boolean apenas)
-- ----------------------------------------------------------
-- [ ] View removida: SELECT * FROM salon_mp_connection_status → erro
--     "relation does not exist" (confirma remoção completa).
-- [ ] Função criada: SELECT proname FROM pg_proc WHERE proname = 'is_salon_mp_connected'
--     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
--     → Deve retornar 1 linha.
-- [ ] Não autenticado (anon key, sem sessão): SELECT public.is_salon_mp_connected('<uuid>')
--     → Deve retornar FALSE (auth.uid() IS NULL internamente).
-- [ ] Logado como dono do salão A, sem credencial MP cadastrada:
--     SELECT public.is_salon_mp_connected('<salon_A_id>') → FALSE.
-- [ ] Logado como dono do salão A, após INSERT do token:
--     SELECT public.is_salon_mp_connected('<salon_A_id>') → TRUE.
-- [ ] Logado como dono do salão A, consultando salão B (de outro dono):
--     SELECT public.is_salon_mp_connected('<salon_B_id>') → FALSE
--     (ownership check interno rejeita silenciosamente).
-- [ ] Confirmar que access_token nunca é retornado: a função retorna apenas BOOLEAN.
--     Não há forma de extrair o token via este RPC.
-- [ ] Frontend — AÇÃO NECESSÁRIA: verificar que Settings.jsx (ou componente
--     equivalente) foi atualizado para usar:
--       supabase.rpc('is_salon_mp_connected', { p_salon_id: salonId })
--     em vez de SELECT na view removida. Sem este ajuste de frontend o painel
--     do dono exibirá erro ao tentar carregar o status de conexão MP.
--
-- Semântica de cota com payment_status (validar na Vercel Function, não no banco)
-- --------------------------------------------------------------------------------
-- [ ] Assinatura com status='active' e payment_status='pending'
--     → Vercel Function NÃO deve conceder cota (pagamento não confirmado).
-- [ ] Assinatura com status='active' e payment_status='approved'
--     → Vercel Function concede cota normalmente.
-- [ ] Assinatura com status='canceled' e payment_status='approved'
--     → Vercel Function NÃO concede cota (cancelada).
-- [ ] Assinatura criada antes desta migration (payment_status='pending' por default)
--     → Dono pode atualizar para 'approved' via painel (UPDATE autenticado).
--
-- =============================================================================
