-- =============================================================================
-- rls_fix.sql — App Salão
-- Correção de políticas RLS permissivas e adição de colunas em salons
-- Consolida Task 1.2 do Sprint (isolamento multi-tenant real)
--
-- PRÉ-REQUISITO: Este arquivo deve ser executado APÓS schema.sql.
-- Ele pressupõe que todas as tabelas definidas em schema.sql já existem.
-- Executar rls_fix.sql sem schema.sql resultará em erros de "relation does not exist".
--
-- IDEMPOTENTE: execute DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- Seguro para re-execução em ambientes existentes.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: Colunas de controle em salons
-- =============================================================================

-- is_active: flag booleana de existência (mantida, não é a fonte de verdade do bloqueio)
ALTER TABLE public.salons
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;

-- status e subscription_expires_at: fonte de verdade do controle de licença.
--   status ('active' | 'expired') é gravado pelo AdminDashboard e lido por
--   OwnerLayout e SalonLayout para decidir se o acesso ao painel deve ser bloqueado.
--   subscription_expires_at indica quando a assinatura expira.
--   ADD COLUMN IF NOT EXISTS garante idempotência caso as colunas já existam no banco
--   de produção — seguro para rodar múltiplas vezes sem erro.
ALTER TABLE public.salons
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE public.salons
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;


-- =============================================================================
-- SEÇÃO 1b: Constraint de role em profiles — adicionar 'admin'
--
-- Problema: a constraint inline criada por schema.sql só permitia ('owner', 'client').
-- O valor 'admin' é necessário para o super-admin da plataforma (painel /admin e
-- policies de payments que verificam role = 'admin').
-- Sem esse valor na constraint, qualquer INSERT/UPDATE que tente gravar role = 'admin'
-- em profiles falha com violação de CHECK — impedindo a criação do usuário admin.
--
-- O nome default gerado pelo Postgres para a constraint inline da coluna role é
-- "profiles_role_check". O DROP IF EXISTS é seguro: se a constraint não existir
-- com esse nome (ex: banco criado com nome personalizado), o DROP não falha e o
-- ADD CONSTRAINT seguinte cria a constraint correta de qualquer forma.
--
-- Se o ADD CONSTRAINT falhar com "constraint already exists", significa que o banco
-- ainda tem uma constraint de nome diferente com a lista antiga. Nesse caso, inspecione
-- o nome real via:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';
-- E substitua "profiles_role_check" no DROP abaixo pelo nome encontrado.
-- =============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('owner', 'client', 'admin'));


-- =============================================================================
-- SEÇÃO 2: services
--
-- Problema original:
--   "Anyone authenticated can insert services"  → WITH CHECK (true)
--   "Anyone authenticated can update services"  → USING (true)
--
-- Correção: INSERT/UPDATE/DELETE exigem ownership via JOIN em salons.
-- SELECT permanece público (link público do cliente precisa ler serviços).
-- =============================================================================

DROP POLICY IF EXISTS "Anyone authenticated can insert services" ON public.services;
DROP POLICY IF EXISTS "Anyone authenticated can update services" ON public.services;
DROP POLICY IF EXISTS "Owners can insert their services" ON public.services;
DROP POLICY IF EXISTS "Owners can update their services" ON public.services;
DROP POLICY IF EXISTS "Owners can delete their services" ON public.services;

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


-- =============================================================================
-- SEÇÃO 3: working_hours
--
-- Problema original:
--   "Anyone authenticated can insert working hours"  → WITH CHECK (true)
--   "Anyone authenticated can update working hours"  → USING (true)
--
-- Correção: INSERT/UPDATE/DELETE exigem ownership via JOIN em salons.
-- SELECT permanece público (motor de agendamento do cliente precisa ler horários).
-- =============================================================================

DROP POLICY IF EXISTS "Anyone authenticated can insert working hours" ON public.working_hours;
DROP POLICY IF EXISTS "Anyone authenticated can update working hours" ON public.working_hours;
DROP POLICY IF EXISTS "Owners can insert their working hours" ON public.working_hours;
DROP POLICY IF EXISTS "Owners can update their working hours" ON public.working_hours;
DROP POLICY IF EXISTS "Owners can delete their working hours" ON public.working_hours;

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


