-- =============================================================================
-- payment_leads.sql — Migration para tabela de leads de pagamento Mercado Pago
-- =============================================================================
--
-- PROPÓSITO:
--   Armazena cada notificação recebida pelo webhook do Mercado Pago
--   (app/api/mercado-pago-webhook.js) para que o admin revise e libere
--   a licença manualmente no painel /admin.
--
-- POR QUE TABELA SEPARADA DE `payments`:
--   A tabela `payments` tem salon_id NOT NULL e funciona como extrato de
--   licenças de salões já cadastrados — é gravada pelo AdminDashboard.
--   Um lead de pagamento chega ANTES do salão existir no sistema; ainda não
--   há salon_id para associar. Misturar os dois conceitos quebraria a
--   constraint NOT NULL e poluiria o extrato financeiro com dados brutos do
--   gateway.
--
-- QUEM GRAVA:
--   Exclusivamente o webhook (app/api/mercado-pago-webhook.js) usando a
--   SERVICE ROLE KEY do Supabase. O service role bypassa RLS por design —
--   portanto NÃO existe policy de INSERT para anon/authenticated nesta tabela.
--   Criar um INSERT público aqui permitiria que qualquer pessoa com a anon key
--   forjasse leads, corrompendo o painel do admin.
--
-- APLICAÇÃO:
--   Execute este SQL manualmente no Supabase SQL Editor (Dashboard → SQL Editor).
--   NÃO aplicar via código — seguir o mesmo fluxo de rls_fix.sql.
--   Este arquivo é idempotente: pode ser re-executado sem efeitos colaterais.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Criação da tabela
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_leads (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  mp_payment_id    TEXT,                         -- id do pagamento no Mercado Pago
  status           TEXT,                         -- approved | pending | rejected | ...
  external_reference TEXT,                       -- referência enviada ao criar preferência
  plano            TEXT,                         -- plano escolhido pelo prospecto
  salon_name       TEXT,                         -- nome do salão informado no checkout
  contact_email    TEXT,                         -- e-mail de contato do prospecto
  amount           DECIMAL(10,2),                -- valor pago
  created_at       TIMESTAMPTZ   DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2. Habilitar RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.payment_leads ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Policies RLS
--
-- INSERT/UPDATE/DELETE: sem policy pública.
--   - O webhook usa SERVICE ROLE KEY → bypassa RLS automaticamente.
--   - Não criar policy de INSERT para anon/authenticated evita que leads
--     sejam forjados via anon key.
--
-- SELECT: apenas admin pode ler, para exibir no painel /admin.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admin can read payment leads" ON public.payment_leads;

CREATE POLICY "Admin can read payment leads"
ON public.payment_leads
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- =============================================================================
-- FIM — aplique manualmente no Supabase SQL Editor.
-- =============================================================================
