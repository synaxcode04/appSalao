-- =============================================================================
-- subscription_plans.sql — App Salão
-- Criado em: 2026-08-01
-- Descrição: Cadastro de planos de assinatura por salão (Fase 1 — sem gateway de pagamento)
--
-- ORDEM DE EXECUÇÃO OBRIGATÓRIA:
--   1. schema.sql            (estrutura base + policies)
--   2. rls_fix.sql           (correção RLS multi-tenant + colunas salons)
--   3. add_slot_interval_minutes.sql  (slot_interval_minutes em salons)
--   4. client_identity.sql   (tabelas clients + salon_clients — FK obrigatória aqui)
--   5. subscription_plans.sql  (este arquivo)
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, bloco DO $$
-- para constraints nomeadas. Seguro para re-execução.
--
-- =============================================================================
-- INVARIANTE CRÍTICO: ISOLAMENTO DE ASSINATURA POR SALÃO
-- =============================================================================
--
-- Toda assinatura em client_subscriptions é ESTRITAMENTE escopada ao salão onde
-- foi contratada. O escopo completo de uma assinatura é a tripla:
--
--     (client_id, salon_id, plan_id)
--
-- Um cliente (identidade global via telefone na tabela `clients`) PODE ter
-- assinaturas ativas SIMULTÂNEAS em salões diferentes — isso é permitido e
-- esperado no modelo multi-tenant. Essas assinaturas são completamente isoladas:
-- o plano do salão A NUNCA vale no salão B.
--
-- Consequências obrigatórias para todo código que consulta assinaturas ou cota:
--
--   a) Toda query de "o cliente tem plano ativo?" DEVE filtrar por salon_id,
--      não apenas por client_id. Exemplo correto:
--        SELECT * FROM client_subscriptions
--        WHERE client_id = $1 AND salon_id = $2 AND status = 'active'
--      Exemplo ERRADO (viola o isolamento):
--        SELECT * FROM client_subscriptions
--        WHERE client_id = $1 AND status = 'active'   -- pode retornar planos de outro salão
--
--   b) Toda contagem de uso por ciclo de 30 dias (COUNT em appointments para checar cota)
--      DEVE incluir salon_id no filtro — ver decisão 2 abaixo e comentário
--      junto à tabela client_subscriptions.
--
--   c) Validação de "plano ativo" feita em Vercel Function com service_role
--      deve sempre receber e propagar salon_id como parâmetro obrigatório.
--
-- =============================================================================
-- DECISÕES DE ARQUITETURA (registradas aqui para referência dos próximos agents)
-- =============================================================================
--
-- 1. PLANO É POR SALÃO — cada salão define seus próprios planos, preços e serviços.
--    Não existe entidade global de plano; subscription_plans.salon_id é NOT NULL.
--
-- 2. CICLO DE 30 DIAS A PARTIR DA DATA DE ASSINATURA — a cota não é um contador
--    armazenado. O uso é DERIVADO: contamos agendamentos em appointments com
--    status = 'scheduled' cujo appointment_date esteja dentro do ciclo de 30 dias
--    corrente, calculado a partir de client_subscriptions.started_at
--    (fallback: created_at se started_at for NULL).
--    Fórmula do ciclo corrente (calculada em JavaScript/SQL na Vercel Function):
--      cyclesElapsed = FLOOR((CURRENT_DATE - started_at::date) / 30)
--      inicio_ciclo  = started_at::date + cyclesElapsed * 30
--      fim_ciclo     = inicio_ciclo + 30  (exclusive)
--    Exemplo: assinou dia 15/jan → ciclo corrente vai de 15/jan a 14/fev;
--    reinicia em 15/fev independentemente do mês-calendário.
--    NÃO usar DATE_TRUNC('month', ...) — o ciclo NÃO é mês-calendário.
--    Sem acúmulo entre ciclos: uso não consumido no ciclo anterior é descartado
--    naturalmente pela janela de data.
--    A Vercel Function que valida/consome cota executa um COUNT na tabela
--    appointments filtrando por:
--      - salon_id + client_id + service_id + [inicio_ciclo, fim_ciclo) + status = 'scheduled'
--    OBRIGATÓRIO: salon_id DEVE estar presente nesse filtro — nunca filtrar só por
--    client_id + service_id, pois isso cruzaria uso entre salões distintos e violaria
--    o invariante de isolamento acima. Ver também comentário na tabela client_subscriptions.
--
-- 3. SEM PAGAMENTO REAL (Fase 1) — client_subscriptions é um registro administrativo.
--    Colunas de gateway (payment_status, gateway_ref, external_id) NÃO existem agora.
--    PONTO DE EXTENSÃO FUTURO (Mercado Pago): quando o pagamento for integrado,
--    adicionar via migration incremental:
--      ALTER TABLE public.client_subscriptions
--        ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
--        ADD COLUMN IF NOT EXISTS gateway_ref TEXT,
--        ADD COLUMN IF NOT EXISTS external_id TEXT;
--    A estrutura atual de client_subscriptions já é uma tabela própria justamente
--    para permitir essa extensão sem redesenho.
--
-- 4. CANCELAMENTO BIDIRECIONAL — tanto o cliente quanto o dono podem cancelar.
--    Colunas: status ('active'|'canceled'), canceled_at TIMESTAMPTZ NULL,
--    canceled_by TEXT CHECK IN ('client','owner') NULL.
--    A escrita é feita pela Vercel Function com service_role.
--
-- 5. SESSÃO LEVE DO CLIENTE — o cliente NÃO tem Supabase Auth (auth.uid() = NULL).
--    Toda escrita em client_subscriptions (assinar, cancelar) é feita EXCLUSIVAMENTE
--    via Vercel Function com service_role, que bypassa RLS. NÃO há policies de
--    INSERT/UPDATE para o papel anon/cliente nesta tabela. As policies abaixo
--    cobrem apenas o dono autenticado (auth.uid() válido).
--    Ver: seguranca.md e client_identity.sql para o mesmo padrão em clients/salon_clients.
--
-- 6. DIAS DA SEMANA PERMITIDOS POR PLANO — cada plano pode restringir em quais
--    dias da semana o cliente pode utilizar a cota do plano. Modelado na tabela
--    subscription_plan_days (ver abaixo). Convenção: 0 = Domingo, 6 = Sábado,
--    idêntica ao campo day_of_week de working_hours.
--    REGRA DE NEGÓCIO (validada em Vercel Function appointments.js):
--      Se o day_of_week da data do agendamento NÃO constar nos registros de
--      subscription_plan_days para o plano do cliente, o agendamento NÃO
--      consome cota do plano — é tratado como avulso (preço cheio). A Vercel
--      Function deve verificar, antes de decrementar/contar cota:
--        SELECT 1 FROM subscription_plan_days
--        WHERE plan_id = $plan_id AND day_of_week = $day_of_week_da_data
--      Se retornar 0 linhas, ignorar o plano e cobrar como avulso.
--      Se o plano não tiver nenhum registro em subscription_plan_days, trata-se
--      como "sem restrição de dia" — o plano vale todos os dias (comportamento
--      permissivo por ausência de registro, consistent com working_hours).
--
-- =============================================================================