-- =============================================================================
-- SEÇÃO 4: professionals
--
-- Problema original:
--   "Anyone authenticated can insert professionals"  → WITH CHECK (true)
--   "Anyone authenticated can update professionals"  → USING (true)
--
-- Correção: INSERT/UPDATE/DELETE exigem ownership via JOIN em salons.
-- SELECT permanece público (cliente precisa ver lista de profissionais ao agendar).
-- =============================================================================

DROP POLICY IF EXISTS "Anyone authenticated can insert professionals" ON public.professionals;
DROP POLICY IF EXISTS "Anyone authenticated can update professionals" ON public.professionals;
DROP POLICY IF EXISTS "Owners can insert their professionals" ON public.professionals;
DROP POLICY IF EXISTS "Owners can update their professionals" ON public.professionals;
DROP POLICY IF EXISTS "Owners can delete their professionals" ON public.professionals;

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


-- =============================================================================
-- SEÇÃO 5: appointments
--
-- Problema original:
--   "Appointments are viewable by everyone."  → USING (true)  [expõe dados de todos os clientes]
--   "Anyone authenticated can insert appointments"  → WITH CHECK (true)
--   "Anyone authenticated can update appointments"  → USING (true)  [sem WITH CHECK]
--
-- Correção:
--   SELECT — duas policies permissivas (Postgres faz OR entre elas):
--     1. Cliente vê apenas seus próprios agendamentos (client_id = auth.uid())
--     2. Dono do salão vê todos do seu salão (JOIN salons.owner_id = auth.uid())
--   INSERT — cliente insere para si mesmo (client_id = auth.uid())
--   UPDATE — duas policies separadas (cliente / dono do salão)
--
-- DECISÃO DE ISOLAMENTO MULTI-SALÃO (Correção 4):
--
--   A policy SELECT do cliente filtra por client_id = auth.uid() — o cliente vê TODOS
--   os seus agendamentos em TODOS os salões onde agendou. Isso é correto e intencional:
--   um cliente pode legitimamente ter agendamentos em múltiplos salões, e a policy RLS
--   não sabe qual salão está sendo visualizado na rota /s/:slug da UI.
--
--   O escopo por salão específico (exibir apenas agendamentos do salão da rota atual)
--   é responsabilidade da camada de aplicação, aplicado via .eq('salon_id', salon.id)
--   nas queries de ClientAppointments.jsx e ClientHistory.jsx — já implementado.
--
--   NUNCA adicionar um filtro de salon_id fixo na policy SELECT do cliente: isso
--   quebraria a UX para clientes com agendamentos em mais de um salão.
--
--   Resumo da divisão de responsabilidades:
--     RLS  → garante que o cliente vê APENAS os próprios agendamentos (isolamento por cliente)
--     App  → garante que a tela mostra APENAS o salão da rota atual (isolamento por salão visualizado)
-- =============================================================================

DROP POLICY IF EXISTS "Appointments are viewable by everyone." ON public.appointments;
DROP POLICY IF EXISTS "Anyone authenticated can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Anyone authenticated can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Clients can view their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Owners can view their salon appointments" ON public.appointments;
DROP POLICY IF EXISTS "Clients can insert their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Clients can update their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Owners can update their salon appointments" ON public.appointments;

-- SELECT: cliente vê os próprios agendamentos (em todos os salões onde agendou).
-- O filtro por salão específico é feito na camada de aplicação via .eq('salon_id', ...).
CREATE POLICY "Clients can view their own appointments"
ON public.appointments FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

-- SELECT: dono do salão vê todos os agendamentos do seu salão
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

-- INSERT: apenas o próprio cliente pode criar o agendamento para si
CREATE POLICY "Clients can insert their own appointments"
ON public.appointments FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

-- UPDATE: cliente pode alterar/cancelar apenas seus próprios agendamentos
CREATE POLICY "Clients can update their own appointments"
ON public.appointments FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

-- UPDATE: dono do salão pode atualizar qualquer agendamento do seu salão
-- (ex: marcar como concluído, cancelar pelo lado do salão)
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


