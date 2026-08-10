-- =============================================================================
-- schema_completo.sql — App Salão
-- Gerado em: 2026-08-10
-- Propósito: reproduzir fielmente o banco de dados completo num projeto
--            Supabase novo e vazio (idempotente, roda do zero sem erro).
--
-- Arquivos-fonte reconciliados (em ordem de precedência/aplicação):
--   1.  schema.sql                                   (estrutura base)
--   2.  rls_fix.sql                                  (colunas salons + RLS multi-tenant)
--   3.  rls_admin_fix.sql                            (policy UPDATE admin em salons)
--   4.  client_identity.sql                          (tabelas clients/salon_clients + migração FKs + sessão leve)
--   5.  subscription_plans.sql                       (planos de assinatura)
--   6.  booking_conflict_guard.sql                   (trigger anti double-booking)
--   7.  time_blocks.sql                              (bloqueio pontual de horário)
--   8.  payment_leads.sql                            (leads do webhook Mercado Pago)
--   9.  payment_leads_unique_fix.sql                 (índice UNIQUE em mp_payment_id)
--   10. notifications_owner_insert_fix.sql           (policy INSERT dono em notifications)
--   11. add_slot_interval_minutes.sql                (coluna slot_interval_minutes em salons)
--   12. add_appointment_services.sql                 (tabela appointment_services)
--   13. add_structured_address.sql                   (endereço estruturado em salons)
--   14. add_google_review_link.sql                   (google_review_link em salons)
--   15. migration_working_hours_has_lunch_break.sql  (has_lunch_break em working_hours)
--   16. client_profile_fields.sql                    (avatar_url em clients + bucket client-avatars)
--   17. mp_marketplace.sql                           (colunas MP em client_subscriptions + salon_mp_credentials)
--   18. create_storage.sql                           (bucket logos + policies de storage)
--   19. salons_select_analysis.sql                   (IGNORADO — apenas análise, sem DDL)
--
-- Ordem de criação dos objetos:
--   Extensions → tabelas (por ordem de FK) → índices → functions/triggers
--   → RLS enable → policies → storage buckets e policies
--
-- Reconciliações aplicadas:
--   • salons: todas as colunas incrementais incorporadas no CREATE TABLE.
--   • working_hours: has_lunch_break incorporado no CREATE TABLE com DEFAULT true;
--     o UPDATE de correção de registros existentes é omitido (só aplica em migration
--     de banco com dados — num banco novo todos os registros nascerão com o valor correto).
--   • clients: birth_date e avatar_url incorporados no CREATE TABLE.
--   • client_subscriptions: payment_status, gateway_ref, external_id, payment_method,
--     confirmed_by incorporados no CREATE TABLE; constraint status corrigida para
--     incluir 'pending'.
--   • appointments: client_id agora referencia clients(id), não profiles(id).
--   • reviews: client_id agora referencia clients(id), não profiles(id).
--   • notifications: client_id agora referencia clients(id), não profiles(id).
--   • notifications policies: estado final inclui Policy A e Policy B de INSERT
--     (notifications_owner_insert_fix.sql) e exclui policies de cliente removidas
--     em client_identity.sql Seção 10.
--   • appointments policies: estado final exclui policies de cliente removidas
--     em client_identity.sql Seção 10.
--   • reviews policies: "Clients can insert their own reviews" foi removida
--     em client_identity.sql Seção 10.
--   • client_identity.sql Seções 3-5 (backfill + diagnóstico de órfãos): omitidas —
--     num banco novo não há dados a migrar e não existem FKs antigas a trocar.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: EXTENSÕES
-- =============================================================================

-- gen_random_uuid() requer pgcrypto no PostgreSQL < 13; no PG 13+ é nativo.
-- No Supabase a extensão pgcrypto normalmente já vem habilitada.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================================
-- SEÇÃO 2: TABELAS (ordem de dependência de FK)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 profiles — extensão de auth.users (Supabase Auth)
-- -----------------------------------------------------------------------------
-- 'admin' é o super-admin da plataforma (Israel) — acessa /admin e gerencia licenças.
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID  REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role       TEXT  NOT NULL,
  full_name  TEXT  NOT NULL,
  phone      TEXT,
  gender     TEXT  DEFAULT 'todos',
  search_radius INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'client', 'admin'))
);

