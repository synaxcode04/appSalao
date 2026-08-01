-- =============================================================================
-- add_appointment_services.sql — App Salão
-- Migration proposta: tabela de junção appointment_services
-- Status: PROPOSTA — NÃO EXECUTAR sem revisão e aprovação manual no Supabase Dashboard
--
-- PROPÓSITO:
--   Suportar agendamentos de múltiplos serviços (1 appointment = 1 bloco contínuo
--   de tempo → N serviços vinculados, mesmo profissional em sequência, duração = soma).
--
-- DECISÃO DE COMPATIBILIDADE RETROATIVA (aprovada pelo usuário):
--   appointments.service_id é mantido NOT NULL e populado com o 1º serviço do bloco.
--   Isso preserva queries existentes (BookingEngine, histórico, notificações) sem
--   alteração. A tabela appointment_services é ADICIONAL — não substitui service_id.
--
-- MODELO DE SESSÃO DO CLIENTE (sessão leve — decisão 2026-08-01):
--   O cliente NÃO tem auth.uid(). Toda escrita em appointment_services é feita via
--   Vercel Function com service_role (igual a appointments hoje), que bypassa RLS.
--   As policies RLS aqui são segunda barreira de segurança — não existe policy de
--   escrita via anon/cliente pois auth.uid() seria sempre NULL nesse contexto.
--
-- IDEMPOTENTE: usa CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS e
--   DROP POLICY IF EXISTS antes de cada CREATE POLICY.
--   Seguro para re-execução em ambientes existentes.
--
-- ORDEM DE EXECUÇÃO RECOMENDADA (ambiente novo):
--   1. schema.sql
--   2. rls_fix.sql
--   3. add_slot_interval_minutes.sql
--   4. este arquivo (add_appointment_services.sql)
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: Criação da tabela appointment_services
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.appointment_services (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,

  appointment_id UUID        REFERENCES public.appointments(id) ON DELETE CASCADE NOT NULL,
  -- ON DELETE CASCADE: se o agendamento pai for deletado, os itens filhos são
  -- removidos automaticamente. Isso é o comportamento correto — um item de serviço
  -- não faz sentido sem o agendamento pai.

  service_id     UUID        REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  -- Decisão de CASCADE vs RESTRICT em service_id:
  --   O projeto já usa ON DELETE CASCADE em appointments.service_id (schema.sql linha 111).
  --   Mantemos CASCADE aqui para consistência com o padrão existente.
  --   RISCO: deletar um serviço remove silenciosamente as linhas de appointment_services
  --   que o referenciam. O appointment pai sobrevive, mas perde o vínculo com o serviço
  --   deletado. Se auditoria financeira histórica for necessária no futuro, considere
  --   copiar nome/preço do serviço para colunas snapshot nesta tabela antes de aplicar.

  salon_id       UUID        REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  -- salon_id é redundante por design: appointment_id → appointments.salon_id já forneceria
  -- o salon_id via JOIN, mas um JOIN triplo nas policies RLS onera cada query.
  -- Armazenar salon_id diretamente permite o mesmo padrão EXISTS(salons WHERE owner_id)
  -- usado em todas as outras tabelas de salão neste projeto. A Vercel Function que
  -- insere deve garantir que salon_id coincida com appointments.salon_id do registro pai.

  created_at     TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- Índice para lookup dos serviços de um agendamento (leitura principal: N linhas por appointment_id)
CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment_id
  ON public.appointment_services (appointment_id);

-- Índice secundário para queries de escopo de salão (relatórios e dashboard do dono)
CREATE INDEX IF NOT EXISTS idx_appointment_services_salon_id
  ON public.appointment_services (salon_id);


-- =============================================================================
-- SEÇÃO 2: Habilitar RLS
-- =============================================================================

ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SEÇÃO 3: Policies RLS
--
-- PADRÃO: espelha policies de appointments (schema.sql linhas 337–391).
-- Nunca usar WITH CHECK (true) ou USING (true) — ver regras em seguranca.md.
-- =============================================================================

-- Remover policies antigas antes de recriar (idempotência)
DROP POLICY IF EXISTS "Owners can view their salon appointment_services"   ON public.appointment_services;
DROP POLICY IF EXISTS "Clients can view services of their own appointments" ON public.appointment_services;
DROP POLICY IF EXISTS "Owners can insert appointment services for their salon"  ON public.appointment_services;
DROP POLICY IF EXISTS "Owners can delete appointment services of their salon"   ON public.appointment_services;

-- -----------------------------------------------------------------------------
-- SELECT: dono do salão vê os serviços dos agendamentos do seu salão
--
-- Espelha "Owners can view their salon appointments".
-- Não existe SELECT público (appointments também não tem).
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- SELECT: cliente autenticado vê os serviços dos próprios agendamentos
--
-- Relevante para ambientes de desenvolvimento onde o cliente tenha sessão Auth
-- real. Em produção, a leitura pelo cliente ocorre via Vercel Function com
-- service_role (auth.uid() é NULL no modelo de sessão leve do cliente).
-- Espelha "Clients can view their own appointments".
-- -----------------------------------------------------------------------------
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
-- INSERT e DELETE: escrita via service_role (Vercel Function) bypassa RLS.
--
-- Não criamos policy de INSERT/UPDATE/DELETE para anon:
--   - O cliente não tem auth.uid() → qualquer policy dependente de auth.uid()
--     seria equivalente a bloquear o cliente mesmo que quiséssemos abrir acesso.
--   - Uma policy WITH CHECK (true) abriria escrita irrestrita para qualquer
--     usuário autenticado — violação do isolamento multi-tenant.
--
-- Comportamento padrão do RLS quando nenhuma policy de escrita existe:
--   INSERT/UPDATE/DELETE via anon key → bloqueados (deny by default). Correto.
--   INSERT/UPDATE/DELETE via service_role → permitidos (bypassa RLS). Correto.
--
-- Se futuramente o painel do dono precisar inserir/deletar via anon key diretamente
-- (sem Vercel Function), adicionar as policies com EXISTS(salons WHERE owner_id = auth.uid())
-- seguindo o padrão de services/working_hours/professionals no schema.sql.
-- -----------------------------------------------------------------------------


-- =============================================================================
-- SEÇÃO 4: Checklist de validação manual (pós-aplicação no Supabase)
-- =============================================================================
--
-- Execute no SQL Editor após aplicar esta migration para verificar isolamento:
--
-- [ ] Logado como dono do salão A:
--       SELECT * FROM public.appointment_services WHERE salon_id = '<id_salao_A>';
--       → deve retornar linhas do salão A
--
-- [ ] Logado como dono do salão A tentando ler salão B:
--       SELECT * FROM public.appointment_services WHERE salon_id = '<id_salao_B>';
--       → deve retornar 0 linhas (isolamento multi-tenant)
--
-- [ ] Sem autenticação (anon key):
--       SELECT * FROM public.appointment_services;
--       → deve retornar 0 linhas (sem policy pública)
--
-- [ ] INSERT via anon key (sem service_role):
--       INSERT INTO public.appointment_services (...) VALUES (...);
--       → deve retornar erro "new row violates row-level security policy"
--
-- [ ] INSERT via service_role (simular Vercel Function):
--       Usar "Run as service role" no Dashboard ou via API com service_role key
--       → deve inserir normalmente
--
-- [ ] ON DELETE CASCADE (appointment pai):
--       DELETE FROM public.appointments WHERE id = '<id_appointment>';
--       SELECT * FROM public.appointment_services WHERE appointment_id = '<id_appointment>';
--       → deve retornar 0 linhas (cascade funcionou)
--
-- [ ] ON DELETE CASCADE (service deletado):
--       DELETE FROM public.services WHERE id = '<id_servico>';
--       SELECT * FROM public.appointment_services WHERE service_id = '<id_servico>';
--       → deve retornar 0 linhas (cascade funcionou — ver nota de risco na SEÇÃO 1)
-- =============================================================================