-- =============================================================================
-- TABELA 1: subscription_plans
-- Planos de assinatura definidos pelo dono, escopados por salão.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id    UUID          NOT NULL
                            REFERENCES public.salons(id) ON DELETE CASCADE,
  name        TEXT          NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL,
  is_active   BOOLEAN       DEFAULT true NOT NULL,
  created_at  TIMESTAMPTZ   DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Índice para queries frequentes por salão
CREATE INDEX IF NOT EXISTS idx_subscription_plans_salon_id
  ON public.subscription_plans (salon_id);


-- =============================================================================
-- TABELA 2: subscription_plan_services
-- Vincula um plano a um serviço com cota de uso por ciclo de 30 dias.
-- Reforço multi-tenant: salon_id presente para garantir que plan e service
-- pertençam ao mesmo salão (verificado na camada de aplicação e via FK indireta).
--
-- NOTA SEMÂNTICA: a coluna se chama `monthly_quota` por convenção de nomenclatura
-- do schema, mas sua semântica é "cota por ciclo de 30 dias a partir de started_at"
-- (decisão 2 do cabeçalho). O ciclo NÃO é mês-calendário.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plan_services (
  plan_id       UUID    NOT NULL
                        REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  service_id    UUID    NOT NULL
                        REFERENCES public.services(id) ON DELETE CASCADE,
  salon_id      UUID    NOT NULL
                        REFERENCES public.salons(id) ON DELETE CASCADE,
  monthly_quota INTEGER NOT NULL,
  CONSTRAINT subscription_plan_services_pkey
    PRIMARY KEY (plan_id, service_id),
  CONSTRAINT subscription_plan_services_quota_check
    CHECK (monthly_quota > 0)
);