-- -----------------------------------------------------------------------------
-- 2.2 salons — salões de beleza (com todas as colunas incrementais)
--
-- Controle de licença — fonte de verdade:
--   status ('active'|'expired') gravado pelo AdminDashboard, lido por
--   OwnerLayout e SalonLayout para decidir se o acesso deve ser bloqueado.
--   subscription_expires_at indica quando a assinatura expira.
--   is_active (BOOLEAN) existe mas NÃO é a fonte de verdade do bloqueio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salons (
  id                   UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id             UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                 TEXT          NOT NULL,
  logo_url             TEXT,
  -- Endereço texto livre (mantido como fallback; campos estruturados abaixo são os novos).
  address              TEXT,
  latitude             DECIMAL(10,8),
  longitude            DECIMAL(11,8),
  target_gender        TEXT          DEFAULT 'Unisex',
  document             TEXT,
  created_at           TIMESTAMPTZ   DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Controle de licença (adicionadas via rls_fix.sql)
  is_active            BOOLEAN       DEFAULT true NOT NULL,
  status               TEXT          DEFAULT 'active',
  subscription_expires_at TIMESTAMPTZ,

  -- Configuração de intervalo de slots (adicionada via add_slot_interval_minutes.sql)
  -- NULL = usar duração do serviço (comportamento padrão).
  -- Quando preenchido: múltiplo de 15, entre 15 e 120 minutos.
  slot_interval_minutes INTEGER       DEFAULT NULL,

  -- Endereço estruturado (adicionado via add_structured_address.sql)
  -- Nullable: preenchido progressivamente quando o dono reedita o perfil.
  logradouro           TEXT,
  numero               TEXT,
  bairro               TEXT,
  cep                  TEXT,
  cidade               TEXT,
  estado               TEXT,

  -- Link de avaliação do Google (adicionado via add_google_review_link.sql)
  google_review_link   TEXT,

  CONSTRAINT salons_slot_interval_minutes_check CHECK (
    slot_interval_minutes IS NULL
    OR (
      slot_interval_minutes >= 15
      AND slot_interval_minutes <= 120
      AND slot_interval_minutes % 15 = 0
    )
  )
);

-- -----------------------------------------------------------------------------
-- 2.3 clients — identidade global do cliente por telefone (sessão leve)
--
-- phone é a chave de identidade global entre todos os salões.
-- Normalizado (apenas dígitos) pela Vercel Function antes do INSERT/lookup.
-- O cliente NÃO tem Supabase Auth — toda escrita via service_role.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone      TEXT        NOT NULL UNIQUE,
  full_name  TEXT        NOT NULL,
  -- Campos de perfil (incrementais: birth_date de client_identity.sql,
  -- avatar_url de client_profile_fields.sql)
  birth_date DATE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.4 services — serviços oferecidos pelos salões
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id         UUID          NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name             TEXT          NOT NULL,
  duration_minutes INTEGER       NOT NULL,
  price            DECIMAL(10,2) NOT NULL,
  created_at       TIMESTAMPTZ   DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.5 working_hours — horário de funcionamento do salão
--
-- has_lunch_break: false → BookingEngine ignora break_start/end mesmo preenchidos.
-- true → pausa de almoço ativa (default conservador para registros existentes).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.working_hours (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id         UUID    NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  day_of_week      INTEGER NOT NULL,
  start_time       TIME    NOT NULL,
  end_time         TIME    NOT NULL,
  break_start_time TIME    NULL,
  break_end_time   TIME    NULL,
  has_lunch_break  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (salon_id, day_of_week),
  CONSTRAINT working_hours_day_of_week_check CHECK (day_of_week BETWEEN 0 AND 6)
);

-- -----------------------------------------------------------------------------
-- 2.6 professionals — profissionais do salão
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professionals (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id   UUID        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  is_active  BOOLEAN     DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.7 appointments — agendamentos
--
-- client_id referencia public.clients(id) (não profiles) — decisão de sessão
-- leve (client_identity.sql Seção 6). Toda escrita via Vercel Function service_role.
-- service_id NOT NULL: mantido para compatibilidade retroativa com queries existentes
-- (BookingEngine, histórico). appointment_services (2.14) vincula serviços adicionais.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id         UUID        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  professional_id  UUID        REFERENCES public.professionals(id) ON DELETE SET NULL,
  service_id       UUID        NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  -- Referencia clients (identidade leve), NÃO profiles.
  client_id        UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_date DATE        NOT NULL,
  start_time       TIME        NOT NULL,
  end_time         TIME        NOT NULL,
  status           TEXT        DEFAULT 'scheduled' NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT appointments_status_check CHECK (status IN ('scheduled', 'canceled', 'completed'))
);

-- -----------------------------------------------------------------------------
-- 2.8 reviews — avaliações dos clientes
--
-- client_id referencia public.clients(id) (não profiles) — mesma decisão de
-- sessão leve. Escrita via Vercel Function service_role.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id    UUID        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Referencia clients, NÃO profiles.
  client_id   UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rating      INTEGER     NOT NULL,
  comment     TEXT,
  owner_reply TEXT,
  created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5)
);

-- -----------------------------------------------------------------------------
-- 2.9 notifications — notificações in-app
--
-- client_id NULLABLE:
--   NULL      → notificação destinada ao dono do salão (Fluxo A — fluxo atual).
--   NOT NULL  → notificação destinada a um cliente específico (Fluxo B — futuro).
-- client_id referencia public.clients(id) (não profiles) — sessão leve.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id   UUID        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Nullable: notificações para o dono (Fluxo A) têm client_id = NULL.
  client_id  UUID        REFERENCES public.clients(id) ON DELETE CASCADE NULL,
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  is_read    BOOLEAN     DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.10 payments — extrato de pagamentos de licença (gerenciado pelo admin)
--
-- Colunas inferidas do uso real em AdminDashboard.jsx:
--   INSERT: salon_id, amount, description  (payment_date via default)
--   SELECT: id, salon_id, amount, description, payment_date ORDER BY payment_date DESC
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id     UUID          NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  amount       DECIMAL(10,2) NOT NULL,
  description  TEXT,
  payment_date TIMESTAMPTZ   DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.11 time_blocks — bloqueio pontual de horário / folga avulsa
