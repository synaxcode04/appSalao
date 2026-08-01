-- =============================================================================
-- Migration: add_slot_interval_minutes
-- Criado em: 2026-08-01
-- Descrição: Adiciona a coluna slot_interval_minutes na tabela salons para
--            permitir configuração do intervalo de exibição de slots por salão.
--
-- Semântica:
--   NULL (default) → usar a duração do serviço como intervalo (comportamento atual).
--   Valor inteiro  → múltiplo de 15, mínimo 15, máximo 120 (em minutos).
--
-- Idempotência:
--   - ADD COLUMN IF NOT EXISTS garante que a coluna não é criada duas vezes.
--   - O bloco DO $$ verifica pg_constraint antes de criar a CHECK constraint,
--     evitando erro caso a migration seja executada mais de uma vez.
--
-- Políticas RLS:
--   Nenhuma policy nova é necessária. A policy existente em salons:
--     "Owners can update their salons" FOR UPDATE USING (auth.uid() = owner_id)
--   cobre qualquer UPDATE na linha do salão, incluindo esta coluna. O owner
--   só consegue atualizar a linha do próprio salão — isolamento multi-tenant
--   garantido pelo owner_id.
-- =============================================================================

-- 1. Adicionar a coluna (idempotente via IF NOT EXISTS)
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS slot_interval_minutes INTEGER DEFAULT NULL;

-- 2. Adicionar CHECK constraint (idempotente via verificação em pg_constraint)
--    Nome da constraint: salons_slot_interval_minutes_check
--    Regra: NULL é permitido (significa "usar duração do serviço");
--           quando preenchido, deve ser múltiplo de 15, entre 15 e 120.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'salons_slot_interval_minutes_check'
      AND conrelid = 'public.salons'::regclass
  ) THEN
    ALTER TABLE public.salons
      ADD CONSTRAINT salons_slot_interval_minutes_check
      CHECK (
        slot_interval_minutes IS NULL
        OR (
          slot_interval_minutes >= 15
          AND slot_interval_minutes <= 120
          AND slot_interval_minutes % 15 = 0
        )
      );
  END IF;
END;
$$;
