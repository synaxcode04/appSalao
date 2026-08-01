-- =============================================================================
-- client_identity.sql — App Salão
-- Modelagem Opção A: cadastro de cliente global por telefone
-- Tabelas: clients (identidade global) + salon_clients (vínculo N:N)
-- Migração de FKs: appointments, reviews, notifications → clients(id)
--
-- ORDEM DE EXECUÇÃO OBRIGATÓRIA:
--   1. schema.sql          (estrutura base + policies permissivas)
--   2. rls_fix.sql         (correção RLS multi-tenant)
--   3. client_identity.sql (este arquivo — novas tabelas + migração de FKs)
--
-- PRÉ-REQUISITO: schema.sql e rls_fix.sql já executados no ambiente.
--
-- IDEMPOTENTE: seguro para re-execução. Usa CREATE TABLE IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, DROP POLICY IF EXISTS,
-- INSERT ... ON CONFLICT DO NOTHING, e blocos condicionais em DO $$.
--
-- ACESSO VIA SERVICE_ROLE:
--   As tabelas clients e salon_clients são acessadas EXCLUSIVAMENTE via Vercel
--   Function server-side usando a service_role key do Supabase. O service_role
--   bypassa RLS por padrão no Supabase — ele não depende das policies abaixo.
--   As policies existem para garantir que acessos diretos via anon key ou
--   authenticated (frontend) sejam corretamente bloqueados ou isolados.
--   NUNCA exponha a service_role key no frontend (sem prefixo VITE_).
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: Tabela clients (identidade global do cliente)
--
-- phone é a chave de identidade global entre todos os salões.
-- RESPONSABILIDADE DA VERCEL FUNCTION: normalizar o telefone antes do INSERT/lookup
-- (remover caracteres não numéricos, garantir apenas dígitos). O banco armazena
-- somente a versão normalizada. Exemplo: "(11) 99999-9999" → "11999999999".
-- Sem essa normalização, dois registros com o mesmo número em formatos diferentes
-- passariam pela constraint UNIQUE e gerariam duplicidade de cliente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone      TEXT        NOT NULL UNIQUE,
  full_name  TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SEÇÃO 1.1 (INCREMENTAL): Coluna birth_date em clients
--
-- Data de nascimento do cliente — campo opcional do cadastro presencial
-- realizado pelo dono via ClientsManager.jsx.
--
-- NULLABLE: birth_date não é obrigatório no cadastro (cliente pode não informar).
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS — seguro para re-execução.
--
-- Sem policies novas: acesso exclusivamente via service_role (bypassa RLS).
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date DATE;


-- =============================================================================
-- SEÇÃO 2: Tabela salon_clients (vínculo N:N cliente ↔ salão)
--
-- Um cliente pode estar vinculado a múltiplos salões.
-- Um salão pode ter múltiplos clientes.
-- A UNIQUE(salon_id, client_id) impede registro duplicado do mesmo vínculo.
-- ON DELETE CASCADE garante limpeza automática ao remover salão ou cliente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.salon_clients (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id   UUID        NOT NULL REFERENCES public.salons(id)  ON DELETE CASCADE,
  client_id  UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (salon_id, client_id)
);

-- Habilitar RLS
ALTER TABLE public.salon_clients ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SEÇÃO 3 (NOVA): Backfill de clients a partir de profiles
--
-- PROBLEMA RESOLVIDO AQUI:
--   A Seção 4 (troca de FKs) falha com ERROR 23503 se houver UUIDs em
--   appointments/reviews/notifications que referenciam profiles(id) mas não
--   existem em clients(id). Esta seção resolve isso ANTES da troca.
--
-- ESTRATÉGIA — preservação de UUID:
--   Inserimos em clients com id = profiles.id. Isso evita ter que atualizar
--   os valores de client_id em appointments/reviews/notifications — os UUIDs
--   existentes continuam válidos após a troca de FK.
--
-- ESCOPO DO BACKFILL — baseado em referências reais, não em role:
--   Migramos para clients TODO profiles.id que apareça como client_id em
--   appointments, reviews OU notifications, independentemente do campo role
--   do perfil. Isso cobre casos reais onde um dono de salão também se cadastrou
--   como cliente em outro salão (ou testou o próprio sistema como cliente) —
--   esses perfis têm role='owner' mas são referenciados por FKs client_id e
--   causariam órfãos na Seção 5 se filtrados por role. A abordagem por UNION
--   das três tabelas é robusta para qualquer role presente ou futura sem exigir
--   intervenção manual na migration.
--
-- NORMALIZAÇÃO DE PHONE:
--   profiles.phone pode conter formatação variada ("(11) 99999-9999", etc.).
--   Aplicamos regexp_replace(phone, '\D', '', 'g') para extrair apenas dígitos,
--   alinhando com a expectativa da tabela clients.
--
-- FALLBACK PARA PHONE NULO OU DUPLICADO — decisão documentada:
--
--   clients.phone é NOT NULL UNIQUE, portanto todo cliente migrado PRECISA
--   ter um valor único. Dois cenários problemáticos:
--
--   A) phone IS NULL ou vazio após normalização:
--      → Atribuímos placeholder determinístico: 'PENDING-' || id::text
--      → Por que placeholder e não pular? appointments.client_id é NOT NULL.
--        Se pularmos o INSERT em clients, a FK da Seção 4 quebra para esse id.
--        O placeholder garante que a FK pode ser criada; o telefone real deve
--        ser regularizado manualmente depois (ex: consultar o cliente).
--
--   B) phone normalizado já existe em clients (duplicata entre profiles):
--      → Também atribuímos placeholder: 'PENDING-' || id::text
--      → Isso pode ocorrer se dois profiles usavam o mesmo número (ex: cadastros
--        duplicados). O primeiro profile processado fica com o número real;
--        os subsequentes ficam com placeholder. A ordem é determinística
--        (ORDER BY p.created_at, p.id) para garantir idempotência.
--      → AÇÃO MANUAL NECESSÁRIA: perfis com placeholder de duplicata precisam
--        ser fundidos ou ter o telefone correto atualizado na tabela clients.
--        Use a query de diagnóstico no final desta seção para identificá-los.
--
--   TRADE-OFF: placeholder garante integridade referencial mas cria dados
--   provisórios em clients. A alternativa (pular o INSERT) manteria os dados
--   limpos mas causaria erro 23503 na Seção 4 — inaceitável.
-- =============================================================================