--
-- professional_id:
--   NULL → bloqueia todos os profissionais do salão no intervalo.
--   UUID → bloqueia apenas o profissional específico.
-- Verificação no cálculo de slots é responsabilidade do BookingEngine.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_blocks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id        UUID        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  professional_id UUID        REFERENCES public.professionals(id) ON DELETE CASCADE NULL,
  block_date      DATE        NOT NULL,
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.12 salon_clients — vínculo N:N cliente ↔ salão
--
-- is_active: true = cliente ativo neste salão; false = bloqueado para novos
-- agendamentos neste salão. Inativar em um salão não afeta outros salões.
-- Ausência de linha = não bloqueado (pode agendar).
-- Escrita exclusiva via Vercel Function service_role.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_clients (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id   UUID        NOT NULL REFERENCES public.salons(id)  ON DELETE CASCADE,
  client_id  UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (salon_id, client_id)
);

-- -----------------------------------------------------------------------------
-- 2.13 subscription_plans — planos de assinatura definidos pelo dono por salão
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id    UUID          NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name        TEXT          NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL,
  is_active   BOOLEAN       DEFAULT true NOT NULL,
  created_at  TIMESTAMPTZ   DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.14 subscription_plan_services — vínculo plano ↔ serviço com cota de uso
--
-- monthly_quota: cota por ciclo de 30 dias a partir de started_at
-- (NÃO é mês-calendário — ver decisão 2 em subscription_plans.sql).
-- salon_id redundante por design: permite filtro direto sem JOIN em subscription_plans
-- nas policies RLS (mesmo padrão das outras tabelas).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plan_services (
  plan_id       UUID    NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  service_id    UUID    NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  salon_id      UUID    NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  monthly_quota INTEGER NOT NULL,
  CONSTRAINT subscription_plan_services_pkey PRIMARY KEY (plan_id, service_id),
  CONSTRAINT subscription_plan_services_quota_check CHECK (monthly_quota > 0)
);

-- -----------------------------------------------------------------------------
-- 2.15 subscription_plan_days — dias da semana em que o plano permite uso da cota
--
-- Convenção: 0 = Domingo, 6 = Sábado (idêntica a working_hours.day_of_week).
-- Ausência de linha para um plano = sem restrição de dia (plano vale todos os dias).
-- salon_id redundante por design (mesmo padrão de subscription_plan_services).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plan_days (
  plan_id     UUID    NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  salon_id    UUID    NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  CONSTRAINT subscription_plan_days_pkey PRIMARY KEY (plan_id, day_of_week),
  CONSTRAINT subscription_plan_days_day_check CHECK (day_of_week BETWEEN 0 AND 6)
);

-- -----------------------------------------------------------------------------
-- 2.16 client_subscriptions — assinatura de um cliente a um plano de um salão
--
-- client_id referencia clients (sessão leve — NÃO profiles).
-- Escopo da assinatura: (client_id, salon_id, plan_id).
-- Um cliente pode ter assinaturas ativas SIMULTÂNEAS em salões diferentes.
-- status 'pending': assinatura criada aguardando confirmação de pagamento (MP).
-- payment_status = 'approved' é obrigatório para cota ativa com gateway integrado.
-- Contagem de uso: janela rolante de 30 dias a partir de started_at, derivada
-- dos agendamentos (sem job de reset).
-- Escrita exclusiva via Vercel Function service_role (cliente sem auth.uid()).
-- Dono pode cancelar via Supabase client autenticado (UPDATE policy abaixo).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id       UUID        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  plan_id        UUID        NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  -- Referencia clients (sessão leve), NÃO profiles.
  client_id      UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status         TEXT        DEFAULT 'active' NOT NULL,
  started_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  canceled_at    TIMESTAMPTZ NULL,
  -- 'client' = cliente pediu o cancelamento; 'owner' = dono cancelou.
  canceled_by    TEXT        NULL,
  created_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Colunas de pagamento (adicionadas via mp_marketplace.sql)
  -- payment_status: 'pending' | 'approved' | 'rejected' | 'in_process' | 'refunded' | 'cancelled'
  -- Default 'pending': assinaturas sem gateway ficam pendentes até o dono/webhook aprovar.
  payment_status TEXT        DEFAULT 'pending',
  -- gateway_ref: id do pagamento retornado pelo Mercado Pago (gravado pelo webhook).
  gateway_ref    TEXT,
  -- external_id: id da preferência de checkout do MP (gerado ao iniciar o fluxo).
  external_id    TEXT,
  -- payment_method: 'mercado_pago' | 'external' | NULL (NULL = antes da integração MP).
  payment_method TEXT,
  -- confirmed_by: 'webhook' | 'owner' | NULL.
  confirmed_by   TEXT,

  CONSTRAINT client_subscriptions_status_check
    CHECK (status IN ('active', 'canceled', 'pending')),
  CONSTRAINT client_subscriptions_canceled_by_check
    CHECK (canceled_by IN ('client', 'owner')),
  CONSTRAINT client_subscriptions_payment_status_check
    CHECK (payment_status IN ('pending', 'approved', 'rejected', 'in_process', 'refunded', 'cancelled')),
  CONSTRAINT client_subscriptions_payment_method_check
    CHECK (payment_method IN ('mercado_pago', 'external')),
  CONSTRAINT client_subscriptions_confirmed_by_check
    CHECK (confirmed_by IN ('webhook', 'owner'))
);

