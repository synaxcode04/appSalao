-- =============================================================================
-- NOTA SOBRE AS POLICIES RLS NESTE ARQUIVO
-- =============================================================================
--
-- Este arquivo define a estrutura base do banco de dados do App Salão.
--
-- As policies RLS aqui presentes já refletem o estado CONSOLIDADO e CORRIGIDO
-- (reconciliado com rls_fix.sql em 2026-08-01). Não há mais policies permissivas
-- de escrita com WITH CHECK (true) ou USING (true) nas tabelas de salão.
--
-- O arquivo Documentos/rls_fix.sql continua sendo a migration IDEMPOTENTE
-- que deve ser executada em bancos existentes (pré-consolidação). Em bancos
-- criados a partir desta versão do schema.sql, o rls_fix.sql ainda pode ser
-- executado sem problemas (DROP POLICY IF EXISTS garante idempotência), mas
-- não é mais obrigatório para garantir segurança — as policies corretas já
-- estão aqui.
--
-- Ordem de execução recomendada para ambiente novo:
--   1. schema.sql   (este arquivo — estrutura + policies já seguras)
--   2. rls_fix.sql  (adiciona colunas is_active/status/subscription_expires_at
--                    em salons e cria tabelas notifications/payments se não existem)
--   3. add_slot_interval_minutes.sql  (adiciona slot_interval_minutes em salons)
--
-- =============================================================================


-- 1. Tabela profiles (Extensão da tabela auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  -- 'admin' é o super-admin da plataforma (Israel) — acessa o painel /admin e gerencia licenças.
  role TEXT CHECK (role IN ('owner', 'client', 'admin')) NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  gender TEXT DEFAULT 'todos',
  search_radius INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela salons (Salões de beleza)
--
-- Controle de licença — fonte de verdade:
--   status TEXT DEFAULT 'active'  →  valores esperados: 'active' | 'expired'
--   subscription_expires_at TIMESTAMPTZ  →  data/hora de expiração da assinatura
--
-- Essas duas colunas são gravadas pelo AdminDashboard e lidas por OwnerLayout e
-- SalonLayout para decidir se o acesso ao painel deve ser bloqueado.
--
-- A coluna is_active (BOOLEAN DEFAULT true NOT NULL) também existe na tabela
-- (adicionada via rls_fix.sql) mas NÃO é a fonte de verdade do bloqueio de licença.
-- Mantê-la é seguro; não usá-la como critério de suspensão de licença.
--
-- Todas essas colunas extras são adicionadas de forma idempotente via migrations
-- separadas (ADD COLUMN IF NOT EXISTS). Não duplicar aqui para manter idempotência.
CREATE TABLE public.salons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  address TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  target_gender TEXT DEFAULT 'Unisex',
  document TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
  -- Colunas adicionadas via rls_fix.sql (ADD COLUMN IF NOT EXISTS):
  --   is_active BOOLEAN DEFAULT true NOT NULL
  --   status TEXT DEFAULT 'active'
  --   subscription_expires_at TIMESTAMPTZ
  -- Colunas adicionadas via add_slot_interval_minutes.sql (ADD COLUMN IF NOT EXISTS):
  --   slot_interval_minutes INTEGER DEFAULT NULL
  --     NULL = usar duração do serviço (fallback); quando preenchido, múltiplo de 15,
  --     mínimo 15, máximo 120. CHECK constraint: salons_slot_interval_minutes_check.
);

-- 3. Tabela services (Serviços oferecidos pelos salões)
CREATE TABLE public.services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela working_hours (Horário de funcionamento do salão)
CREATE TABLE public.working_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6) NOT NULL, -- 0 = Domingo, 6 = Sábado
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start_time TIME NULL,
  break_end_time TIME NULL,
  UNIQUE(salon_id, day_of_week)
);

-- 5. Tabela professionals (Profissionais do salão)
CREATE TABLE public.professionals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabela appointments (Agendamentos)
CREATE TABLE public.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT CHECK (status IN ('scheduled', 'canceled', 'completed')) DEFAULT 'scheduled' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Tabela reviews (Avaliações dos clientes)
CREATE TABLE public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5) NOT NULL,
  comment TEXT,
  owner_reply TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Tabela notifications (Notificações in-app)
