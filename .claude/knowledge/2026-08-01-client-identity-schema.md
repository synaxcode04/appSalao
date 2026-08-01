# Client Identity Schema — Opção A

**Agent:** rls-security
**Tipo:** decisao/feature
**Data:** 2026-08-01

## Modelagem aprovada: Opção A — cliente fora de auth.users

Cliente NÃO entra em `auth.users`. Tabela própria `public.clients` com `phone TEXT UNIQUE` como chave de identidade global. Um cliente com o mesmo telefone é reconhecido em qualquer salão da plataforma.

## Tabelas criadas

- `public.clients`: id, phone (UNIQUE, apenas dígitos — normalização é responsabilidade da Vercel Function), full_name, created_at.
- `public.salon_clients`: vínculo N:N entre clients e salons. UNIQUE(salon_id, client_id). FK com ON DELETE CASCADE para ambos.

## Decisão de acesso: exclusivamente via service_role

As tabelas `clients` e `salon_clients` são acessadas SOMENTE pela Vercel Function server-side usando a `service_role` key. O `service_role` bypassa RLS no Supabase por padrão. As policies RLS existem para bloquear acesso direto via `anon key` ou `authenticated` do frontend — não para habilitar acesso.

Policies criadas:
- `clients`: SELECT para authenticated (dono) via JOIN `salon_clients → salons WHERE owner_id = auth.uid()`. Sem policy de escrita para authenticated.
- `salon_clients`: SELECT para authenticated (dono) via JOIN `salons WHERE owner_id = auth.uid()`. Sem policy de escrita para authenticated.
- `anon`: nenhuma policy → acesso completamente bloqueado pelo RLS habilitado.

## Migração de FKs

`appointments.client_id`, `reviews.client_id`, `notifications.client_id` migradas de `profiles(id)` para `clients(id)`. Feita de forma defensiva: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.

Nomes das constraints: `appointments_client_id_fkey`, `reviews_client_id_fkey`, `notifications_client_id_fkey` (nomes padrão do Postgres para FK inline).

`notifications.client_id` permanece NULLABLE (fluxo de notificações para o dono sem client_id explícito).

## Risco de migração identificado

Em banco com dados existentes, o ADD CONSTRAINT de FK vai falhar se houver UUIDs em appointments/reviews/notifications que não existem em clients. Diagnóstico e plano de migração de dados devem ser feitos antes de rodar client_identity.sql em produção. Em ambiente novo (sem dados) não há risco.

## Arquivo gerado

`Documentos/client_identity.sql` — idempotente, deve ser executado após schema.sql e rls_fix.sql.