-- -----------------------------------------------------------------------------
-- 2.17 appointment_services — serviços vinculados a um agendamento (multi-serviço)
--
-- appointments.service_id é mantido NOT NULL (1º serviço) para compatibilidade
-- retroativa com BookingEngine, histórico e notificações. Esta tabela vincula
-- serviços adicionais (opcional — o agendamento funciona sem linhas aqui).
-- salon_id redundante por design: evita JOIN triplo nas policies RLS.
-- Escrita exclusiva via Vercel Function service_role.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_services (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id     UUID        NOT NULL REFERENCES public.services(id)     ON DELETE CASCADE,
  salon_id       UUID        NOT NULL REFERENCES public.salons(id)        ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.18 payment_leads — leads de pagamento recebidos do webhook Mercado Pago
--
-- Gravados exclusivamente pelo webhook via service_role.
-- Sem salon_id: o lead chega ANTES do salão existir no sistema.
-- Admin revisa no painel /admin e libera licença manualmente.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_leads (
  id                 UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  mp_payment_id      TEXT,
  status             TEXT,
  external_reference TEXT,
  plano              TEXT,
  salon_name         TEXT,
  contact_email      TEXT,
  amount             DECIMAL(10,2),
  created_at         TIMESTAMPTZ   DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2.19 salon_mp_credentials — Access Token do Mercado Pago por salão
--
-- Um salão tem no máximo uma credencial (PK = salon_id).
-- O dono cola o token manualmente (sem fluxo OAuth).
-- O token NUNCA é lido de volta pelo client-side (sem policy SELECT).
-- service_role lê o token para os endpoints de pagamento (bypassa RLS).
-- Status de conexão exposto via função RPC is_salon_mp_connected (boolean).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_mp_credentials (
  salon_id     UUID        PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  access_token TEXT        NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- =============================================================================
-- SEÇÃO 3: ÍNDICES
-- =============================================================================

-- time_blocks: performance do BookingEngine (filtra por salon_id + block_date)
CREATE INDEX IF NOT EXISTS time_blocks_salon_id_block_date_idx
  ON public.time_blocks (salon_id, block_date);

-- subscription_plans: queries frequentes por salão
CREATE INDEX IF NOT EXISTS idx_subscription_plans_salon_id
  ON public.subscription_plans (salon_id);

-- subscription_plan_services: lookup por serviço e por salão
CREATE INDEX IF NOT EXISTS idx_subscription_plan_services_service_id
  ON public.subscription_plan_services (service_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plan_services_salon_id
  ON public.subscription_plan_services (salon_id);

-- subscription_plan_days: lookup por plano e por salão
CREATE INDEX IF NOT EXISTS idx_subscription_plan_days_plan_id
  ON public.subscription_plan_days (plan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plan_days_salon_id
  ON public.subscription_plan_days (salon_id);

-- client_subscriptions: índice único parcial (1 assinatura ativa por cliente+salão+plano)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_subscriptions_unique_active
  ON public.client_subscriptions (client_id, salon_id, plan_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_salon_id
  ON public.client_subscriptions (salon_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client_id
  ON public.client_subscriptions (client_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_plan_id
  ON public.client_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_gateway_ref
  ON public.client_subscriptions (gateway_ref)
  WHERE gateway_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_external_id
  ON public.client_subscriptions (external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_salon_payment_status
  ON public.client_subscriptions (salon_id, payment_status);

-- appointment_services: lookup por agendamento e por salão
CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment_id
  ON public.appointment_services (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_services_salon_id
  ON public.appointment_services (salon_id);

-- payment_leads: índice UNIQUE em mp_payment_id (previne duplicatas de webhook retry)
-- NULLs múltiplos são permitidos (cada NULL é considerado distinto pelo PostgreSQL).
CREATE UNIQUE INDEX IF NOT EXISTS payment_leads_mp_payment_id_key
  ON public.payment_leads (mp_payment_id);

-- appointments: índices de suporte ao trigger de conflito (booking_conflict_guard)
CREATE INDEX IF NOT EXISTS idx_appointments_conflict_by_professional
  ON public.appointments (professional_id, appointment_date, status)
  WHERE professional_id IS NOT NULL AND status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_appointments_conflict_by_salon
  ON public.appointments (salon_id, appointment_date, status)
  WHERE professional_id IS NULL AND status = 'scheduled';


-- =============================================================================
-- SEÇÃO 4: FUNCTIONS E TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 is_client_blocked_at_salon — verifica se cliente está inativo no salão
--
-- SECURITY DEFINER: necessário porque o cliente autenticado não tem SELECT em
-- salon_clients (policy restrita ao dono). Sem SECURITY DEFINER, a leitura de
-- salon_clients no contexto do cliente seria bloqueada pela RLS.
--
-- Retorna TRUE apenas se houver linha em salon_clients com is_active = false.
-- Retorna FALSE para: vínculo inexistente, vínculo ativo, ou qualquer erro.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_client_blocked_at_salon(
  p_salon_id  UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salon_clients sc
    WHERE sc.salon_id  = p_salon_id
      AND sc.client_id = p_client_id
      AND sc.is_active = false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_client_blocked_at_salon(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_client_blocked_at_salon(UUID, UUID) TO anon;
GRANT  EXECUTE ON FUNCTION public.is_client_blocked_at_salon(UUID, UUID) TO authenticated;


-- -----------------------------------------------------------------------------
-- 4.2 is_salon_mp_connected — retorna boolean de conexão MP sem expor o token
--
-- SECURITY DEFINER: lê salon_mp_credentials com privilégio do definidor,
-- sem nunca expor o access_token ao chamador.
-- Valida que o chamador é o dono do salão antes de retornar.
-- auth.uid() IS NULL (anon/cliente sem sessão) → retorna FALSE.
-- -----------------------------------------------------------------------------
-- Remove a view inválida caso exista de execução anterior parcial.
DROP VIEW IF EXISTS public.salon_mp_connection_status;

CREATE OR REPLACE FUNCTION public.is_salon_mp_connected(p_salon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id  UUID;
  v_connected BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.salons
  WHERE id = p_salon_id;

  IF v_owner_id IS NULL OR v_owner_id <> auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT (access_token IS NOT NULL) INTO v_connected
  FROM public.salon_mp_credentials
  WHERE salon_id = p_salon_id;

  RETURN COALESCE(v_connected, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.is_salon_mp_connected(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_salon_mp_connected(UUID) TO authenticated;


-- -----------------------------------------------------------------------------
-- 4.3 check_appointment_conflict — trigger de proteção contra double-booking
--
-- Detecta sobreposição de intervalos [start_time, end_time) para o mesmo
-- profissional (quando professional_id IS NOT NULL) ou para o salão inteiro
-- (quando professional_id IS NULL — salão sem profissionais cadastrados).
-- Apenas status = 'scheduled' bloqueia slot; 'canceled' e 'completed' são ignorados.
-- RAISE EXCEPTION com ERRCODE = 'exclusion_violation' ao detectar conflito.
-- CASCADE no DROP garante que o trigger dependente também é removido antes de recriar.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.check_appointment_conflict() CASCADE;

CREATE OR REPLACE FUNCTION public.check_appointment_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  IF NEW.status <> 'scheduled' THEN
    RETURN NEW;
  END IF;

  IF NEW.professional_id IS NOT NULL THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.appointments
    WHERE professional_id  = NEW.professional_id
      AND appointment_date = NEW.appointment_date
      AND status           = 'scheduled'
      AND id               <> NEW.id
      AND start_time       < NEW.end_time
      AND end_time         > NEW.start_time;

    IF conflict_count > 0 THEN
      RAISE EXCEPTION
        'Conflito de agendamento: o profissional já tem um horário marcado que se sobrepõe a % – % em %.',
        NEW.start_time, NEW.end_time, NEW.appointment_date
        USING ERRCODE = 'exclusion_violation';
    END IF;

  ELSE
    SELECT COUNT(*) INTO conflict_count
    FROM public.appointments
    WHERE salon_id          = NEW.salon_id
      AND professional_id   IS NULL
      AND appointment_date  = NEW.appointment_date
      AND status            = 'scheduled'
      AND id                <> NEW.id
      AND start_time        < NEW.end_time
      AND end_time          > NEW.start_time;

    IF conflict_count > 0 THEN
      RAISE EXCEPTION
        'Conflito de agendamento: já existe um horário marcado que se sobrepõe a % – % em % para este salão.',
        NEW.start_time, NEW.end_time, NEW.appointment_date
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_appointment_conflict ON public.appointments;

CREATE TRIGGER trg_check_appointment_conflict
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.check_appointment_conflict();


-- =============================================================================
-- SEÇÃO 5: HABILITAR RLS
-- =============================================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_blocks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plan_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plan_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_mp_credentials       ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SEÇÃO 6: POLICIES RLS
-- (DROP IF EXISTS antes de cada CREATE para idempotência)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 profiles
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile."       ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile."            ON public.profiles;

CREATE POLICY "Public profiles are viewable by everyone."
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile."
ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile."
ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- -----------------------------------------------------------------------------
-- 6.2 salons
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Salons are viewable by everyone."  ON public.salons;
DROP POLICY IF EXISTS "Owners can insert their salons."   ON public.salons;
DROP POLICY IF EXISTS "Owners can update their salons."   ON public.salons;
DROP POLICY IF EXISTS "Admins can update any salon"       ON public.salons;

-- SELECT público: necessário para o fluxo /s/:slug (cliente anônimo resolve o salão).
-- Limitação conhecida documentada em salons_select_analysis.sql (exposição de
-- document e subscription_expires_at a clientes autenticados via query direta).
CREATE POLICY "Salons are viewable by everyone."
ON public.salons FOR SELECT USING (true);

CREATE POLICY "Owners can insert their salons."
ON public.salons FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- UPDATE do dono: protege o próprio salão.
CREATE POLICY "Owners can update their salons."
ON public.salons FOR UPDATE USING (auth.uid() = owner_id);

-- UPDATE do admin: necessário para AdminDashboard gerenciar licenças de terceiros.
-- Postgres faz OR entre múltiplas policies permissivas do mesmo comando.
CREATE POLICY "Admins can update any salon"
ON public.salons FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);


-- -----------------------------------------------------------------------------
-- 6.3 services
-- SELECT público: cliente precisa ler serviços na página pública do salão.
-- Escrita restrita ao dono do salão (JOIN salons.owner_id = auth.uid()).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Services are viewable by everyone."   ON public.services;
DROP POLICY IF EXISTS "Owners can insert their services"      ON public.services;
DROP POLICY IF EXISTS "Owners can update their services"      ON public.services;
DROP POLICY IF EXISTS "Owners can delete their services"      ON public.services;

CREATE POLICY "Services are viewable by everyone."
ON public.services FOR SELECT USING (true);

CREATE POLICY "Owners can insert their services"
ON public.services FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = services.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can update their services"
ON public.services FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = services.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = services.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete their services"
ON public.services FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = services.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.4 working_hours
-- SELECT público: motor de agendamento do cliente precisa ler horários.
-- Escrita restrita ao dono do salão.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Working hours are viewable by everyone."   ON public.working_hours;
DROP POLICY IF EXISTS "Owners can insert their working hours"      ON public.working_hours;
DROP POLICY IF EXISTS "Owners can update their working hours"      ON public.working_hours;
DROP POLICY IF EXISTS "Owners can delete their working hours"      ON public.working_hours;

CREATE POLICY "Working hours are viewable by everyone."
ON public.working_hours FOR SELECT USING (true);

CREATE POLICY "Owners can insert their working hours"
ON public.working_hours FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = working_hours.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can update their working hours"
ON public.working_hours FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = working_hours.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = working_hours.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete their working hours"
ON public.working_hours FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = working_hours.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.5 professionals
-- SELECT público: cliente precisa ver lista de profissionais ao agendar.
-- Escrita restrita ao dono do salão.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Professionals are viewable by everyone."   ON public.professionals;
DROP POLICY IF EXISTS "Owners can insert their professionals"      ON public.professionals;
DROP POLICY IF EXISTS "Owners can update their professionals"      ON public.professionals;
DROP POLICY IF EXISTS "Owners can delete their professionals"      ON public.professionals;

CREATE POLICY "Professionals are viewable by everyone."
ON public.professionals FOR SELECT USING (true);

CREATE POLICY "Owners can insert their professionals"
ON public.professionals FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = professionals.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can update their professionals"
ON public.professionals FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = professionals.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = professionals.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete their professionals"
ON public.professionals FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = professionals.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.6 appointments
--
-- Estado final após client_identity.sql Seção 10 (remoção de policies de cliente):
--   SELECT: apenas o dono do salão (via owner_id = auth.uid()).
--   UPDATE: apenas o dono do salão.
--   INSERT/UPDATE pelo cliente: exclusivamente via Vercel Function service_role.
--
-- Nota: "Clients can view their own appointments", "Clients can insert their own
-- appointments" e "Clients can update their own appointments" foram removidas em
-- client_identity.sql Seção 10 porque auth.uid() é sempre NULL no modelo de
-- sessão leve do cliente.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients can view their own appointments"  ON public.appointments;
DROP POLICY IF EXISTS "Clients can insert their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Clients can update their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Owners can view their salon appointments"  ON public.appointments;
DROP POLICY IF EXISTS "Owners can update their salon appointments" ON public.appointments;

-- SELECT: dono do salão vê todos os agendamentos do seu salão.
CREATE POLICY "Owners can view their salon appointments"
ON public.appointments FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = appointments.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- UPDATE: dono pode atualizar (ex: marcar como concluído, cancelar pelo lado do salão).
CREATE POLICY "Owners can update their salon appointments"
ON public.appointments FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = appointments.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = appointments.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.7 reviews
--
-- Estado final após client_identity.sql Seção 10:
--   SELECT: público (landing page pública do salão).
--   UPDATE: apenas o dono do salão (responder avaliações).
--   INSERT pelo cliente: via Vercel Function service_role (auth.uid() = NULL).
--   "Clients can insert their own reviews" foi removida em Seção 10.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Reviews are publicly viewable"           ON public.reviews;
DROP POLICY IF EXISTS "Clients can insert their own reviews"    ON public.reviews;
DROP POLICY IF EXISTS "Owners can reply to their salon reviews" ON public.reviews;

CREATE POLICY "Reviews are publicly viewable"
ON public.reviews FOR SELECT USING (true);

-- INSERT pelo cliente: Vercel Function service_role (bypassa RLS). Sem policy anon.

CREATE POLICY "Owners can reply to their salon reviews"
ON public.reviews FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = reviews.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = reviews.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.8 notifications
--
-- Estado final após client_identity.sql Seção 10 + notifications_owner_insert_fix.sql:
--
--   SELECT: apenas o dono do salão (via owner_id = auth.uid()).
--   UPDATE: apenas o dono do salão (marcar como lidas).
--   INSERT Policy A: usuário autenticado insere com client_id NULL ou = auth.uid().
--   INSERT Policy B: dono insere notificação para cliente do próprio salão.
--
-- Políticas de cliente removidas em client_identity.sql Seção 10:
--   "Clients can view their own notifications"
--   "Clients can mark their notifications as read"
-- A policy "Authenticated users can insert notifications" foi reescrita em
-- notifications_owner_insert_fix.sql — usamos a versão final aqui.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients can view their own notifications"              ON public.notifications;
DROP POLICY IF EXISTS "Clients can mark their notifications as read"          ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications"          ON public.notifications;
DROP POLICY IF EXISTS "Owners can insert client notifications for their salon" ON public.notifications;
DROP POLICY IF EXISTS "Owners can view their salon notifications"             ON public.notifications;
DROP POLICY IF EXISTS "Owners can mark their salon notifications as read"     ON public.notifications;

-- SELECT: dono do salão vê todas as notificações (incluindo as sem client_id).
CREATE POLICY "Owners can view their salon notifications"
ON public.notifications FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = notifications.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- UPDATE: dono marca como lidas as notificações do seu salão.
CREATE POLICY "Owners can mark their salon notifications as read"
ON public.notifications FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = notifications.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = notifications.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- INSERT Policy A: usuário autenticado insere notificação para o dono (client_id NULL)
-- ou notifica a si mesmo (client_id = auth.uid()).
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    client_id IS NULL
    OR client_id = auth.uid()
  )
);

-- INSERT Policy B: dono insere notificação para um cliente do próprio salão.
-- Guardrail 1: auth.uid() deve ser o dono do salon_id informado na notificação.
-- Guardrail 2: client_id deve ter ao menos um agendamento neste salão.
-- (Cobertura do fluxo DashboardHome.jsx handleCancel/handleComplete.)
CREATE POLICY "Owners can insert client notifications for their salon"
ON public.notifications FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = notifications.salon_id
    AND s.owner_id = auth.uid()
  )
  AND (
    client_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.salon_id  = notifications.salon_id
      AND a.client_id = notifications.client_id
    )
  )
);


-- -----------------------------------------------------------------------------
-- 6.9 payments
-- Leitura e escrita exclusivas do admin.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can select payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;

CREATE POLICY "Admins can select payments"
ON public.payments FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);

CREATE POLICY "Admins can insert payments"
ON public.payments FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);

CREATE POLICY "Admins can update payments"
ON public.payments FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);

CREATE POLICY "Admins can delete payments"
ON public.payments FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);


-- -----------------------------------------------------------------------------
-- 6.10 time_blocks
-- SELECT público: motor de agendamento (cliente anônimo) precisa ler bloqueios.
-- Escrita restrita ao dono do salão.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Time blocks are publicly viewable"   ON public.time_blocks;
DROP POLICY IF EXISTS "Owners can insert their time blocks" ON public.time_blocks;
DROP POLICY IF EXISTS "Owners can update their time blocks" ON public.time_blocks;
DROP POLICY IF EXISTS "Owners can delete their time blocks" ON public.time_blocks;

CREATE POLICY "Time blocks are publicly viewable"
ON public.time_blocks FOR SELECT USING (true);

CREATE POLICY "Owners can insert their time blocks"
ON public.time_blocks FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = time_blocks.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can update their time blocks"
ON public.time_blocks FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = time_blocks.salon_id
    AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = time_blocks.salon_id
    AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete their time blocks"
ON public.time_blocks FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = time_blocks.salon_id
    AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.11 clients
-- SELECT: dono vê clientes vinculados aos seus salões via salon_clients.
-- INSERT/UPDATE/DELETE: bloqueado para authenticated; service_role bypassa RLS.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners can view clients of their salons" ON public.clients;

CREATE POLICY "Owners can view clients of their salons"
ON public.clients FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.salon_clients sc
    JOIN public.salons s ON s.id = sc.salon_id
    WHERE sc.client_id = clients.id
      AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.12 salon_clients
-- SELECT: dono vê vínculos dos seus salões.
-- INSERT/UPDATE/DELETE: bloqueado para authenticated; service_role bypassa RLS.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners can view their salon_clients" ON public.salon_clients;

CREATE POLICY "Owners can view their salon_clients"
ON public.salon_clients FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = salon_clients.salon_id
      AND s.owner_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.13 subscription_plans
-- SELECT público: cliente visualiza planos na página pública do salão.
-- Escrita restrita ao dono do salão.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subscription plans are viewable by everyone"         ON public.subscription_plans;
DROP POLICY IF EXISTS "Owners can insert their subscription plans"           ON public.subscription_plans;
DROP POLICY IF EXISTS "Owners can update their subscription plans"           ON public.subscription_plans;
DROP POLICY IF EXISTS "Owners can delete their subscription plans"           ON public.subscription_plans;

CREATE POLICY "Subscription plans are viewable by everyone"
ON public.subscription_plans FOR SELECT USING (true);

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


-- -----------------------------------------------------------------------------
-- 6.14 subscription_plan_services
-- SELECT público: cliente vê serviços e cotas de cada plano.
-- Escrita restrita ao dono do salão.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subscription plan services are viewable by everyone"    ON public.subscription_plan_services;
DROP POLICY IF EXISTS "Owners can insert their subscription plan services"      ON public.subscription_plan_services;
DROP POLICY IF EXISTS "Owners can update their subscription plan services"      ON public.subscription_plan_services;
DROP POLICY IF EXISTS "Owners can delete their subscription plan services"      ON public.subscription_plan_services;

CREATE POLICY "Subscription plan services are viewable by everyone"
ON public.subscription_plan_services FOR SELECT USING (true);

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


-- -----------------------------------------------------------------------------
-- 6.15 subscription_plan_days
-- SELECT público: cliente vê restrições de dias do plano.
-- Escrita restrita ao dono do salão.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Subscription plan days are viewable by everyone"    ON public.subscription_plan_days;
DROP POLICY IF EXISTS "Owners can insert their subscription plan days"      ON public.subscription_plan_days;
DROP POLICY IF EXISTS "Owners can update their subscription plan days"      ON public.subscription_plan_days;
DROP POLICY IF EXISTS "Owners can delete their subscription plan days"      ON public.subscription_plan_days;

CREATE POLICY "Subscription plan days are viewable by everyone"
ON public.subscription_plan_days FOR SELECT USING (true);

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


-- -----------------------------------------------------------------------------
-- 6.16 client_subscriptions
-- SELECT: dono do salão vê assinaturas do seu salão.
-- UPDATE: dono pode cancelar assinaturas (status, canceled_at, canceled_by).
-- INSERT: Vercel Function service_role (bypassa RLS). Sem policy anon.
-- Sem SELECT público: cliente sem auth.uid() usa service_role.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners can view their salon client subscriptions"   ON public.client_subscriptions;
DROP POLICY IF EXISTS "Owners can update their salon client subscriptions"  ON public.client_subscriptions;

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


-- -----------------------------------------------------------------------------
-- 6.17 appointment_services
-- SELECT: dono do salão e (como segunda barreira) cliente com sessão Auth real.
-- INSERT/DELETE: Vercel Function service_role. Sem policy anon.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners can view their salon appointment_services"     ON public.appointment_services;
DROP POLICY IF EXISTS "Clients can view services of their own appointments"  ON public.appointment_services;

CREATE POLICY "Owners can view their salon appointment_services"
ON public.appointment_services FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = appointment_services.salon_id
    AND s.owner_id = auth.uid()
  )
);

-- Segunda barreira: cliente com sessão Auth real vê serviços dos próprios agendamentos.
-- Em produção, a leitura do cliente ocorre via Vercel Function service_role.
CREATE POLICY "Clients can view services of their own appointments"
ON public.appointment_services FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_services.appointment_id
    AND a.client_id = auth.uid()
  )
);


-- -----------------------------------------------------------------------------
-- 6.18 payment_leads
-- SELECT: apenas admin. INSERT/UPDATE/DELETE: webhook via service_role (sem policy).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin can read payment leads" ON public.payment_leads;

CREATE POLICY "Admin can read payment leads"
ON public.payment_leads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);