-- =============================================================================
-- SEÇÃO 6: reviews
--
-- Estado original:
--   "Avaliações são públicas para leitura"  → USING (true)  — CORRETO, manter.
--   "Clientes podem criar avaliações"       → WITH CHECK (auth.uid() = client_id) — CORRETO,
--                                             mas falta garantia de auth.uid() IS NOT NULL explícita.
--   "Proprietários podem responder avaliações" → USING (EXISTS ...) mas SEM WITH CHECK — INCOMPLETO.
--
-- Correção:
--   Reescrever as três de forma idempotente.
--   SELECT mantido público.
--   INSERT: client_id = auth.uid() AND auth.uid() IS NOT NULL.
--   UPDATE do dono: USING e WITH CHECK com EXISTS (owner_id = auth.uid()).
-- =============================================================================

DROP POLICY IF EXISTS "Avaliações são públicas para leitura" ON public.reviews;
DROP POLICY IF EXISTS "Clientes podem criar avaliações" ON public.reviews;
DROP POLICY IF EXISTS "Proprietários podem responder avaliações" ON public.reviews;
DROP POLICY IF EXISTS "Reviews are publicly viewable" ON public.reviews;
DROP POLICY IF EXISTS "Clients can insert their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Owners can reply to their salon reviews" ON public.reviews;

-- SELECT: avaliações são públicas (leitura anônima permitida para exibição pública do salão)
CREATE POLICY "Reviews are publicly viewable"
ON public.reviews FOR SELECT
USING (true);

-- INSERT: cliente cria avaliação apenas para si mesmo
CREATE POLICY "Clients can insert their own reviews"
ON public.reviews FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

-- UPDATE: dono do salão pode responder avaliações do seu salão (campo owner_reply)
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


-- =============================================================================
-- SEÇÃO 7: notifications
--
-- Criação da tabela (idempotente) e políticas RLS.
--
-- MODELO DE DESTINATÁRIO — NUANCE DO FLUXO ATUAL:
--
--   As inserções em BookingEngine.jsx e ClientAppointments.jsx enviam apenas
--   {salon_id, title, message} — sem client_id. Essas são notificações PARA O DONO.
--   O campo client_id é NULL nessas inserções.
--
--   A leitura em ClientAppointments.jsx filtra por client_id = profile.id, o que
--   retorna 0 linhas no fluxo atual (pois client_id não é preenchido). Essa
--   inconsistência existe no código da aplicação e será corrigida no frontend.
--   O schema modela client_id como NULLABLE para não bloquear nenhum dos dois fluxos.
-- =============================================================================

-- Garantir que a tabela existe antes de criar as policies
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  -- client_id é NULLABLE: notificações para o dono não têm client_id (fluxo atual).
  -- Notificações destinadas a um cliente específico preenchem este campo (fluxo futuro).
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- Habilitar RLS (idempotente — não falha se já habilitado)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas antes de recriar (idempotência)
DROP POLICY IF EXISTS "Clients can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Owners can view their salon notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Clients can mark their notifications as read" ON public.notifications;
DROP POLICY IF EXISTS "Owners can mark their salon notifications as read" ON public.notifications;

-- SELECT: cliente vê notificações onde é o destinatário explícito (client_id = auth.uid())
-- Nota: no fluxo atual as notificações para o dono têm client_id NULL, portanto
-- esta policy retorna 0 linhas para clientes até o frontend ser corrigido para
-- preencher client_id nas inserções destinadas a clientes.
CREATE POLICY "Clients can view their own notifications"
ON public.notifications FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

-- SELECT: dono do salão vê todas as notificações do seu salão (incluindo as sem client_id)
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

-- INSERT: usuário autenticado pode inserir notificações.
-- Permite o fluxo atual (cliente autenticado notifica o dono sem preencher client_id).
-- WITH CHECK garante que:
--   - O inserter está autenticado (auth.uid() IS NOT NULL).
--   - Se client_id for preenchido, deve ser o próprio inserter (impede forjar destinatário).
-- Isso é aceitável pois o INSERT só grava title/message — não concede acesso a dados alheios.
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (client_id IS NULL OR client_id = auth.uid())
);

-- UPDATE: cliente marca suas próprias notificações como lidas (is_read = true)
-- Aplica-se ao fluxo onde client_id está preenchido (notificações destinadas ao cliente).
CREATE POLICY "Clients can mark their notifications as read"
ON public.notifications FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

-- UPDATE: dono do salão marca como lidas as notificações do seu salão (as sem client_id)
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