DO $$
DECLARE
  r               RECORD;
  normalized_phone TEXT;
  final_phone      TEXT;
BEGIN
  -- Processa todo profiles.id referenciado como client_id em appointments,
  -- reviews ou notifications que ainda não existe em clients. O filtro é
  -- baseado em referências reais das três tabelas (UNION), não em role='client',
  -- pois donos que também atuaram como clientes têm role='owner' mas são
  -- igualmente referenciados por FKs client_id — filtrá-los por role os
  -- tornaria órfãos na Seção 5 e abortaria a migration.
  -- Ordem determinística por created_at, id: em caso de duplicata de phone,
  -- o registro mais antigo fica com o número real (decisão idempotente).
  FOR r IN
    SELECT p.id, p.full_name, p.phone
    FROM   public.profiles p
    WHERE  p.id IN (
             SELECT client_id FROM public.appointments   WHERE client_id IS NOT NULL
             UNION
             SELECT client_id FROM public.reviews        WHERE client_id IS NOT NULL
             UNION
             SELECT client_id FROM public.notifications  WHERE client_id IS NOT NULL
           )
      AND  NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p.id)
    ORDER BY p.created_at, p.id
  LOOP
    -- Normaliza: mantém apenas dígitos
    normalized_phone := regexp_replace(COALESCE(r.phone, ''), '\D', '', 'g');

    IF normalized_phone = '' THEN
      -- Caso A: phone nulo ou sem dígitos → placeholder
      final_phone := 'PENDING-' || r.id::text;
      RAISE NOTICE '[client_identity] Profile % (%) não tem telefone válido. Placeholder atribuído: %',
        r.id, r.full_name, final_phone;

    ELSIF EXISTS (SELECT 1 FROM public.clients c WHERE c.phone = normalized_phone) THEN
      -- Caso B: phone normalizado já existe em clients (duplicata) → placeholder
      final_phone := 'PENDING-' || r.id::text;
      RAISE NOTICE '[client_identity] Profile % (%) tem phone duplicado (%). Placeholder atribuído: %',
        r.id, r.full_name, normalized_phone, final_phone;

    ELSE
      -- Caso normal: phone válido e único
      final_phone := normalized_phone;
    END IF;

    INSERT INTO public.clients (id, phone, full_name)
    VALUES (r.id, final_phone, r.full_name)
    ON CONFLICT (id) DO NOTHING;
    -- ON CONFLICT (id): re-execução segura — se o id já existe em clients
    -- (ex: foi inserido num run anterior ou criado pela Vercel Function),
    -- simplesmente ignora. Não sobrescreve dados existentes.

  END LOOP;

  RAISE NOTICE '[client_identity] Backfill de clients concluído.';
END $$;

-- Diagnóstico pós-backfill: identifica profiles com placeholder para revisão manual.
-- Execute esta query separadamente no Supabase Dashboard se quiser ver a lista:
--
--   SELECT c.id, c.phone, c.full_name
--   FROM   public.clients c
--   WHERE  c.phone LIKE 'PENDING-%'
--   ORDER BY c.full_name;
--
-- Para cada linha retornada, localize o telefone real do cliente e atualize:
--   UPDATE public.clients SET phone = '<telefone_normalizado>' WHERE id = '<uuid>';