--
-- MODELO DE DESTINATÁRIO — NUANCE IMPORTANTE:
--
-- Esta tabela serve dois fluxos distintos que coexistem com client_id NULLABLE:
--
-- Fluxo A — Notificações para o DONO do salão (geradas pelo cliente ao agendar/cancelar):
--   Inseridas em BookingEngine.jsx e ClientAppointments.jsx com apenas {salon_id, title, message}.
--   client_id NÃO é preenchido nessas inserções → client_id ficará NULL.
--   O dono lê suas notificações filtrando por salon_id (via RLS owner policy).
--
-- Fluxo B — Leitura pelo CLIENTE em ClientAppointments.jsx:
--   A query filtra por client_id = profile.id AND salon_id = salon.id.
--   Porém, o código atual nunca insere client_id nas notificações, o que significa que
--   essa query sempre retorna 0 linhas para o cliente. Isso é uma inconsistência
--   pré-existente no código da aplicação que deve ser corrigida no frontend futuramente,
--   mas NÃO é redesenhada aqui. O schema modela client_id como NULLABLE para suportar
--   o uso atual (Fluxo A) sem quebrar a query do Fluxo B.
--
-- DECISÃO EM ABERTO: quando o frontend for corrigido para distinguir notificações de
-- dono vs. cliente, considerar separar em duas tabelas ou adicionar coluna `recipient_type`.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  -- client_id é NULLABLE: notificações para o dono (Fluxo A) não têm client_id.
  -- Notificações destinadas a um cliente específico (Fluxo B, futuro) preenchem este campo.
  client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- 9. Tabela payments (Extrato de pagamentos de licença — gerenciado pelo admin)
--
-- Colunas inferidas do uso real em AdminDashboard.jsx:
--   INSERT grava: salon_id, amount, description
--   SELECT lê: id, salon_id, amount, description, payment_date (ordenado por payment_date DESC)
--   payment_date não é fornecido no INSERT — defaults para now() automaticamente.
--
-- AVISO: profiles.role tem CHECK IN ('owner', 'client', 'admin') — o valor 'admin' está
-- incluído na constraint (corrigido em schema.sql linha 31 e via migration em rls_fix.sql).
-- As policies RLS de payments em rls_fix.sql usam role = 'admin' com base no uso
-- real do código (AdminDashboard). Veja Seção 1b de rls_fix.sql.
--
-- Esta tabela é criada de forma idempotente (CREATE TABLE IF NOT EXISTS).
-- As policies RLS desta tabela são definidas em rls_fix.sql.
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  payment_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso básicas
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Salons are viewable by everyone." ON public.salons FOR SELECT USING (true);
CREATE POLICY "Owners can insert their salons." ON public.salons FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update their salons." ON public.salons FOR UPDATE USING (auth.uid() = owner_id);

-- services: SELECT público (cliente precisa ler serviços); escrita restrita ao dono do salão.
CREATE POLICY "Services are viewable by everyone." ON public.services FOR SELECT USING (true);

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

-- working_hours: SELECT público (motor de agendamento do cliente precisa ler horários); escrita restrita ao dono.
CREATE POLICY "Working hours are viewable by everyone." ON public.working_hours FOR SELECT USING (true);

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

-- professionals: SELECT público (cliente precisa ver lista de profissionais ao agendar); escrita restrita ao dono.
CREATE POLICY "Professionals are viewable by everyone." ON public.professionals FOR SELECT USING (true);

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

-- appointments: sem SELECT público.
--   SELECT cliente — vê apenas os próprios agendamentos (filtro por salão é responsabilidade da app).
--   SELECT dono — vê todos os agendamentos do seu salão.
--   INSERT — cliente cria para si mesmo (client_id = auth.uid()).
--   UPDATE — duas policies separadas: cliente atualiza os próprios; dono atualiza os do salão.
--   Nota: escrita do cliente em produção passa pela Vercel Function com service_role
--   (ver seguranca.md), portanto as policies INSERT/UPDATE do cliente aqui servem como
--   segunda barreira e para ambiente de desenvolvimento com Auth real.
CREATE POLICY "Clients can view their own appointments"
ON public.appointments FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

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

CREATE POLICY "Clients can insert their own appointments"
ON public.appointments FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

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

-- reviews: SELECT público; INSERT restrito ao próprio cliente; UPDATE restrito ao dono (para responder).
CREATE POLICY "Reviews are publicly viewable" ON public.reviews FOR SELECT USING (true);

CREATE POLICY "Clients can insert their own reviews"
ON public.reviews FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND client_id = auth.uid()
);

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

-- Nota: as policies de notifications e payments são definidas em rls_fix.sql (idempotentes).
-- Não criar policies dessas tabelas aqui para evitar conflito com os DROPs do rls_fix.sql.
