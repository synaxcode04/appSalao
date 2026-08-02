-- =============================================================================
-- Migration: Endereço estruturado na tabela salons
-- Data: 2026-08-02
-- Descrição: Adiciona seis colunas de endereço estruturado à tabela public.salons.
--            A coluna address (texto livre) é MANTIDA como fallback — não dropar.
--            Os campos novos ficam NULL até o dono reeditar o perfil do salão.
--            Idempotente: usa ADD COLUMN IF NOT EXISTS em todas as colunas.
-- =============================================================================

ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS numero     TEXT,
  ADD COLUMN IF NOT EXISTS bairro     TEXT,
  ADD COLUMN IF NOT EXISTS cep        TEXT,
  ADD COLUMN IF NOT EXISTS cidade     TEXT,
  ADD COLUMN IF NOT EXISTS estado     TEXT;
