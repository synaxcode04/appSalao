-- =============================================================================
-- mp_marketplace.sql — App Salão
-- Criado em: 2026-08-02
-- Descrição: Integração Mercado Pago Marketplace — OAuth por salão + colunas
--            de pagamento em client_subscriptions.
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
-- A. TOKENS OAuth NUNCA EXPOSTOS VIA anon key
--    salon_mp_credentials tem RLS habilitado e NENHUMA policy SELECT/INSERT/
--    UPDATE/DELETE criada. service_role bypassa RLS por design — é o único
--    mecanismo de acesso a tokens. Nem mesmo o dono autenticado (auth.uid())
--    lê as colunas de token diretamente.
--
-- B. O DONO VÊ APENAS STATUS BOOLEANO DE CONEXÃO
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
--    exibia o status de conexão MP) DEVE ser ajustado para chamar o RPC em vez
--    de fazer SELECT na view. Ver checklist de validação ao final deste arquivo.
--    Exemplo de chamada:
--      const { data } = await supabase.rpc('is_salon_mp_connected', { p_salon_id: salonId })
--      // data === true  → conectado
--      // data === false → não conectado ou dono não autorizado
--
-- C. payment_status = 'approved' É OBRIGATÓRIO PARA COTA ATIVA
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
-- D. payment_method SEM DEFAULT — nullable intencional
--    Assinaturas criadas antes desta migration não têm método de pagamento.
--    Forçar default 'mercado_pago' incorreria em dado falso para registros
--    históricos. A Vercel Function que cria a assinatura define o valor
--    explicitamente. NULL significa "registrado antes da integração de
--    pagamento" — tratar como 'external' na camada de aplicação se necessário.
--
-- E. ISOLAMENTO MULTI-TENANT PRESERVADO
--    As novas colunas de client_subscriptions não afetam o invariante
--    (client_id, salon_id, plan_id). A tabela salon_mp_credentials tem
--    salon_id como PRIMARY KEY — um salão tem no máximo uma credencial OAuth.
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
-- SEM DEFAULT FORÇADO: ver decisão D no cabeçalho. Nullable intencional.
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
-- Tokens OAuth do dono do salão para o Mercado Pago Marketplace.
--
-- CRÍTICO DE SEGURANÇA: ver decisão A no cabeçalho.
-- Nenhuma policy RLS é criada nesta tabela — service_role bypassa RLS e é o
-- único mecanismo de leitura/escrita de tokens. Qualquer policy SELECT aqui
-- exporia token via anon key, mesmo que restrita por auth.uid().
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.salon_mp_credentials (
  -- Um salão tem no máximo uma credencial OAuth (PK = salon_id)
  salon_id      UUID        PRIMARY KEY
                            REFERENCES public.salons(id) ON DELETE CASCADE,

  -- ID do usuário (dono) na plataforma Mercado Pago
  mp_user_id    TEXT,

  -- Token de acesso OAuth. NOT NULL: uma linha só existe se a conexão foi
  -- completada. Se o dono revogar o acesso, a linha é deletada (via service_role).
  access_token  TEXT        NOT NULL,

  -- Token para renovação quando access_token expirar. Nullable: alguns fluxos
  -- MP não retornam refresh_token (depende do scope solicitado).
  refresh_token TEXT,

  -- Quando o access_token expira. Nullable: MP pode não informar TTL.
  -- A Vercel Function deve verificar expires_at antes de usar o token e
  -- renovar via refresh_token se necessário.
  expires_at    TIMESTAMPTZ,

  -- Quando a conexão OAuth foi estabelecida pela primeira vez.
  connected_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Atualizado sempre que access_token é renovado via refresh_token.
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS habilitado — mas SEM policies. service_role bypassa RLS automaticamente.
-- Não criar policies aqui é a proteção, não uma omissão.
ALTER TABLE public.salon_mp_credentials ENABLE ROW LEVEL SECURITY;

-- Índice para lookup por mp_user_id (reconciliação OAuth callback → salão)
CREATE INDEX IF NOT EXISTS idx_salon_mp_credentials_mp_user_id
  ON public.salon_mp_credentials (mp_user_id)
  WHERE mp_user_id IS NOT NULL;


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
-- salon_mp_credentials — sem acesso via anon key
-- -----------------------------------------------
-- [ ] Com anon key: SELECT * FROM salon_mp_credentials → 0 linhas retornadas
--     (RLS habilitado sem policy SELECT = bloqueio total para anon/authenticated).
-- [ ] Com usuário autenticado como dono: SELECT * FROM salon_mp_credentials
--     → 0 linhas retornadas (mesma razão — sem policy SELECT na tabela base).
-- [ ] Com service_role: INSERT/SELECT em salon_mp_credentials → sucesso.
--     (Testar via SQL Editor no Dashboard, que usa service_role por padrão.)
-- [ ] ON DELETE CASCADE: deletar salão referenciado → linha em
--     salon_mp_credentials é removida automaticamente.
--
-- is_salon_mp_connected — função RPC substitui a view removida
-- -------------------------------------------------------------
-- [ ] View removida: SELECT * FROM salon_mp_connection_status → erro
--     "relation does not exist" (confirma remoção completa).
-- [ ] Função criada: SELECT proname FROM pg_proc WHERE proname = 'is_salon_mp_connected'
--     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
--     → Deve retornar 1 linha.
-- [ ] Não autenticado (anon key, sem sessão): SELECT public.is_salon_mp_connected('<uuid>')
--     → Deve retornar FALSE (auth.uid() IS NULL internamente).
-- [ ] Logado como dono do salão A, sem credencial MP cadastrada:
--     SELECT public.is_salon_mp_connected('<salon_A_id>') → FALSE.
-- [ ] Logado como dono do salão A, com credencial MP inserida via service_role:
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
