-- Migration: adiciona has_lunch_break à tabela working_hours
-- Data: 2026-08-04
-- Propósito: tornar a pausa de almoço OPCIONAL por dia.
--   - has_lunch_break = true  → pausa ativa (BookingEngine bloqueia o intervalo break_start/end)
--   - has_lunch_break = false → sem pausa (BookingEngine ignora break_start/end, mesmo que preenchidos)
--
-- Idempotente: IF NOT EXISTS garante que re-execução não quebre nada.
-- Aplicar manualmente no Supabase Dashboard → SQL Editor.

-- 1. Adiciona coluna com default true (não quebra rows existentes)
ALTER TABLE public.working_hours
  ADD COLUMN IF NOT EXISTS has_lunch_break BOOLEAN NOT NULL DEFAULT true;

-- 2. Corrige registros existentes sem pausa configurada
--    Registros que nunca tiveram break preenchido ficavam com has_lunch_break=true
--    pelo default, o que faria o BookingEngine "esperar" uma pausa inexistente.
--    Esta UPDATE marca-os corretamente como false.
UPDATE public.working_hours
  SET has_lunch_break = false
  WHERE break_start_time IS NULL OR break_end_time IS NULL;

-- Resultado esperado:
--   - Rows com break_start_time e break_end_time preenchidos → has_lunch_break = true  (sem alteração)
--   - Rows com break_start_time ou break_end_time NULL      → has_lunch_break = false (corrigidos)
--
-- RLS: nenhuma policy precisa mudar. has_lunch_break é uma coluna da mesma tabela
-- coberta pelas policies existentes:
--   • SELECT público (leitura pelo motor de agendamento do cliente) — continua válida.
--   • INSERT/UPDATE/DELETE restritos ao dono via JOIN em salons.owner_id — continua válida.
-- A coluna nova não altera o escopo de ownership nem cria superfície de ataque nova.
