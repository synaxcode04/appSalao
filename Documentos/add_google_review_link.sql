-- =============================================================================
-- Migration: Link do Google Reviews na tabela salons
-- Data: 2026-08-02
-- Descrição: Adiciona a coluna google_review_link (TEXT, nullable) à tabela
--            public.salons para que o dono possa informar o link de avaliação
--            do Google. Validação de formato de URL fica no frontend.
--            Idempotente: usa ADD COLUMN IF NOT EXISTS.
--
-- RLS — não é necessário criar nenhuma policy nova:
--   • Leitura pública já coberta por:
--       "Salons are viewable by everyone." FOR SELECT USING (true)
--   • Escrita do dono já coberta por:
--       "Owners can update their salons." FOR UPDATE USING (auth.uid() = owner_id)
--   Policies PostgreSQL operam por linha, não por coluna — qualquer coluna nova
--   adicionada à tabela é automaticamente coberta pelas policies de linha existentes.
-- =============================================================================

ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS google_review_link TEXT;