-- =============================================================================
-- SEÇÃO 4 (NOVA): Backfill de salon_clients a partir de appointments e reviews
--
-- Popula salon_clients com os pares (salon_id, client_id) já implícitos nos
-- dados existentes. Isso garante que os donos vejam seus clientes históricos
-- desde o primeiro uso das novas tabelas.
--
-- Fonte 1: appointments — todo agendamento implica vínculo cliente ↔ salão.
-- Fonte 2: reviews — toda avaliação implica vínculo cliente ↔ salão.
--
-- ON CONFLICT (salon_id, client_id) DO NOTHING: idempotente, re-execução segura.
-- Só insere vínculos cujo client_id já foi migrado para clients (INNER JOIN).
-- Pares com client_id ainda não em clients (orphan) são silenciosamente ignorados
-- aqui — o bloco de diagnóstico da Seção 5 os identificará antes da troca de FK.
-- =============================================================================

INSERT INTO public.salon_clients (salon_id, client_id)
SELECT DISTINCT a.salon_id, a.client_id
FROM   public.appointments a
WHERE  a.client_id IS NOT NULL
  AND  EXISTS (SELECT 1 FROM public.clients c WHERE c.id = a.client_id)
ON CONFLICT (salon_id, client_id) DO NOTHING;

INSERT INTO public.salon_clients (salon_id, client_id)
SELECT DISTINCT r.salon_id, r.client_id
FROM   public.reviews r
WHERE  r.client_id IS NOT NULL
  AND  EXISTS (SELECT 1 FROM public.clients c WHERE c.id = r.client_id)
ON CONFLICT (salon_id, client_id) DO NOTHING;


-- =============================================================================
-- SEÇÃO 5 (NOVA): Diagnóstico de órfãos antes da troca de FKs
--
-- Verifica se ainda há client_ids em appointments/reviews/notifications que
-- NÃO existem em clients. Se existirem, a Seção 6 (ADD CONSTRAINT) falharia
-- com ERROR 23503. Nesse caso, a execução é interrompida aqui com mensagem
-- explicativa para que o administrador possa corrigir manualmente.
--
-- Causas possíveis de órfãos remanescentes:
--   - profiles com role diferente de 'client' que têm agendamentos (dados inconsistentes).
--   - profiles deletados de auth.users mas com registros remanescentes em appointments.
--   - client_ids inseridos diretamente sem passar por profiles (dados externos).
--
-- Resolução manual para cada orphan_id identificado:
--   OPÇÃO 1 — inserir em clients manualmente:
--     INSERT INTO public.clients (id, phone, full_name)
--     VALUES ('<orphan_id>', 'PENDING-<orphan_id>', '<nome_se_conhecido>');
--   OPÇÃO 2 — nullificar o client_id (apenas para notifications, que é NULLABLE):
--     UPDATE public.notifications SET client_id = NULL WHERE client_id = '<orphan_id>';
--   OPÇÃO 3 — deletar os registros órfãos (apenas se forem dados descartáveis):
--     DELETE FROM public.appointments WHERE client_id = '<orphan_id>';
-- =============================================================================

DO $$
DECLARE
  orphan_appt  INTEGER;
  orphan_rev   INTEGER;
  orphan_notif INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_appt
  FROM   public.appointments
  WHERE  client_id IS NOT NULL
    AND  client_id NOT IN (SELECT id FROM public.clients);

  SELECT COUNT(*) INTO orphan_rev
  FROM   public.reviews
  WHERE  client_id IS NOT NULL
    AND  client_id NOT IN (SELECT id FROM public.clients);

  SELECT COUNT(*) INTO orphan_notif
  FROM   public.notifications
  WHERE  client_id IS NOT NULL
    AND  client_id NOT IN (SELECT id FROM public.clients);

  IF orphan_appt > 0 OR orphan_rev > 0 OR orphan_notif > 0 THEN
    RAISE NOTICE '[client_identity] Órfãos encontrados — appointments: %, reviews: %, notifications: %',
      orphan_appt, orphan_rev, orphan_notif;
    RAISE NOTICE '[client_identity] Para listar os IDs órfãos execute:';
    RAISE NOTICE '  SELECT DISTINCT client_id, ''appointments'' AS origem FROM public.appointments WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM public.clients)';
    RAISE NOTICE '  UNION ALL';
    RAISE NOTICE '  SELECT DISTINCT client_id, ''reviews'' FROM public.reviews WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM public.clients)';
    RAISE NOTICE '  UNION ALL';
    RAISE NOTICE '  SELECT DISTINCT client_id, ''notifications'' FROM public.notifications WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM public.clients);';
    RAISE EXCEPTION '[client_identity] Backfill incompleto: há % orphan(s) em appointments, % em reviews, % em notifications. Resolva manualmente (veja comentários na Seção 5) antes de prosseguir com a troca de FKs.',
      orphan_appt, orphan_rev, orphan_notif;
  ELSE
    RAISE NOTICE '[client_identity] Nenhum órfão encontrado. Prosseguindo com a troca de FKs.';
  END IF;
END $$;


