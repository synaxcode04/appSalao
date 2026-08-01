# Client Identity Backfill Fix — ERROR 23503

**Agent:** rls-security
**Tipo:** bug
**Data:** 2026-08-01

## Erro

```
ERROR: 23503: insert or update on table "appointments" violates foreign key constraint "appointments_client_id_fkey"
DETAIL: Key (client_id)=(6b523e25-...) is not present in table "clients".
```

## Causa Raiz

A Seção 3 original de `client_identity.sql` trocava as FKs de `appointments.client_id`, `reviews.client_id` e `notifications.client_id` de `profiles(id)` para `clients(id)` SEM antes popular a tabela `clients` com os registros correspondentes. Em banco com dados reais, os UUIDs existentes em `appointments.client_id` referenciam `profiles`, mas não existem em `clients` (tabela recém-criada), causando violação de FK no `ADD CONSTRAINT`.

## Solução — Ordem Correta de Execução

O script foi reestruturado em 8 seções:

1. **Seção 1**: CREATE TABLE clients (sem alteração)
2. **Seção 2**: CREATE TABLE salon_clients (sem alteração)
3. **Seção 3 (nova)**: Backfill de `clients` a partir de `profiles WHERE role='client'`
4. **Seção 4 (nova)**: Backfill de `salon_clients` a partir de `appointments` e `reviews`
5. **Seção 5 (nova)**: Diagnóstico de órfãos remanescentes — interrompe execução com RAISE EXCEPTION se encontrar algum
6. **Seção 6** (era Seção 3): Troca de FKs — agora executada somente após backfill completo
7. **Seção 7** (era Seção 4): Policies RLS de clients
8. **Seção 8** (era Seção 5): Policies RLS de salon_clients

## Estratégia de Backfill: Preservação de UUID

`clients.id` recebe o mesmo UUID de `profiles.id`. Isso evita ter que atualizar os valores de `client_id` em `appointments`, `reviews` e `notifications` — os UUIDs existentes continuam válidos após a troca de FK.

## Tratamento de phone Nulo ou Duplicado

`clients.phone` é `NOT NULL UNIQUE`. Dois cenários problemáticos e a decisão tomada:

**Caso A — phone NULL ou vazio após normalização** (`regexp_replace(phone, '\D', '', 'g')`):
- Decisão: atribuir placeholder determinístico `'PENDING-' || id::text`
- Motivo: `appointments.client_id` é NOT NULL. Pular o INSERT em `clients` causaria o mesmo ERROR 23503 na troca de FK. O placeholder garante integridade referencial; o telefone real deve ser regularizado manualmente.

**Caso B — phone normalizado já existe em clients (duplicata entre profiles)**:
- Decisão: atribuir placeholder `'PENDING-' || id::text` para o registro subsequente
- O primeiro profile processado (ORDER BY created_at, id) fica com o número real.
- Motivo idêntico ao Caso A — não é possível pular sem quebrar a FK.

**Trade-off**: Placeholder cria dados provisórios em `clients` mas garante que o script rode sem erro. A alternativa (pular o INSERT) manteria os dados limpos mas causaria ERROR 23503 — inaceitável em migração de produção.

## Diagnóstico Manual Pós-Execução

Identificar clientes com placeholder para regularização:
```sql
SELECT id, phone, full_name FROM public.clients WHERE phone LIKE 'PENDING-%';
```

## Idempotência

Todo o script continua idempotente:
- `INSERT INTO clients ... ON CONFLICT (id) DO NOTHING`
- `INSERT INTO salon_clients ... ON CONFLICT (salon_id, client_id) DO NOTHING`
- Bloco DO $$ só processa profiles que ainda não existem em clients
- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT nas FKs
- DROP POLICY IF EXISTS + CREATE POLICY nas policies RLS

## Arquivo Corrigido

`Documentos/client_identity.sql`
