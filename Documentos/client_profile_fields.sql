-- =============================================================================
-- client_profile_fields.sql — App Salão
-- Adiciona avatar_url em public.clients e cria o bucket 'client-avatars'
-- para upload de fotos de perfil do cliente via Vercel Function (service_role).
--
-- ORDEM DE EXECUÇÃO:
--   Execute após client_identity.sql (tabela clients já deve existir).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, INSERT ON CONFLICT DO NOTHING,
--              DROP POLICY IF EXISTS antes de CREATE POLICY.
--
-- NOTAS:
--   - birth_date JÁ EXISTE em public.clients (adicionada em client_identity.sql
--     Seção 1.1). Não é adicionada aqui para evitar conflito.
--   - avatar_url é adicionada aqui pela primeira vez.
--   - O upload é feito exclusivamente pela Vercel Function app/api/client-identity.js
--     com service_role, que bypassa RLS de storage. Não é necessária policy de
--     INSERT para anon/authenticated.
--   - Bucket 'client-avatars' dedicado (separado de 'logos'): fotos de clientes
--     e logos de salões têm contextos, ciclos de vida e owners diferentes.
--     Manter buckets separados facilita auditoria, permissões e eventual limpeza.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: Coluna avatar_url em public.clients
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;


-- =============================================================================
-- SEÇÃO 2: Bucket de Storage 'client-avatars'
--
-- public = true: permite leitura via getPublicUrl sem autenticação (exibição
-- da foto no frontend sem depender de signed URLs).
-- INSERT ON CONFLICT DO NOTHING: idempotente, re-execução segura.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-avatars', 'client-avatars', true)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- SEÇÃO 3: Policy SELECT público no bucket 'client-avatars'
--
-- Permite que qualquer pessoa (anon ou autenticada) leia os objetos do bucket,
-- o que é necessário para exibir a foto de perfil do cliente no frontend via
-- getPublicUrl (URL pública gerada pelo Supabase Storage).
--
-- INSERT/UPDATE/DELETE: sem policy para anon/authenticated. Essas operações
-- são feitas exclusivamente via service_role (Vercel Function), que bypassa
-- RLS de storage por padrão no Supabase.
-- =============================================================================

DROP POLICY IF EXISTS "Public read access to client-avatars" ON storage.objects;

CREATE POLICY "Public read access to client-avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-avatars');


-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO MANUAL (executar no Supabase Dashboard após aplicar)
-- =============================================================================
--
-- ESTRUTURA
-- ---------
-- [ ] Confirmar coluna avatar_url em public.clients:
--     SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'clients'
--       AND column_name = 'avatar_url';
--     -- Deve retornar data_type='text', is_nullable='YES'
--
-- [ ] Confirmar coluna birth_date em public.clients (já existia):
--     SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'clients'
--       AND column_name = 'birth_date';
--     -- Deve retornar data_type='date', is_nullable='YES'
--
-- STORAGE
-- -------
-- [ ] Confirmar bucket 'client-avatars' existe e é público:
--     SELECT id, name, public FROM storage.buckets WHERE id = 'client-avatars';
--     -- Deve retornar id='client-avatars', name='client-avatars', public=true
--
-- [ ] Confirmar policy de SELECT público:
--     SELECT policyname FROM pg_policies
--     WHERE tablename = 'objects'
--       AND policyname = 'Public read access to client-avatars';
--     -- Deve retornar 1 linha
--
-- COMPORTAMENTO
-- -------------
-- [ ] Via service_role (Vercel Function): upload de arquivo em 'client-avatars' → sucesso
-- [ ] Via anon key (frontend): GET URL pública de um objeto em 'client-avatars' → sucesso
-- [ ] Via anon key (frontend): PUT/POST em 'client-avatars' → erro (sem policy de INSERT)
--
-- =============================================================================