-- =============================================================================
-- SEÇÃO 6: Migração de FKs — appointments, reviews, notifications
--
-- EXECUTADA APENAS após backfill bem-sucedido (Seções 3, 4 e 5).
--
-- Como os UUIDs foram preservados (clients.id = profiles.id para migrados),
-- não é necessário atualizar os valores de client_id nas tabelas — apenas
-- a referência da FK muda de profiles(id) para clients(id).
--
-- NULLABLE em notifications: notifications.client_id já é NULL na maioria
-- das linhas do fluxo atual (notificações para o dono). A constraint continua
-- NULLABLE, então linhas com client_id NULL passam sem problema.
--
-- Os nomes das constraints abaixo são os gerados automaticamente pelo Postgres
-- para as FK inline definidas em schema.sql. Se o banco foi criado com nomes
-- diferentes, inspecione via:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = '<tabela>'::regclass AND contype = 'f' AND conname LIKE '%client_id%';
-- =============================================================================

-- --- appointments.client_id ---

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_client_id_fkey;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES public.clients(id)
    ON DELETE CASCADE;

-- --- reviews.client_id ---

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_client_id_fkey;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES public.clients(id)
    ON DELETE CASCADE;

-- --- notifications.client_id ---
-- Permanece NULLABLE (ver comentário no schema.sql sobre Fluxo A vs Fluxo B).
-- Notificações para o dono continuam com client_id = NULL.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_client_id_fkey;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES public.clients(id)
    ON DELETE CASCADE;


-- =============================================================================
-- SEÇÃO 7: Policies RLS — clients
--
-- Estratégia:
--   - anon: SEM NENHUMA POLICY → acesso completamente bloqueado por RLS.
--   - service_role: bypassa RLS por padrão (Supabase). Todas as operações CRUD
--     da Vercel Function (lookup por phone, INSERT de novo cliente) usam
--     service_role e não dependem dessas policies.
--   - authenticated (dono): SELECT permitido apenas para clientes vinculados
--     a um salão do qual o usuário autenticado é owner. Escrita bloqueada
--     (apenas service_role escreve em clients).
-- =============================================================================

DROP POLICY IF EXISTS "Owners can view clients of their salons" ON public.clients;

-- SELECT: dono vê clientes vinculados aos seus salões via salon_clients
CREATE POLICY "Owners can view clients of their salons"
ON public.clients FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.salon_clients sc
    JOIN public.salons s ON s.id = sc.salon_id
    WHERE sc.client_id = clients.id
      AND s.owner_id = auth.uid()
  )
);

-- INSERT/UPDATE/DELETE para authenticated: bloqueado (nenhuma policy criada).
-- Apenas service_role (Vercel Function) pode gravar em clients.


-- =============================================================================
-- SEÇÃO 8: Policies RLS — salon_clients
--
-- Estratégia idêntica à de clients:
--   - anon: SEM NENHUMA POLICY → bloqueado.
--   - service_role: bypassa RLS.
--   - authenticated (dono): SELECT permitido apenas para vínculos de salões
--     que pertencem ao usuário autenticado. Escrita bloqueada.
-- =============================================================================

DROP POLICY IF EXISTS "Owners can view their salon_clients" ON public.salon_clients;

-- SELECT: dono vê apenas vínculos de clientes dos seus próprios salões
CREATE POLICY "Owners can view their salon_clients"
ON public.salon_clients FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = salon_clients.salon_id
      AND s.owner_id = auth.uid()
  )
);

-- INSERT/UPDATE/DELETE para authenticated: bloqueado (nenhuma policy criada).
-- Apenas service_role (Vercel Function) pode criar vínculos em salon_clients.


-- =============================================================================
-- SEÇÃO 9 (INCREMENTAL): Inativação de cliente por salão
--
-- CONTEXTO ARQUITETURAL:
--   O cliente do App Salão possui sessão Supabase Auth real. O ClientSessionContext
--   no React é apenas uma camada de conveniência no frontend por cima dessa sessão
--   — não substitui nem elimina auth.uid(). O backfill da Seção 3 preservou os
--   UUIDs (clients.id = profiles.id = auth.uid()), portanto auth.uid() == client_id
--   funciona corretamente no INSERT de appointments (conforme a policy da Seção 9.3).
--
--   O bloqueio de clientes inativos DEVE ser verificado na policy RLS de INSERT em
--   appointments. A função is_client_blocked_at_salon precisa ser SECURITY DEFINER
--   NÃO por ausência de auth.uid(), mas porque o cliente autenticado não tem
--   permissão de SELECT em salon_clients: a policy da Seção 8 libera SELECT apenas
--   para o DONO do salão. Sem SECURITY DEFINER, a leitura de salon_clients dentro
--   da função seria bloqueada pela RLS no contexto do cliente, tornando a checagem
--   de is_active ineficaz.
--
--   A escrita do flag is_active (toggle inativar/reativar) é feita EXCLUSIVAMENTE
--   via Vercel Function server-side usando a service_role key, que bypassa RLS.
--   Nenhuma policy de UPDATE para authenticated é criada aqui para salon_clients.
--
-- SEMÂNTICA DO FLAG:
--   - is_active = true  → cliente ativo neste salão (padrão para novos vínculos)
--   - is_active = false → cliente inativo neste salão (bloqueado para novos
--                         agendamentos neste salão; histórico intacto)
--   - Ausência de vínculo em salon_clients → cliente não bloqueado (pode agendar)
--
--   Inativar em um salão NÃO afeta o status do cliente em outros salões.
--   A identidade global em clients não é alterada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9.1: Coluna is_active em salon_clients
--
-- Adicionada de forma incremental e idempotente.
-- DEFAULT true: todos os vínculos existentes e futuros nascem ativos.
-- NOT NULL: ausência de valor nunca gera ambiguidade na função da Seção 9.2.
-- -----------------------------------------------------------------------------