-- =============================================================================
-- SEÇÃO 8: payments
--
-- Tabela de extrato de pagamentos de licença gerenciada pelo admin.
--
-- Schema inferido do uso real em AdminDashboard.jsx:
--   INSERT grava: salon_id, amount, description  (payment_date não é fornecido → default now())
--   SELECT lê:    id, salon_id, amount, description, payment_date
--   Ordenação:    .order('payment_date', { ascending: false })
--
-- AVISO SOBRE A CONSTRAINT DE ROLE:
--   A constraint profiles_role_check foi expandida na Seção 1b para incluir 'admin'.
--   As policies abaixo que verificam role = 'admin' funcionarão corretamente após
--   a execução desta migration.
--
-- IDEMPOTÊNCIA: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- =============================================================================

-- Garantir que a tabela existe (idempotente)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  payment_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas antes de recriar (idempotência)
DROP POLICY IF EXISTS "Admins can select payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;

-- SELECT: apenas admin pode ler o extrato de pagamentos
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

-- INSERT: apenas admin pode registrar pagamentos
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

-- UPDATE: apenas admin pode corrigir registros de pagamento
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

-- DELETE: apenas admin pode remover registros de pagamento
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


-- =============================================================================
-- INSTRUÇÕES DE APLICAÇÃO
-- =============================================================================
--
-- 1. Acesse o Supabase Dashboard do projeto:
--    https://supabase.com/dashboard → selecione o projeto App Salão
--
-- 2. No menu lateral, clique em "SQL Editor".
--
-- 3. Clique em "+ New query".
--
-- 4. Cole o conteúdo COMPLETO deste arquivo no editor.
--
-- 5. Clique em "Run" (ou pressione Ctrl+Enter / Cmd+Enter).
--
-- 6. Verifique que a execução retorna "Success. No rows returned" (ou similar)
--    sem mensagens de erro. Se houver erro em algum DROP POLICY, é seguro ignorar
--    o aviso "policy does not exist" — o IF EXISTS já previne falha.
--
-- 7. Para confirmar que as policies foram criadas, execute a query de inspeção:
--    SELECT tablename, policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, policyname;
--
-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO MANUAL (executar no Supabase Dashboard após aplicar)
-- =============================================================================
--
-- Testes de RLS são validados manualmente — não via Vitest (conforme regra do projeto).
-- Para cada teste abaixo, use o SQL Editor com a função auth.uid() ou teste via
-- client JS com usuários reais logados no ambiente de desenvolvimento.
--
-- PROFILES — constraint de role
-- ------------------------------
-- [ ] INSERT de profile com role='admin' é aceito após a migration (Seção 1b)
-- [ ] UPDATE de profile existente para role='admin' é aceito
-- [ ] INSERT de profile com role='superuser' (valor inválido) → erro de CHECK violation
-- [ ] Confirmar constraint ativa:
--     SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';
--     -- Deve retornar: profiles_role_check | CHECK ((role = ANY (ARRAY['owner','client','admin'])))
--
-- SERVICES / WORKING_HOURS / PROFESSIONALS
-- ----------------------------------------
-- [ ] Logado como dono do salão A: INSERT service com salon_id do salão A → sucesso
-- [ ] Logado como dono do salão A: INSERT service com salon_id do salão B → erro (policy violation)
-- [ ] Logado como dono do salão A: UPDATE service do salão B → 0 linhas afetadas (bloqueado)
-- [ ] Logado como dono do salão A: DELETE professional do salão B → 0 linhas afetadas
-- [ ] Não autenticado (anon): SELECT services → retorna linhas (SELECT público mantido)
-- [ ] Não autenticado (anon): INSERT service → erro (policy violation)
-- [ ] Logado como cliente: INSERT working_hours em qualquer salon_id → erro (policy violation)
--
-- APPOINTMENTS
-- ------------
-- [ ] Logado como cliente A: SELECT appointments → retorna apenas agendamentos onde client_id = A
-- [ ] Logado como cliente A: SELECT appointments do cliente B → 0 linhas
-- [ ] Logado como cliente A: INSERT appointment com client_id = A → sucesso
-- [ ] Logado como cliente A: INSERT appointment com client_id = B → erro (policy violation)
-- [ ] Logado como dono do salão X: SELECT appointments do salão X → retorna todos
-- [ ] Logado como dono do salão X: SELECT appointments do salão Y → 0 linhas
-- [ ] Logado como dono do salão X: UPDATE status do appointment do salão X → sucesso
-- [ ] Logado como dono do salão X: UPDATE status do appointment do salão Y → 0 linhas afetadas
-- [ ] Logado como cliente A: UPDATE seu próprio appointment (ex: cancelar) → sucesso
-- [ ] Logado como cliente A: UPDATE appointment do cliente B → 0 linhas afetadas
-- [ ] Não autenticado (anon): SELECT appointments → 0 linhas (não é público)
-- [ ] Não autenticado (anon): INSERT appointment → erro (policy violation)
-- [ ] Logado como cliente A com agendamentos em salões X e Y:
--     SELECT appointments → retorna agendamentos de ambos os salões (multi-salão correto)
--     SELECT appointments filtrado por .eq('salon_id', X) → retorna apenas agendamentos do salão X
--
-- REVIEWS
-- -------
-- [ ] Não autenticado (anon): SELECT reviews → retorna linhas (SELECT público mantido)
-- [ ] Logado como cliente A: INSERT review com client_id = A → sucesso
-- [ ] Logado como cliente A: INSERT review com client_id = B → erro (policy violation)
-- [ ] Não autenticado (anon): INSERT review → erro (policy violation)
-- [ ] Logado como dono do salão X: UPDATE owner_reply em review do salão X → sucesso
-- [ ] Logado como dono do salão X: UPDATE owner_reply em review do salão Y → 0 linhas afetadas
-- [ ] Logado como cliente: UPDATE owner_reply em qualquer review → 0 linhas afetadas
--
-- SALONS (colunas de controle)
-- ----------------------------
-- [ ] Confirmar que coluna is_active existe:
--     SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'salons' AND column_name = 'is_active';
-- [ ] Confirmar que coluna status existe:
--     SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'salons' AND column_name = 'status';
-- [ ] Confirmar que coluna subscription_expires_at existe:
--     SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'salons' AND column_name = 'subscription_expires_at';
-- [ ] Salão recém-criado tem is_active = true e status = 'active' por padrão
-- [ ] subscription_expires_at aceita NULL (salão sem data de expiração configurada)
--
-- NOTIFICATIONS
-- -------------
-- [ ] Não autenticado (anon): SELECT notifications → 0 linhas (sem policy pública de SELECT)
-- [ ] Não autenticado (anon): INSERT notification → erro (policy violation)
-- [ ] Logado como cliente A: SELECT notifications onde client_id = A, salon_id = X → retorna linhas do cliente A
-- [ ] Logado como cliente A: SELECT notifications onde client_id = B → 0 linhas (isolamento entre clientes)
-- [ ] Logado como cliente A: INSERT notification com client_id = NULL → sucesso (notifica dono, fluxo atual)
-- [ ] Logado como cliente A: INSERT notification com client_id = A → sucesso (notifica a si mesmo)
-- [ ] Logado como cliente A: INSERT notification com client_id = B → erro (policy violation — não pode forjar destinatário)
-- [ ] Logado como cliente A: UPDATE is_read em notification onde client_id = A → sucesso
-- [ ] Logado como cliente A: UPDATE is_read em notification onde client_id = B → 0 linhas afetadas
-- [ ] Logado como dono do salão X: SELECT notifications do salão X (client_id NULL) → retorna linhas
-- [ ] Logado como dono do salão X: SELECT notifications do salão Y → 0 linhas
-- [ ] Logado como dono do salão X: UPDATE is_read em notification do salão X → sucesso
-- [ ] Logado como dono do salão X: UPDATE is_read em notification do salão Y → 0 linhas afetadas
--
-- PAYMENTS
-- --------
-- [ ] Confirmar que tabela payments existe:
--     SELECT table_name FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'payments';
-- [ ] Logado como admin (role = 'admin'): SELECT payments → retorna linhas
-- [ ] Logado como admin: INSERT payment com salon_id válido → sucesso
-- [ ] Logado como dono do salão X: SELECT payments → 0 linhas (acesso negado)
-- [ ] Logado como cliente: SELECT payments → 0 linhas (acesso negado)
-- [ ] Não autenticado (anon): SELECT payments → 0 linhas (acesso negado)
-- [ ] Não autenticado (anon): INSERT payment → erro (policy violation)
--
-- =============================================================================
