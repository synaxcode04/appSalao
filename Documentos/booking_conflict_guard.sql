-- =============================================================================
-- booking_conflict_guard.sql
-- Proteção server-side contra double-booking em appointments
--
-- PROBLEMA:
--   BookingEngine.jsx verifica conflitos apenas no cliente (frontend).
--   Dois clientes simultâneos podem passar pela checagem client-side ao mesmo
--   tempo e gravar o mesmo slot para o mesmo profissional — race condition
--   clássica que o frontend nunca consegue eliminar sozinho.
--
-- SOLUÇÃO ESCOLHIDA: trigger BEFORE INSERT OR UPDATE
--   Um trigger BEFORE INSERT/UPDATE que faz RAISE EXCEPTION ao detectar
--   sobreposição de intervalos para o mesmo profissional (ou salão quando
--   professional_id é NULL).
--
-- POR QUE TRIGGER E NÃO CONSTRAINT EXCLUDE (GIST)?
--   A constraint EXCLUDE com operadores de range (&&) seria elegante, mas
--   tem duas limitações críticas para este schema:
--     1. professional_id é NULLABLE. No PostgreSQL, dois valores NULL nunca
--        são considerados iguais em exclusion constraints — o que significa
--        que agendamentos sem profissional definido jamais entrariam em
--        conflito entre si, deixando o caso "salão sem profissionais" sem
--        proteção. Para contornar isso seria necessário uma coluna sentinela
--        (ex: COALESCE(professional_id, salon_id)), mas isso é invasivo.
--     2. Requer a extensão btree_gist habilitada. Embora disponível no
--        Supabase, adiciona dependência de infraestrutura para algo que um
--        trigger resolve diretamente.
--   O trigger tem lógica explícita para ambos os casos (com e sem profissional)
--   e não depende de extensões adicionais.
--
-- REGRA DE NEGÓCIO APLICADA:
--   Apenas status = 'scheduled' bloqueia slot.
--   'canceled' e 'completed' são ignorados na detecção de conflito.
--   (Conforme .claude/rules/frontend/react.md e BookingEngine.jsx linha 84)
--
-- COMO APLICAR:
--   1. Acesse o Supabase Dashboard → SQL Editor
--   2. Cole e execute este arquivo inteiro
--   3. O script é idempotente: DROP IF EXISTS antes de cada CREATE garante
--      que pode ser re-executado sem erro em qualquer ambiente
--   4. Após aplicar, teste inserindo dois agendamentos sobrepostos via
--      SQL Editor para confirmar que o segundo é rejeitado com a mensagem
--      de erro esperada
--
-- ORDEM DE EXECUÇÃO EM AMBIENTE NOVO:
--   1. schema.sql
--   2. rls_fix.sql
--   3. booking_conflict_guard.sql  ← este arquivo
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Função do trigger
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.check_appointment_conflict() CASCADE;
-- CASCADE garante que o trigger dependente também é removido antes de recriar

CREATE OR REPLACE FUNCTION public.check_appointment_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  -- Só verificar conflito quando o novo/atualizado agendamento é 'scheduled'.
  -- 'canceled' e 'completed' não bloqueiam slots.
  IF NEW.status <> 'scheduled' THEN
    RETURN NEW;
  END IF;

  -- Detectar sobreposição de intervalos:
  -- Dois intervalos [A_start, A_end) e [B_start, B_end) se sobrepõem quando:
  --   A_start < B_end  AND  A_end > B_start
  -- Isso cobre todos os casos: contenção, sobreposição parcial esquerda/direita.

  IF NEW.professional_id IS NOT NULL THEN
    -- Caso 1: salão com profissional cadastrado.
    -- Conflito é por professional_id + appointment_date + sobreposição de horário.
    SELECT COUNT(*) INTO conflict_count
    FROM public.appointments
    WHERE professional_id    = NEW.professional_id
      AND appointment_date   = NEW.appointment_date
      AND status             = 'scheduled'
      AND id                 <> NEW.id   -- ignora o próprio registro em updates
      AND start_time         < NEW.end_time
      AND end_time           > NEW.start_time;

    IF conflict_count > 0 THEN
      RAISE EXCEPTION
        'Conflito de agendamento: o profissional já tem um horário marcado que se sobrepõe a % – % em %.',
        NEW.start_time, NEW.end_time, NEW.appointment_date
        USING ERRCODE = 'exclusion_violation';
    END IF;

  ELSE
    -- Caso 2: salão sem profissionais cadastrados (professional_id IS NULL).
    -- Conflito é por salon_id + appointment_date + sobreposição de horário.
    -- Neste modelo, o salão inteiro tem apenas uma "fila" de atendimento.
    SELECT COUNT(*) INTO conflict_count
    FROM public.appointments
    WHERE salon_id           = NEW.salon_id
      AND professional_id    IS NULL
      AND appointment_date   = NEW.appointment_date
      AND status             = 'scheduled'
      AND id                 <> NEW.id
      AND start_time         < NEW.end_time
      AND end_time           > NEW.start_time;

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


-- -----------------------------------------------------------------------------
-- Trigger na tabela appointments
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_check_appointment_conflict ON public.appointments;

CREATE TRIGGER trg_check_appointment_conflict
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.check_appointment_conflict();


-- -----------------------------------------------------------------------------
-- Índice de suporte para performance da checagem de conflito
-- Sem este índice, cada INSERT/UPDATE varre a tabela inteira de appointments.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_appointments_conflict_by_professional
  ON public.appointments (professional_id, appointment_date, status)
  WHERE professional_id IS NOT NULL AND status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_appointments_conflict_by_salon
  ON public.appointments (salon_id, appointment_date, status)
  WHERE professional_id IS NULL AND status = 'scheduled';


-- -----------------------------------------------------------------------------
-- Teste de sanidade (execute manualmente no SQL Editor para validar)
-- -----------------------------------------------------------------------------
--
-- Substitua os UUIDs por valores reais do seu banco antes de rodar.
--
-- -- Passo 1: inserir um agendamento base (deve ter sucesso)
-- INSERT INTO public.appointments
--   (salon_id, professional_id, service_id, client_id, appointment_date, start_time, end_time, status)
-- VALUES
--   ('<salon_uuid>', '<prof_uuid>', '<service_uuid>', '<client_uuid>', '2026-08-01', '10:00', '11:00', 'scheduled');
--
-- -- Passo 2: inserir agendamento sobreposto (deve lançar EXCEPTION com ERRCODE exclusion_violation)
-- INSERT INTO public.appointments
--   (salon_id, professional_id, service_id, client_id, appointment_date, start_time, end_time, status)
-- VALUES
--   ('<salon_uuid>', '<prof_uuid>', '<service_uuid>', '<outro_client_uuid>', '2026-08-01', '10:30', '11:30', 'scheduled');
--
-- -- Passo 3: inserir agendamento cancelado sobreposto (deve ter SUCESSO — cancelado não bloqueia)
-- INSERT INTO public.appointments
--   (salon_id, professional_id, service_id, client_id, appointment_date, start_time, end_time, status)
-- VALUES
--   ('<salon_uuid>', '<prof_uuid>', '<service_uuid>', '<outro_client_uuid>', '2026-08-01', '10:30', '11:30', 'canceled');
-- -----------------------------------------------------------------------------