ALTER TABLE public.salon_clients
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;


-- -----------------------------------------------------------------------------
-- 9.2: Função SECURITY DEFINER — public.is_client_blocked_at_salon
--
-- Retorna TRUE se o cliente estiver EXPLICITAMENTE inativo (is_active = false)
-- para o salão informado. Retorna FALSE em todos os outros casos:
--   - Vínculo inexistente em salon_clients → FALSE (não bloqueia)
--   - Vínculo com is_active = true         → FALSE (não bloqueia)
--   - Vínculo com is_active = false        → TRUE  (bloqueia)
--
-- SECURITY DEFINER: necessário porque o cliente autenticado não tem SELECT em
-- salon_clients — a policy da Seção 8 restringe esse SELECT apenas ao dono do
-- salão. Sem SECURITY DEFINER, a RLS bloquearia a leitura de salon_clients no
-- contexto do cliente, tornando a função ineficaz. O SECURITY DEFINER permite
-- que a função rode com os privilégios do seu definidor, contornando a RLS
-- restritiva de salon_clients independente de quem a chama.
--
-- search_path = public: fixa o schema para evitar ataques de search_path hijacking
-- (boas práticas para funções SECURITY DEFINER).
--
-- GRANT EXECUTE para anon e authenticated: mantido para compatibilidade com
-- eventuais chamadas diretas de diagnóstico via Supabase Dashboard e para
-- suportar revisão futura do modelo de sessão.
--
-- CREATE OR REPLACE: idempotente — re-execução segura sem precisar de DROP.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_client_blocked_at_salon(
  p_salon_id  UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salon_clients sc
    WHERE sc.salon_id  = p_salon_id
      AND sc.client_id = p_client_id
      AND sc.is_active = false
  );
$$;