-- -----------------------------------------------------------------------------
-- 6.19 salon_mp_credentials
-- INSERT: dono autentica e insere o token do próprio salão.
-- UPDATE: dono substitui o token (upsert).
-- SELECT: sem policy — token NUNCA retornado ao client-side.
--   service_role lê para os endpoints de pagamento.
--   Status de conexão exposto via RPC is_salon_mp_connected (boolean).
-- DELETE: sem policy — remoção é operação administrativa futura.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners can insert their mp credentials" ON public.salon_mp_credentials;
DROP POLICY IF EXISTS "Owners can update their mp credentials" ON public.salon_mp_credentials;

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


-- =============================================================================
-- SEÇÃO 7: STORAGE — BUCKETS E POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 Bucket 'logos' — logos dos salões
-- public = true: permite leitura via getPublicUrl sem autenticação.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access to logos"              ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;

-- Leitura pública do bucket logos.
CREATE POLICY "Public Access to logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');

-- Upload de logos: qualquer usuário autenticado (o dono do salão).
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Atualização de logos: qualquer usuário autenticado.
CREATE POLICY "Authenticated users can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'logos');


-- -----------------------------------------------------------------------------
-- 7.2 Bucket 'client-avatars' — fotos de perfil dos clientes
-- public = true: leitura via getPublicUrl sem autenticação.
-- Escrita exclusiva via service_role (Vercel Function client-identity.js).
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-avatars', 'client-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access to client-avatars" ON storage.objects;

