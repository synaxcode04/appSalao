-- =============================================================================
-- rls_admin_fix.sql — App Salão
-- Correção do bloqueador de deploy: UPDATE em salons restrito a role='admin'
--
-- CONTEXTO DO PROBLEMA:
--   AdminDashboard.jsx (handleRegisterPayment e toggleBlockStatus) faz UPDATE
--   nas colunas status e subscription_expires_at da tabela salons via anon key
--   com o JWT do usuário admin. A única policy de UPDATE existente em salons é:
--
--     "Owners can update their salons." → USING (auth.uid() = owner_id)
--
--   Um usuário com role='admin' não é owner_id de nenhum salão de terceiros,
--   portanto o UPDATE é silenciosamente bloqueado pelo RLS — retorna 0 linhas
--   afetadas sem erro, mas sem efeito no banco.
--
-- PRÉ-REQUISITOS:
--   1. schema.sql deve ter sido executado (tabelas existem).
--   2. rls_fix.sql deve ter sido executado (constraint profiles_role_check
--      já inclui 'admin', tabela payments e policies de payments já existem).
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
--
-- APLICAÇÃO:
--   Supabase Dashboard → SQL Editor → colar este arquivo completo → Run.
--   NÃO aplicar diretamente — executar apenas via Supabase Dashboard.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: Policy de UPDATE em salons para admin
--
-- Problema:
--   A policy existente "Owners can update their salons." usa USING (auth.uid() = owner_id)
--   e não tem WITH CHECK — isso significa que owners podem atualizar qualquer coluna do
--   próprio salão sem restrição de WITH CHECK (Postgres usa USING como WITH CHECK quando
--   WITH CHECK não é especificado para UPDATE). Mas admin (não-owner) fica bloqueado.
--
-- Correção:
--   Adicionar uma segunda policy de UPDATE exclusiva para admin.
--   Postgres faz OR entre múltiplas policies permissivas do mesmo comando (UPDATE).
--   O admin pode atualizar qualquer salão (necessário para gerenciar licenças de terceiros).
--
-- Restrição de auth.uid() NULL:
--   EXISTS(...) retorna false quando auth.uid() IS NULL porque p.id = NULL nunca
--   satisfaz a igualdade. Não é necessário checar IS NOT NULL separadamente, mas
--   incluímos por clareza e conformidade com o padrão do projeto (seguranca.md).
-- =============================================================================

DROP POLICY IF EXISTS "Admins can update any salon" ON public.salons;

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


-- =============================================================================
-- SEÇÃO 2: Verificação de cobertura de payments (confirmação — já em rls_fix.sql)
--
-- As policies abaixo já existem após rls_fix.sql Seção 8:
--   "Admins can select payments"   → SELECT restrito a role='admin'
--   "Admins can insert payments"   → INSERT restrito a role='admin'
--   "Admins can update payments"   → UPDATE restrito a role='admin'
--   "Admins can delete payments"   → DELETE restrito a role='admin'
--
-- Este arquivo NÃO recria essas policies — elas já estão corretas e idempotentes
-- em rls_fix.sql. Execute apenas este arquivo se rls_fix.sql já foi aplicado.
-- =============================================================================


-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO (executar no Supabase Dashboard após aplicar)
-- =============================================================================
--
-- SALONS — UPDATE por admin
-- -------------------------
-- [ ] Confirmar que a nova policy existe:
--     SELECT policyname, cmd, qual, with_check
--     FROM pg_policies
--     WHERE schemaname = 'public' AND tablename = 'salons'
--     ORDER BY policyname;
--     -- Deve incluir "Admins can update any salon" com cmd = 'UPDATE'
--
-- [ ] Logado como admin (role='admin'): UPDATE salons SET status='expired'
--     WHERE id = <salon_id_de_outro_dono> → 1 linha afetada (sucesso)
--
-- [ ] Logado como admin: UPDATE salons SET subscription_expires_at = now() + interval '30 days'
--     WHERE id = <qualquer salon_id> → 1 linha afetada (sucesso)
--
-- [ ] Logado como dono do salão X: UPDATE salons SET status='expired'
--     WHERE id = <salon_id_do_PROPRIO_salao> → 1 linha afetada (policy de owner ainda funciona)
--
-- [ ] Logado como dono do salão X: UPDATE salons SET status='expired'
--     WHERE id = <salon_id_de_OUTRO_salao> → 0 linhas afetadas (isolamento entre donos mantido)
--
-- [ ] Logado como cliente: UPDATE salons SET status='expired'
--     WHERE id = <qualquer salon_id> → 0 linhas afetadas (acesso negado)
--
-- [ ] Não autenticado (anon): UPDATE salons SET status='expired'
--     WHERE id = <qualquer salon_id> → 0 linhas afetadas (acesso negado)
--
-- PAYMENTS — INSERT por admin (confirmação de rls_fix.sql)
-- --------------------------------------------------------
-- [ ] Logado como admin: INSERT INTO payments (salon_id, amount, description)
--     VALUES (<salon_id>, 99.90, 'Renovação mensal') → sucesso (1 linha inserida)
--
-- [ ] Logado como dono do salão X: INSERT INTO payments (salon_id, amount, description)
--     VALUES (<salon_id_X>, 99.90, 'Tentativa') → erro (policy violation)
--
-- [ ] Não autenticado (anon): INSERT INTO payments (...) → erro (policy violation)
--
-- =============================================================================