-- Habilitar RLS
ALTER TABLE public.subscription_plan_services ENABLE ROW LEVEL SECURITY;

-- Índice para lookup por serviço (join frequente ao calcular cota disponível)
CREATE INDEX IF NOT EXISTS idx_subscription_plan_services_service_id
  ON public.subscription_plan_services (service_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_services_salon_id
  ON public.subscription_plan_services (salon_id);


-- =============================================================================
-- TABELA 3: subscription_plan_days
-- Dias da semana em que o plano permite uso da cota.
--
-- Convenção de day_of_week: 0 = Domingo, 1 = Segunda, ..., 6 = Sábado.
-- Idêntica ao campo working_hours.day_of_week — mantém idioma consistente
-- em todo o schema.
--
-- REFORÇO MULTI-TENANT: salon_id é incluído explicitamente (assim como em
-- subscription_plan_services) para permitir filtro direto por salão nas
-- policies RLS sem JOIN adicional em subscription_plans.
--
-- SEMÂNTICA DE AUSÊNCIA DE REGISTRO (decisão 6 do cabeçalho):
--   Se um plano não tiver nenhuma linha em subscription_plan_days, o plano
--   vale para TODOS os dias da semana (ausência = sem restrição).
--   A Vercel Function deve implementar essa lógica: primeiro verificar se
--   existem linhas para o plan_id; se não existirem, liberar; se existirem,
--   verificar se o day_of_week da data do agendamento está entre elas.
--
-- REGRA DE NEGÓCIO — VALIDAÇÃO EM appointments.js (Vercel Function):
--   Antes de contar/consumir cota do plano do cliente, a Function deve executar:
--
--     SELECT COUNT(*) FROM subscription_plan_days WHERE plan_id = $plan_id;
--     -- Se COUNT = 0: sem restrição de dia, o plano vale.
--     -- Se COUNT > 0:
--     SELECT 1 FROM subscription_plan_days
--     WHERE plan_id = $plan_id AND day_of_week = $day_of_week_da_data;
--     -- Se retornar 0 linhas: agendamento fora dos dias permitidos →
--     --   NÃO consome cota, tratar como avulso (preço cheio).
--     -- Se retornar 1 linha: dia permitido → consome cota normalmente.
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plan_days (
  plan_id     UUID    NOT NULL
                      REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  salon_id    UUID    NOT NULL
                      REFERENCES public.salons(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  CONSTRAINT subscription_plan_days_pkey
    PRIMARY KEY (plan_id, day_of_week),
  CONSTRAINT subscription_plan_days_day_check
    CHECK (day_of_week BETWEEN 0 AND 6)
);

-- Habilitar RLS
ALTER TABLE public.subscription_plan_days ENABLE ROW LEVEL SECURITY;

-- Índice para lookup frequente por plano (usado na validação de agendamento)
CREATE INDEX IF NOT EXISTS idx_subscription_plan_days_plan_id
  ON public.subscription_plan_days (plan_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_days_salon_id
  ON public.subscription_plan_days (salon_id);


-- =============================================================================
-- TABELA 4: client_subscriptions
-- Assinatura de um cliente a um plano de um salão.
--
-- client_id referencia public.clients(id) — identidade leve por telefone,
-- seguindo o padrão de salon_clients (ver client_identity.sql).
-- NÃO referencia public.profiles(id) pois o cliente não tem Supabase Auth.
--
-- ISOLAMENTO POR SALÃO (invariante crítico):
-- O escopo de uma assinatura é sempre (client_id, salon_id, plan_id).
-- Um mesmo cliente pode ter assinaturas ativas em salões diferentes
-- simultaneamente — são registros completamente independentes.
-- Toda leitura desta tabela deve filtrar por salon_id além de client_id.
--
-- CONTAGEM DE USO POR CICLO DE 30 DIAS (decisão 2 do cabeçalho):
-- O ciclo corrente é uma janela rolante de 30 dias calculada a partir de
-- client_subscriptions.started_at (não é mês-calendário).
-- Fórmula (calculada em JavaScript na Vercel Function antes do COUNT):
--   cyclesElapsed = FLOOR((CURRENT_DATE - started_at::date) / 30)
--   inicio_ciclo  = started_at::date + cyclesElapsed * 30
--   fim_ciclo     = inicio_ciclo + 30  (exclusive)
-- A Vercel Function que verifica cota conta agendamentos com:
--   WHERE salon_id = $salon_id          -- OBRIGATÓRIO: escopa ao salão correto
--     AND client_id = $client_id
--     AND service_id = $service_id
--     AND status = 'scheduled'
--     AND appointment_date >= $inicio_ciclo
--     AND appointment_date <  $fim_ciclo
-- NÃO usar DATE_TRUNC('month', appointment_date) = DATE_TRUNC('month', CURRENT_DATE)
-- — isso seria contagem por mês-calendário, que foi explicitamente rejeitada.
-- Nunca omitir salon_id nesse COUNT — isso violaria o isolamento multi-tenant
-- e contabilizaria uso de outros salões no limite do salão atual.
--
-- ACESSO DO CLIENTE: exclusivamente via Vercel Function com service_role.
-- Nenhuma policy RLS concede escrita direta ao cliente nesta tabela.
-- Ver decisão 5 no cabeçalho deste arquivo e seguranca.md.
--
-- PONTO DE EXTENSÃO FUTURO (Mercado Pago):
--   ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
--   ADD COLUMN IF NOT EXISTS gateway_ref TEXT
--   ADD COLUMN IF NOT EXISTS external_id TEXT
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id     UUID        NOT NULL
                           REFERENCES public.salons(id) ON DELETE CASCADE,
  plan_id      UUID        NOT NULL
                           REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  -- Referencia clients (identidade leve por telefone), não profiles.
  -- O cliente não tem Supabase Auth; escrita apenas via service_role.
  client_id    UUID        NOT NULL
                           REFERENCES public.clients(id) ON DELETE CASCADE,
  status       TEXT        DEFAULT 'active' NOT NULL,
  started_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  canceled_at  TIMESTAMPTZ NULL,
  -- 'client' = cliente pediu o cancelamento; 'owner' = dono cancelou
  canceled_by  TEXT        NULL,
  created_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

  CONSTRAINT client_subscriptions_status_check
    CHECK (status IN ('active', 'canceled')),

  CONSTRAINT client_subscriptions_canceled_by_check
    CHECK (canceled_by IN ('client', 'owner'))
);

-- Habilitar RLS
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

-- Índice único parcial: impede duas assinaturas ATIVAS do mesmo cliente no mesmo
-- plano dentro do mesmo salão.
--
-- A coluna salon_id é incluída explicitamente na chave do índice por razão
-- semântica/defensiva: documenta que o escopo de unicidade é (cliente + salão + plano).
-- Tecnicamente, plan_id já pertence a exatamente um salon_id (FK transitiva via
-- subscription_plans.salon_id), portanto salon_id seria redundante para a garantia
-- de unicidade. Sua presença no índice é intencional: torna o invariante de
-- isolamento por salão visível e auditável diretamente no esquema, sem depender
-- de raciocínio indireto sobre FKs. Permite também futuras queries de diagnóstico
-- que filtrem por (client_id, salon_id) sem precisar do plan_id.
--
-- Permite múltiplos registros cancelados históricos — apenas assinaturas ativas
-- são restritas. Um cliente pode reativar ou contratar o mesmo plano após cancelar.
DROP INDEX IF EXISTS idx_client_subscriptions_unique_active;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'idx_client_subscriptions_unique_active'
      AND tablename = 'client_subscriptions'
      AND schemaname = 'public'
  ) THEN
    CREATE UNIQUE INDEX idx_client_subscriptions_unique_active
      ON public.client_subscriptions (client_id, salon_id, plan_id)
      WHERE status = 'active';
  END IF;
END;
$$;

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_salon_id
  ON public.client_subscriptions (salon_id);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client_id
  ON public.client_subscriptions (client_id);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_plan_id
  ON public.client_subscriptions (plan_id);


-- =============================================================================
-- RLS — subscription_plans
--
-- SELECT público: cliente precisa ler planos disponíveis na página do salão.
-- INSERT/UPDATE/DELETE: apenas o dono do salão (auth.uid() = salons.owner_id).
-- Padrão: JOIN salons.owner_id = auth.uid() + auth.uid() IS NOT NULL em escritas.
-- =============================================================================

DROP POLICY IF EXISTS "Subscription plans are viewable by everyone" ON public.subscription_plans;
DROP POLICY IF EXISTS "Owners can insert their subscription plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Owners can update their subscription plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Owners can delete their subscription plans" ON public.subscription_plans;

-- SELECT: público — cliente visualiza planos do salão na página pública
CREATE POLICY "Subscription plans are viewable by everyone"
ON public.subscription_plans FOR SELECT
USING (true);

-- INSERT: apenas o dono do salão ao qual o plano pertence
CREATE POLICY "Owners can insert their subscription plans"
ON public.subscription_plans FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plans.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- UPDATE: apenas o dono do salão (ex: desativar plano, alterar preço)
CREATE POLICY "Owners can update their subscription plans"
ON public.subscription_plans FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plans.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plans.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- DELETE: apenas o dono do salão
CREATE POLICY "Owners can delete their subscription plans"
ON public.subscription_plans FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plans.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- =============================================================================
-- RLS — subscription_plan_services
--
-- SELECT público: cliente precisa ver quais serviços e cotas cada plano inclui.
-- INSERT/UPDATE/DELETE: apenas o dono do salão.
-- =============================================================================

DROP POLICY IF EXISTS "Subscription plan services are viewable by everyone" ON public.subscription_plan_services;
DROP POLICY IF EXISTS "Owners can insert their subscription plan services" ON public.subscription_plan_services;
DROP POLICY IF EXISTS "Owners can update their subscription plan services" ON public.subscription_plan_services;
DROP POLICY IF EXISTS "Owners can delete their subscription plan services" ON public.subscription_plan_services;

-- SELECT: público
CREATE POLICY "Subscription plan services are viewable by everyone"
ON public.subscription_plan_services FOR SELECT
USING (true);

-- INSERT: apenas dono do salão
CREATE POLICY "Owners can insert their subscription plan services"
ON public.subscription_plan_services FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_services.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- UPDATE: apenas dono do salão (ex: alterar monthly_quota)
CREATE POLICY "Owners can update their subscription plan services"
ON public.subscription_plan_services FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_services.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_services.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- DELETE: apenas dono do salão
CREATE POLICY "Owners can delete their subscription plan services"
ON public.subscription_plan_services FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_services.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- =============================================================================
-- RLS — subscription_plan_days
--
-- SELECT público: cliente precisa ver os dias permitidos do plano que está
-- contratando (exibido na página pública do salão junto ao detalhamento do plano).
-- INSERT/UPDATE/DELETE: apenas o dono do salão.
-- Mesmo padrão de subscription_plan_services — acesso via salon_id direto.
-- =============================================================================

DROP POLICY IF EXISTS "Subscription plan days are viewable by everyone" ON public.subscription_plan_days;
DROP POLICY IF EXISTS "Owners can insert their subscription plan days" ON public.subscription_plan_days;
DROP POLICY IF EXISTS "Owners can update their subscription plan days" ON public.subscription_plan_days;
DROP POLICY IF EXISTS "Owners can delete their subscription plan days" ON public.subscription_plan_days;

-- SELECT: público — cliente visualiza restrições de dias do plano
CREATE POLICY "Subscription plan days are viewable by everyone"
ON public.subscription_plan_days FOR SELECT
USING (true);

-- INSERT: apenas dono do salão
CREATE POLICY "Owners can insert their subscription plan days"
ON public.subscription_plan_days FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_days.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- UPDATE: apenas dono do salão
CREATE POLICY "Owners can update their subscription plan days"
ON public.subscription_plan_days FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_days.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_days.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- DELETE: apenas dono do salão
CREATE POLICY "Owners can delete their subscription plan days"
ON public.subscription_plan_days FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = subscription_plan_days.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- =============================================================================
-- RLS — client_subscriptions
--
-- LEITURA DO CLIENTE: feita exclusivamente via Vercel Function com service_role.
-- Não há policy SELECT para anon ou para o cliente identificado por telefone,
-- pois auth.uid() é sempre NULL no contexto do cliente (sessão leve — ver
-- seguranca.md e decisão 5 no cabeçalho deste arquivo).
--
-- ESCRITA (INSERT/UPDATE): exclusivamente via Vercel Function com service_role.
-- Nenhuma policy concede escrita direta ao cliente ou ao papel anon.
--
-- SELECT para o DONO: o dono lê as assinaturas do seu salão.
-- UPDATE para o DONO: o dono pode cancelar assinaturas (status, canceled_at,
--   canceled_by) diretamente pelo painel — escrita via Supabase client autenticado.
-- =============================================================================

DROP POLICY IF EXISTS "Owners can view their salon client subscriptions" ON public.client_subscriptions;
DROP POLICY IF EXISTS "Owners can update their salon client subscriptions" ON public.client_subscriptions;

-- SELECT: dono do salão vê todas as assinaturas do seu salão
CREATE POLICY "Owners can view their salon client subscriptions"
ON public.client_subscriptions FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = client_subscriptions.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- UPDATE: dono do salão pode cancelar assinaturas (ex: gravar status='canceled',
-- canceled_at, canceled_by='owner') — acesso direto via Supabase client autenticado.
-- INSERT e UPDATE pelo cliente são sempre via Vercel Function com service_role.
CREATE POLICY "Owners can update their salon client subscriptions"
ON public.client_subscriptions FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = client_subscriptions.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = client_subscriptions.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- =============================================================================
-- INSTRUÇÕES DE APLICAÇÃO
-- =============================================================================
--
-- 1. Acesse o Supabase Dashboard → SQL Editor → New query.
-- 2. Cole o conteúdo completo deste arquivo.
-- 3. Execute. Saída esperada: "Success. No rows returned" sem erros.
--    Avisos de "policy does not exist" nos DROP IF EXISTS são inofensivos.
-- 4. Confirme a criação das tabelas:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN (
--        'subscription_plans',
--        'subscription_plan_services',
--        'subscription_plan_days',
--        'client_subscriptions'
--      );
-- 5. Confirme as policies:
--    SELECT tablename, policyname, cmd
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN (
--        'subscription_plans',
--        'subscription_plan_services',
--        'subscription_plan_days',
--        'client_subscriptions'
--      )
--    ORDER BY tablename, policyname;
--
-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO MANUAL (Supabase Dashboard após aplicar)
-- =============================================================================
--
-- subscription_plans
-- ------------------
-- [ ] Não autenticado (anon): SELECT subscription_plans → retorna linhas (SELECT público)
-- [ ] Logado como dono do salão A: INSERT plan com salon_id = A → sucesso
-- [ ] Logado como dono do salão A: INSERT plan com salon_id = B → erro (policy violation)
-- [ ] Logado como dono do salão A: UPDATE plan do salão B → 0 linhas afetadas
-- [ ] Logado como dono do salão A: DELETE plan do salão B → 0 linhas afetadas
-- [ ] Não autenticado (anon): INSERT plan → erro (policy violation)
--
-- subscription_plan_services
-- --------------------------
-- [ ] Não autenticado (anon): SELECT → retorna linhas (SELECT público)
-- [ ] Logado como dono do salão A: INSERT com salon_id = A → sucesso
-- [ ] Logado como dono do salão A: INSERT com salon_id = B → erro (policy violation)
-- [ ] monthly_quota = 0 → erro (CHECK violation)
-- [ ] monthly_quota negativo → erro (CHECK violation)
-- [ ] INSERT duplicado (mesmo plan_id + service_id) → erro (PK violation)
--
-- subscription_plan_days
-- ----------------------
-- [ ] Não autenticado (anon): SELECT → retorna linhas (SELECT público)
-- [ ] Logado como dono do salão A: INSERT (plan_id de A, salon_id = A, day_of_week = 1) → sucesso
-- [ ] Logado como dono do salão A: INSERT com salon_id = B → erro (policy violation)
-- [ ] day_of_week = 7 → erro (CHECK violation — fora do intervalo 0-6)
-- [ ] day_of_week = -1 → erro (CHECK violation)
-- [ ] INSERT duplicado (mesmo plan_id + day_of_week) → erro (PK violation)
-- [ ] Plano sem nenhuma linha em subscription_plan_days: Vercel Function deve
--     tratar como "sem restrição de dia" — plano válido para todos os dias
-- [ ] Plano com day_of_week 1,2,3 (seg-qua): agendamento numa sexta (day_of_week=5)
--     → Vercel Function NÃO consome cota, trata como avulso
-- [ ] Mesmo plano, agendamento numa segunda (day_of_week=1) → Vercel Function
--     consome cota normalmente
-- [ ] Dono do salão A: DELETE dia do plano do salão B → 0 linhas afetadas
--
-- client_subscriptions
-- --------------------
-- [ ] Não autenticado (anon): SELECT → 0 linhas (sem policy SELECT pública)
-- [ ] Logado como dono do salão A: SELECT → retorna apenas assinaturas do salão A
-- [ ] Logado como dono do salão A: SELECT assinaturas do salão B → 0 linhas
-- [ ] Logado como dono do salão A: UPDATE status='canceled' de assinatura do salão A → sucesso
-- [ ] Logado como dono do salão A: UPDATE assinatura do salão B → 0 linhas afetadas
-- [ ] Não autenticado (anon): INSERT client_subscription → erro (policy violation)
--   (INSERT pelo cliente usa service_role via Vercel Function — não testável via anon key)
-- [ ] Índice único parcial: tentativa de inserir segunda assinatura active para
--     mesmo (client_id, salon_id, plan_id) → erro de unique violation
-- [ ] Mesmo cliente com assinatura ativa no salão A: pode ter assinatura ativa
--     no salão B com o mesmo plano (planos de salões diferentes) → sucesso (sem
--     violação do índice único — isolamento por salão confirmado)
-- [ ] status = 'suspended' (valor inválido) → erro (CHECK violation)
-- [ ] canceled_by = 'admin' (valor inválido) → erro (CHECK violation)
-- [ ] Contagem de uso: Vercel Function usa janela rolante de 30 dias a partir de
--     started_at, NÃO DATE_TRUNC('month'). Exemplo: cliente assinou dia 15/jan,
--     agendamentos de 14/jan (ciclo anterior) NÃO contam; os de 15/jan a 14/fev
--     contam; em 15/fev o ciclo reinicia zerado — verificar com dados de teste
--     que cruzem a virada de mês para confirmar que o ciclo é por started_at,
--     não por calendário.
--
-- =============================================================================