-- Leitura pública do bucket client-avatars.
CREATE POLICY "Public read access to client-avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-avatars');

-- INSERT/UPDATE/DELETE em client-avatars: via service_role (bypassa RLS).
-- Sem policy para anon/authenticated — apenas a Vercel Function acessa.


-- =============================================================================
-- FIM DO SCHEMA COMPLETO
-- =============================================================================
--
-- Resumo de objetos criados:
--   Tabelas (19): profiles, salons, clients, services, working_hours, professionals,
--     appointments, reviews, notifications, payments, time_blocks, salon_clients,
--     subscription_plans, subscription_plan_services, subscription_plan_days,
--     client_subscriptions, appointment_services, payment_leads, salon_mp_credentials
--
--   Functions (3): is_client_blocked_at_salon, is_salon_mp_connected,
--     check_appointment_conflict
--
--   Triggers (1): trg_check_appointment_conflict ON appointments
--
--   Policies RLS (52):
--     profiles (3), salons (4), services (4), working_hours (4), professionals (4),
--     appointments (2), reviews (2), notifications (5), payments (4),
--     time_blocks (4), clients (1), salon_clients (1), subscription_plans (4),
--     subscription_plan_services (4), subscription_plan_days (4),
--     client_subscriptions (2), appointment_services (2), payment_leads (1),
--     salon_mp_credentials (2)
--
--   Storage buckets (2): logos, client-avatars
--   Storage policies (4): Public Access to logos, upload logos, update logos,
--     Public read access to client-avatars
-- =============================================================================
