-- =============================================================================
-- time_blocks.sql — App Salão
-- Criação da tabela time_blocks (bloqueio pontual de horário / folga avulsa)
-- e suas políticas RLS.
--
-- PRÉ-REQUISITO: schema.sql deve ter sido executado antes deste arquivo.
--   As tabelas salons e professionals precisam existir.
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- Seguro para re-execução em ambientes existentes.
--
-- Decisão registrada em 2026-08-01: feature de "bloqueio pontual / folga avulsa
-- por profissional" aprovada pelo usuário. O campo professional_id é nullable:
--   NULL  → bloqueia todos os profissionais do salão naquele intervalo.
--   UUID  → bloqueia apenas o profissional específico.
--
-- A verificação desses bloqueios no cálculo de slots disponíveis é responsabilidade
-- do BookingEngine — o SQL aqui apenas define a estrutura e o isolamento de dados.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: Criação da tabela
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.time_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  -- NULL = bloqueia o salão inteiro (todos os profissionais) nesse intervalo.
  -- UUID = bloqueia apenas esse profissional específico.
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE NULL,
  block_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  -- reason é opcional: "Folga", "Feriado", "Manutenção", etc.
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice de performance: o BookingEngine consulta bloqueios filtrando por
-- salon_id + block_date a cada cálculo de slots. Sem índice, full scan na tabela.
CREATE INDEX IF NOT EXISTS time_blocks_salon_id_block_date_idx
  ON public.time_blocks (salon_id, block_date);


-- =============================================================================
-- SEÇÃO 2: Habilitar RLS
-- =============================================================================

-- Habilitar RLS (idempotente — não falha se já habilitado)
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SEÇÃO 3: Remover policies antigas antes de recriar (idempotência)
-- =============================================================================

DROP POLICY IF EXISTS "Time blocks are publicly viewable" ON public.time_blocks;
DROP POLICY IF EXISTS "Owners can insert their time blocks" ON public.time_blocks;
DROP POLICY IF EXISTS "Owners can update their time blocks" ON public.time_blocks;
DROP POLICY IF EXISTS "Owners can delete their time blocks" ON public.time_blocks;


-- =============================================================================
-- SEÇÃO 4: Policies RLS
--
-- SELECT — público (sem autenticação):
--   O motor de agendamento (BookingEngine) é executado na sessão do cliente,
--   que NÃO tem auth.uid() (sessão leve via localStorage — ver seguranca.md).
--   Os bloqueios precisam ser lidos anonimamente para o cálculo de slots
--   funcionar, exatamente como working_hours e services.
--
-- INSERT / UPDATE / DELETE — restrito ao dono do salão:
--   Apenas o owner cujo salons.owner_id = auth.uid() pode criar/editar/remover
--   bloqueios do seu próprio salão. USING sozinho não protege escritas —
--   INSERT e UPDATE exigem WITH CHECK (conforme regra de seguranca.md).
-- =============================================================================

-- SELECT: público — cliente (anon) precisa ler os bloqueios para calcular slots
CREATE POLICY "Time blocks are publicly viewable"
ON public.time_blocks FOR SELECT
USING (true);

-- INSERT: apenas o dono do salão pode criar bloqueios no seu próprio salão
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

-- UPDATE: apenas o dono do salão pode editar bloqueios do seu próprio salão
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

-- DELETE: apenas o dono do salão pode remover bloqueios do seu próprio salão
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
--    sem mensagens de erro.
--
-- 7. Para confirmar que a tabela e policies foram criadas corretamente:
--
--    -- Confirmar tabela:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'time_blocks';
--
--    -- Confirmar índice:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'time_blocks';
--
--    -- Confirmar policies:
--    SELECT policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'time_blocks'
--    ORDER BY policyname;
--
-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO MANUAL (executar no Supabase Dashboard após aplicar)
-- =============================================================================
--
-- [ ] Não autenticado (anon): SELECT time_blocks → retorna linhas (SELECT público)
-- [ ] Não autenticado (anon): INSERT time_block → erro (policy violation)
-- [ ] Logado como dono do salão A: INSERT time_block com salon_id do salão A → sucesso
-- [ ] Logado como dono do salão A: INSERT time_block com salon_id do salão B → erro (policy violation)
-- [ ] Logado como dono do salão A: UPDATE time_block do salão A → sucesso
-- [ ] Logado como dono do salão A: UPDATE time_block do salão B → 0 linhas afetadas
-- [ ] Logado como dono do salão A: DELETE time_block do salão A → sucesso
-- [ ] Logado como dono do salão A: DELETE time_block do salão B → 0 linhas afetadas
-- [ ] Logado como cliente (qualquer): INSERT time_block em qualquer salão → erro (policy violation)
-- [ ] INSERT com professional_id = NULL (bloqueia salão inteiro) → aceito
-- [ ] INSERT com professional_id = UUID de profissional do salão → aceito
-- [ ] INSERT com professional_id de profissional de salão diferente → aceito no nível RLS
--     (validação de integridade de FK/negócio deve ser feita na camada de aplicação)
--
-- =============================================================================