-- Permite execução nos contextos anon (cliente sem sessão Auth) e authenticated.
REVOKE EXECUTE ON FUNCTION public.is_client_blocked_at_salon(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_client_blocked_at_salon(UUID, UUID) TO anon;
GRANT  EXECUTE ON FUNCTION public.is_client_blocked_at_salon(UUID, UUID) TO authenticated;


-- -----------------------------------------------------------------------------
-- 9.3: Policy INSERT em appointments — nota arquitetural
--
-- A policy "Clients can insert their own appointments" foi originalmente
-- definida em rls_fix.sql. A Seção 10.1 remove essa policy (e qualquer versão
-- anterior dela) porque o modelo de sessão do cliente é leve: auth.uid() é
-- sempre NULL no contexto de requisições do cliente, tornando a policy ineficaz.
-- Toda operação de INSERT em appointments pelo cliente é feita via Vercel Function
-- usando service_role, que bypassa RLS. O DROP IF EXISTS na Seção 10.1 é
-- suficiente para garantir idempotência em qualquer ambiente.
-- -----------------------------------------------------------------------------


-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO MANUAL (executar no Supabase Dashboard após aplicar)
-- =============================================================================
--
-- BACKFILL
-- --------
-- [ ] Verificar clientes migrados com placeholder (revisar manualmente):
--     SELECT id, phone, full_name FROM public.clients WHERE phone LIKE 'PENDING-%';
--     → Atualizar phone para o número real de cada um ou fundir com registro existente.
--
-- [ ] Verificar totais pós-migração:
--     SELECT COUNT(*) FROM public.clients;
--     SELECT COUNT(*) FROM public.salon_clients;
--     -- Deve refletir o número de profiles com role='client' + clientes futuros.
--
-- ESTRUTURA
-- ---------
-- [ ] Confirmar tabela clients existe com colunas (id, phone, full_name, birth_date, created_at):
--     SELECT column_name FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'clients';
-- [ ] Confirmar constraint UNIQUE em clients.phone:
--     SELECT indexname FROM pg_indexes
--     WHERE tablename = 'clients' AND indexdef LIKE '%phone%';
-- [ ] Confirmar tabela salon_clients existe com UNIQUE(salon_id, client_id):
--     SELECT indexname FROM pg_indexes
--     WHERE tablename = 'salon_clients' AND indexdef LIKE '%salon_id%client_id%';
-- [ ] Confirmar coluna is_active em salon_clients (Seção 9.1):
--     SELECT column_name, data_type, column_default, is_nullable
--     FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'salon_clients'
--       AND column_name = 'is_active';
--     -- Deve retornar data_type='boolean', column_default='true', is_nullable='NO'
--
-- FKs MIGRADAS
-- ------------
-- [ ] Confirmar FK de appointments.client_id → clients:
--     SELECT conname, confrelid::regclass FROM pg_constraint
--     WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_client_id_fkey';
--     -- Deve retornar confrelid = 'public.clients'
-- [ ] Idem para reviews.client_id e notifications.client_id.
--
-- RLS — clients
-- -------------
-- [ ] Não autenticado (anon): SELECT clients → 0 linhas (RLS bloqueia sem policy pública)
-- [ ] Não autenticado (anon): INSERT clients → erro (policy violation)
-- [ ] Logado como dono do salão X: SELECT clients vinculados ao salão X → retorna linhas corretas
-- [ ] Logado como dono do salão X: SELECT clients vinculados ao salão Y (de outro dono) → 0 linhas
-- [ ] Logado como dono: INSERT client diretamente (sem service_role) → erro (policy violation)
-- [ ] Logado como cliente (role='client'): SELECT clients → 0 linhas (sem policy para clientes)
--
-- RLS — salon_clients
-- -------------------
-- [ ] Não autenticado (anon): SELECT salon_clients → 0 linhas
-- [ ] Não autenticado (anon): INSERT salon_clients → erro (policy violation)
-- [ ] Logado como dono do salão X: SELECT salon_clients com salon_id = X → retorna linhas
-- [ ] Logado como dono do salão X: SELECT salon_clients com salon_id = Y → 0 linhas
-- [ ] Logado como dono: INSERT salon_clients diretamente → erro (policy violation)
--
-- DADOS (apenas em ambiente novo / sem dados)
-- -------------------------------------------
-- [ ] Inserir via service_role um client e um salon_client → sucesso
-- [ ] Inserir appointment referenciando clients(id) → sucesso
-- [ ] Inserir review referenciando clients(id) → sucesso
-- [ ] Inserir notification com client_id NULL → sucesso (fluxo do dono, sem FK violation)
-- [ ] Inserir notification com client_id referenciando clients(id) → sucesso
--
-- INATIVAÇÃO DE CLIENTE POR SALÃO (Seção 9)
-- ------------------------------------------
-- [ ] (a) Via service_role: UPDATE salon_clients SET is_active = false
--         WHERE salon_id = '<salao_A>' AND client_id = '<cliente_X>';
--         Em seguida: INSERT INTO appointments (..., salon_id = '<salao_A>', client_id = '<cliente_X>', ...)
--         → Deve falhar com policy violation (cliente inativo bloqueado no INSERT)
--
-- [ ] (b) Via service_role: UPDATE salon_clients SET is_active = true
--         WHERE salon_id = '<salao_A>' AND client_id = '<cliente_X>';
--         Em seguida: INSERT INTO appointments (..., salon_id = '<salao_A>', client_id = '<cliente_X>', ...)
--         → Deve ter sucesso (cliente ativo pode agendar)
--
-- [ ] (c) Cliente sem vínculo em salon_clients (nunca agendou no salão):
--         INSERT INTO appointments (..., salon_id = '<salao_B>', client_id = '<cliente_novo>', ...)
--         → Deve ter sucesso (ausência de vínculo = não bloqueado)
--
-- [ ] (d) Isolamento multi-salão:
--         UPDATE salon_clients SET is_active = false
--         WHERE salon_id = '<salao_A>' AND client_id = '<cliente_X>';
--         Em seguida: INSERT INTO appointments (..., salon_id = '<salao_B>', client_id = '<cliente_X>', ...)
--         → Deve ter sucesso (inativação no salão A não afeta o salão B)
--
-- [ ] Confirmar função SECURITY DEFINER existe:
--     SELECT routine_name, security_type FROM information_schema.routines
--     WHERE routine_schema = 'public' AND routine_name = 'is_client_blocked_at_salon';
--     -- Deve retornar security_type = 'DEFINER'
--
-- [ ] Histórico intacto após inativação:
--     SELECT COUNT(*) FROM appointments
--     WHERE salon_id = '<salao_A>' AND client_id = '<cliente_X>';
--     → Deve retornar o total de agendamentos anteriores (inativação não apaga histórico)
--
-- =============================================================================


-- =============================================================================
-- SEÇÃO 10 (INCREMENTAL): Correção de policies de cliente para modelo
-- de sessão leve — migração para acesso 100% via service_role
--
-- MUDANÇA DE PREMISSA ARQUITETURAL (decisão aprovada em 2026-08-01):
--
--   A NOTA ARQUITETURAL da Seção 9.3 estava FACTUALMENTE INCORRETA ao afirmar
--   que "o cliente possui sessão Supabase Auth real". O modelo real do App Salão
--   usa SESSÃO LEVE no cliente: não há sessão Supabase Auth, portanto
--   auth.uid() é SEMPRE NULL no contexto de requisições do cliente.
--
--   Consequências diretas:
--     - Toda policy que usa auth.uid() = client_id no contexto do cliente FALHA
--       silenciosamente (auth.uid() IS NULL → condição nunca satisfeita → acesso
--       negado para todas as operações do cliente).
--     - A policy INSERT da Seção 9.3 também estava quebrada pelo mesmo motivo.
--
--   DECISÃO APROVADA: toda operação de cliente (leitura E escrita em appointments,
--   reviews e notifications) passa a ser roteada por Vercel Function server-side
--   usando a service_role key. O service_role bypassa RLS automaticamente — ele
--   não depende de nenhuma policy permissiva criada aqui. Portanto:
--
--     → As policies de cliente baseadas em auth.uid() são REMOVIDAS.
--     → Nenhuma policy permissiva substituta é criada para anon/authenticated.
--     → Apenas as policies do DONO (baseadas em salons.owner_id = auth.uid())
--       continuam existindo — o dono tem sessão Auth real.
--     → "Reviews are publicly viewable" (SELECT USING(true)) é mantida intacta
--       — clientes precisam ler avaliações de salões na landing page pública.
--
--   IMPACTO EM BookingEngine.jsx:
--     O componente BookingEngine faz SELECT em appointments filtrando por
--     status='scheduled' para calcular slots disponíveis (linhas 79-97).
--     Essa leitura era feita com anon key (sem sessão). Com a remoção da
--     policy "Clients can view their own appointments", essa query anon
--     passará a retornar 0 linhas via RLS — o que quebraria o cálculo de slots.
--     A leitura de appointments para cálculo de disponibilidade DEVE ser
--     migrada para uma Vercel Function usando service_role (mesmo padrão de
--     app/api/client-identity.js). Enquanto a migração não ocorre, o
--     BookingEngine exibirá todos os slots como disponíveis (comportamento
--     degradado, não crash). Registrado como item de backlog obrigatório.
--
--   POLICIES DO DONO: não tocadas nesta seção. As policies
--     "Owners can view their salon appointments",
--     "Owners can update their salon appointments",
--     "Owners can reply to their salon reviews",
--     "Owners can view their salon notifications"
--   permanecem exatamente como definidas em rls_fix.sql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 10.1: appointments — remoção das policies de cliente quebradas
--
-- Removidas:
--   "Clients can view their own appointments"  — SELECT com auth.uid() = client_id
--   "Clients can insert their own appointments" — INSERT (rls_fix.sql)
--   "Clients can update their own appointments" — UPDATE com auth.uid() = client_id
--
-- Nenhuma policy substituta criada para anon/authenticated: INSERT, SELECT e
-- UPDATE de appointments pelo cliente passam a ser operações exclusivas da
-- Vercel Function via service_role, que bypassa RLS.
--
-- Leitura de disponibilidade (BookingEngine): veja nota de impacto no cabeçalho
-- desta seção — requer migração para Function. Registrado como backlog.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Clients can view their own appointments"   ON public.appointments;
DROP POLICY IF EXISTS "Clients can insert their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Clients can update their own appointments" ON public.appointments;


-- -----------------------------------------------------------------------------
-- 10.2: reviews — remoção da policy de INSERT de cliente quebrada
--
-- Removida:
--   "Clients can insert their own reviews" — INSERT com auth.uid() = client_id
--
-- Mantida intacta:
--   "Reviews are publicly viewable" — SELECT USING(true) — correta e necessária.
--   "Owners can reply to their salon reviews" — UPDATE do dono — não tocada.
--
-- INSERT de review pelo cliente passa a ser operação exclusiva da Vercel Function
-- via service_role.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Clients can insert their own reviews" ON public.reviews;


-- -----------------------------------------------------------------------------
-- 10.3: notifications — remoção das policies de cliente quebradas
--
-- Removidas:
--   "Clients can view their own notifications"     — SELECT com auth.uid() = client_id
--   "Clients can mark their notifications as read" — UPDATE com auth.uid() = client_id
--   "Authenticated users can insert notifications" — INSERT dependia de auth.uid() IS NOT NULL
--
-- A policy "Authenticated users can insert notifications" cobria o fluxo onde
-- o cliente (autenticado) notificava o dono ao fazer um agendamento. Com a
-- migração para sessão leve esse fluxo não funciona mais via anon key. A
-- criação de notificações pelo sistema (agendamento, cancelamento, confirmação)
-- passa integralmente para Vercel Functions via service_role.
--
-- Mantida intacta:
--   "Owners can view their salon notifications" — SELECT do dono — não tocada.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Clients can view their own notifications"     ON public.notifications;
DROP POLICY IF EXISTS "Clients can mark their notifications as read" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;


-- -----------------------------------------------------------------------------
-- 10.4: GRANT da função is_client_blocked_at_salon — revisão
--
-- A função is_client_blocked_at_salon foi criada na Seção 9.2 com GRANT EXECUTE
-- para anon e authenticated, pois era chamada pela policy INSERT da Seção 9.3.
-- Com a remoção dessa policy (item 10.1), a função não é mais chamada via RLS.
--
-- Os GRANTs são mantidos (não revogados) para não quebrar eventuais chamadas
-- diretas de diagnóstico via Supabase Dashboard. A função em si continua válida
-- caso o modelo de sessão seja revisado no futuro.
--
-- Nenhuma alteração necessária — este bloco é apenas documentação.
-- -----------------------------------------------------------------------------


-- =============================================================================
-- CHECKLIST SUPABASE (Seção 10)
-- Execute no SQL Editor do Supabase Dashboard após aplicar este arquivo.
-- =============================================================================
--
-- VERIFICAR REMOÇÃO DAS POLICIES DE CLIENTE
-- ------------------------------------------
-- [ ] Confirmar que as policies de cliente foram removidas de appointments:
--     SELECT policyname FROM pg_policies
--     WHERE tablename = 'appointments'
--       AND policyname IN (
--         'Clients can view their own appointments',
--         'Clients can insert their own appointments',
--         'Clients can update their own appointments'
--       );
--     → Deve retornar 0 linhas.
--
-- [ ] Confirmar que a policy de INSERT de reviews foi removida:
--     SELECT policyname FROM pg_policies
--     WHERE tablename = 'reviews'
--       AND policyname = 'Clients can insert their own reviews';
--     → Deve retornar 0 linhas.
--
-- [ ] Confirmar que as policies de cliente em notifications foram removidas:
--     SELECT policyname FROM pg_policies
--     WHERE tablename = 'notifications'
--       AND policyname IN (
--         'Clients can view their own notifications',
--         'Clients can mark their notifications as read',
--         'Authenticated users can insert notifications'
--       );
--     → Deve retornar 0 linhas.
--
-- VERIFICAR POLICIES DO DONO INTACTAS
-- ------------------------------------
-- [ ] Confirmar que as policies do dono em appointments continuam existindo:
--     SELECT policyname FROM pg_policies
--     WHERE tablename = 'appointments'
--       AND policyname IN (
--         'Owners can view their salon appointments',
--         'Owners can update their salon appointments'
--       );
--     → Deve retornar 2 linhas.
--
-- [ ] Confirmar que "Reviews are publicly viewable" continua existindo:
--     SELECT policyname FROM pg_policies
--     WHERE tablename = 'reviews'
--       AND policyname = 'Reviews are publicly viewable';
--     → Deve retornar 1 linha.
--
-- [ ] Confirmar que "Owners can view their salon notifications" continua existindo:
--     SELECT policyname FROM pg_policies
--     WHERE tablename = 'notifications'
--       AND policyname = 'Owners can view their salon notifications';
--     → Deve retornar 1 linha.
--
-- VERIFICAR COMPORTAMENTO ESPERADO PÓS-REMOÇÃO
-- ----------------------------------------------
-- [ ] Sem sessão Auth (anon): SELECT appointments → 0 linhas
--     (apenas dono via Auth e service_role leem appointments)
-- [ ] Sem sessão Auth (anon): INSERT appointments → erro de policy violation
-- [ ] Sem sessão Auth (anon): UPDATE appointments → erro de policy violation
-- [ ] Sem sessão Auth (anon): INSERT reviews → erro de policy violation
-- [ ] Sem sessão Auth (anon): SELECT reviews → retorna linhas
--     ("Reviews are publicly viewable" com USING(true) continua ativa — correto)
-- [ ] Sem sessão Auth (anon): INSERT notifications → erro de policy violation
-- [ ] Sem sessão Auth (anon): UPDATE notifications → erro de policy violation
--
-- [ ] Via service_role (Vercel Function): INSERT appointments → sucesso (bypassa RLS)
-- [ ] Via service_role (Vercel Function): SELECT appointments → retorna linhas (bypassa RLS)
-- [ ] Via service_role (Vercel Function): INSERT reviews → sucesso (bypassa RLS)
-- [ ] Via service_role (Vercel Function): INSERT notifications → sucesso (bypassa RLS)
-- [ ] Via service_role (Vercel Function): UPDATE notifications SET is_read = true → sucesso
--
-- BACKLOG OBRIGATÓRIO — MIGRAÇÃO DO BookingEngine
-- ------------------------------------------------
-- [ ] Migrar a leitura de appointments em BookingEngine.jsx (linhas 79-97) para
--     uma Vercel Function usando service_role. Enquanto não migrado, o componente
--     receberá array vazio e exibirá todos os slots como disponíveis (degradado).
--     Prioridade: ALTA — afeta diretamente a prevenção de double-booking.
--
-- =============================================================================
