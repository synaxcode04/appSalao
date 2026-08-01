-- =============================================================================
-- notifications_owner_insert_fix.sql — App Salão
-- Corrige policy de INSERT em notifications para permitir que o dono do salão
-- insira notificações destinadas a clientes do seu próprio salão.
--
-- PROBLEMA IDENTIFICADO
-- ---------------------
-- DashboardHome.jsx → handleCancel / handleComplete inserem notificações com:
--   { client_id: appt.client_id, salon_id: salon.id, title: ..., message: ... }
--
-- O inserter é o DONO do salão (auth.uid() = owner_id), mas client_id é o UUID
-- do CLIENTE que agendou — portanto client_id != auth.uid().
--
-- A policy anterior bloqueava silenciosamente esse INSERT porque exigia:
--   client_id IS NULL OR client_id = auth.uid()
-- Como client_id != auth.uid() do dono, o INSERT falhava sem erro visível.
-- Resultado: notificação in-app nunca chegava ao cliente (push OneSignal funcionava,
-- mas a leitura in-app em ClientAppointments.jsx retornava 0 linhas).
--
-- SOLUÇÃO
-- -------
-- Dividir a policy de INSERT em duas policies separadas (Postgres faz OR entre elas):
--
--   Policy A — comportamento existente, preservado integralmente:
--     Qualquer usuário autenticado pode inserir notificação com client_id NULL
--     (notifica o dono) ou com client_id = auth.uid() (notifica a si mesmo).
--
--   Policy B — nova, para o fluxo do dono:
--     O dono do salão pode inserir notificação com client_id de um cliente
--     desde que esse cliente tenha pelo menos um agendamento neste salão.
--
-- RACIOCÍNIO DE SEGURANÇA
-- -----------------------
-- 1. auth.uid() IS NOT NULL: garante que nunca há acesso anônimo.
--
-- 2. O JOIN em salons.owner_id = auth.uid() prova que auth.uid() é dono do salon_id
--    informado na notificação. Usar salon_id sozinho seria insuficiente — qualquer
--    usuário autenticado poderia enviar notificações forjando o salon_id de outro salão.
--
-- 3. O sub-select em appointments valida que client_id pertence a um cliente real do salão.
--    Sem essa verificação, o dono poderia enviar notificações para qualquer client_id
--    (inclusive clientes de outros salões ou UUIDs arbitrários).
--    Isso garante isolamento multi-tenant: um dono só notifica clientes do SEU salão.
--
-- 4. A Policy A é mantida separada para não alterar o fluxo do cliente que insere
--    notificação para o dono com client_id NULL (BookingEngine.jsx, ClientAppointments.jsx).
--
-- IDEMPOTÊNCIA
-- ------------
-- DROP POLICY IF EXISTS antes de cada CREATE garante re-execução segura.
--
-- PRÉ-REQUISITO: schema.sql + rls_fix.sql já aplicados.
-- =============================================================================


-- Remover a policy anterior que bloqueava o INSERT do dono
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- Remover a nova policy (caso este arquivo seja re-executado)
DROP POLICY IF EXISTS "Owners can insert client notifications for their salon" ON public.notifications;


-- =============================================================================
-- POLICY A — comportamento existente, preservado
--
-- Cobre dois sub-casos (OR implícito nas condições):
--   1. client_id IS NULL  → notificação destinada ao dono (BookingEngine.jsx,
--                           ClientAppointments.jsx — fluxo atual sem client_id).
--   2. client_id = auth.uid() → usuário notifica a si mesmo.
-- =============================================================================
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  -- Nunca permitir inserção anônima
  auth.uid() IS NOT NULL
  AND (
    -- Notificação para o dono: sem destinatário explícito
    client_id IS NULL
    -- Ou o inserter notifica a si mesmo
    OR client_id = auth.uid()
  )
);


-- =============================================================================
-- POLICY B — nova: dono insere notificação para cliente do seu próprio salão
--
-- Cobre o fluxo de DashboardHome.jsx → handleCancel / handleComplete:
--   INSERT { client_id: appt.client_id, salon_id: salon.id, title, message }
--   onde auth.uid() = salon.owner_id  e  client_id = appt.client_id (≠ auth.uid()).
--
-- Dois guardrails:
--   1. EXISTS em salons → prova que auth.uid() é dono do salon_id na notificação.
--   2. EXISTS em appointments → prova que client_id tem histórico neste salão,
--      impedindo o dono de enviar notificações para clientes de outros salões.
-- =============================================================================
CREATE POLICY "Owners can insert client notifications for their salon"
ON public.notifications FOR INSERT
WITH CHECK (
  -- Nunca permitir inserção anônima
  auth.uid() IS NOT NULL

  -- Guardrail 1: o inserter deve ser dono do salão referenciado na notificação.
  -- salon_id sozinho NÃO prova ownership — o JOIN com owner_id é obrigatório.
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = notifications.salon_id
    AND s.owner_id = auth.uid()
  )

  -- Guardrail 2: se client_id for preenchido, deve pertencer a um cliente real
  -- que tenha ao menos um agendamento neste salão. Isso impede o dono de
  -- enviar notificações para client_ids arbitrários fora do seu salão.
  AND (
    client_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.salon_id = notifications.salon_id
      AND a.client_id = notifications.client_id
    )
  )
);


-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO MANUAL (após aplicar no Supabase Dashboard)
-- =============================================================================
--
-- Policy A — comportamento existente
-- [ ] Logado como cliente A: INSERT { salon_id: X, title, message }
--     (client_id omitido → NULL) → sucesso (notifica dono do salão X)
-- [ ] Logado como cliente A: INSERT { client_id: A, salon_id: X, title, message }
--     → sucesso (cliente notifica a si mesmo)
-- [ ] Logado como cliente A: INSERT { client_id: B, salon_id: X, title, message }
--     → erro de policy violation (não pode forjar destinatário)
-- [ ] Não autenticado (anon): INSERT notification → erro de policy violation
--
-- Policy B — novo fluxo do dono
-- [ ] Logado como dono do salão X: INSERT { client_id: <cliente_que_agendou_em_X>,
--     salon_id: X, title, message } → sucesso
-- [ ] Logado como dono do salão X: INSERT { client_id: <cliente_que_NÃO_agendou_em_X>,
--     salon_id: X, title, message } → erro (guardrail 2 bloqueia)
-- [ ] Logado como dono do salão X: INSERT { client_id: <cliente_do_salão_Y>,
--     salon_id: X, title, message } → erro (guardrail 2 bloqueia — sem appointment em X)
-- [ ] Logado como dono do salão X: INSERT { client_id: <cliente_do_salão_Y>,
--     salon_id: Y, title, message } → erro (guardrail 1 bloqueia — X não é dono de Y)
-- [ ] Logado como cliente A (não dono): INSERT { client_id: B, salon_id: X, ... }
--     → erro (guardrail 1 bloqueia — cliente A não é dono de X)
--
-- =============================================================================
