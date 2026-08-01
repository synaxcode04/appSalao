-- =============================================================================
-- AVISO DE SEGURANÇA — LEIA ANTES DE EXECUTAR EM QUALQUER AMBIENTE
-- =============================================================================
--
-- Este arquivo cria a estrutura base do banco de dados do App Salão.
--
-- ATENÇÃO: AS POLICIES RLS CRIADAS AQUI SÃO INTENCIONALMENTE PERMISSIVAS
-- (contêm USING(true) e WITH CHECK(true) em tabelas de salão) e servem apenas
-- como ponto de partida estrutural.
--
-- OBRIGATÓRIO: O arquivo Documentos/rls_fix.sql DEVE ser executado IMEDIATAMENTE
-- APÓS este schema em qualquer ambiente novo (desenvolvimento, staging, produção).
-- O rls_fix.sql substitui todas as policies permissivas por policies seguras que
-- garantem isolamento multi-tenant real (cada dono acessa apenas seus próprios
-- dados, verificado via JOIN com salons.owner_id = auth.uid()).
--
-- NUNCA opere um ambiente com apenas schema.sql aplicado — isso permite que
-- qualquer usuário autenticado grave dados em salões de terceiros.
--
-- Ordem de execução obrigatória:
--   1. schema.sql   (este arquivo — estrutura + policies base permissivas)
--   2. rls_fix.sql  (correção das policies + colunas adicionais em salons)
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
-- Todas as três colunas são adicionadas de forma idempotente via rls_fix.sql
-- (ADD COLUMN IF NOT EXISTS). Não duplicar aqui para manter idempotência.
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

CREATE POLICY "Services are viewable by everyone." ON public.services FOR SELECT USING (true);
CREATE POLICY "Anyone authenticated can insert services" ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update services" ON public.services FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Working hours are viewable by everyone." ON public.working_hours FOR SELECT USING (true);
CREATE POLICY "Anyone authenticated can insert working hours" ON public.working_hours FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update working hours" ON public.working_hours FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Professionals are viewable by everyone." ON public.professionals FOR SELECT USING (true);
CREATE POLICY "Anyone authenticated can insert professionals" ON public.professionals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update professionals" ON public.professionals FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Appointments are viewable by everyone." ON public.appointments FOR SELECT USING (true);
CREATE POLICY "Anyone authenticated can insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone authenticated can update appointments" ON public.appointments FOR UPDATE TO authenticated USING (true);

-- Políticas para Reviews
CREATE POLICY "Avaliações são públicas para leitura" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Clientes podem criar avaliações" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Proprietários podem responder avaliações" ON public.reviews FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.salons
        WHERE salons.id = reviews.salon_id
        AND salons.owner_id = auth.uid()
    )
);

-- Nota: as policies de notifications são definidas em rls_fix.sql (idempotentes).
-- Não criar policies de notifications aqui para evitar conflito com os DROPs do rls_fix.sql.

-- Nota: as policies de payments são definidas em rls_fix.sql (idempotentes).
-- Não criar policies de payments aqui para evitar conflito com os DROPs do rls_fix.sql.
