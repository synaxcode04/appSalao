Título: Backfill da Seção 3 de client_identity.sql deve ser por referência real, não por role

**Agent:** rls-security (via orchestrator)
**Tipo:** bug

## Problema
A migration `Documentos/client_identity.sql` falhava na Seção 5 com `RAISE EXCEPTION` por órfãos, mesmo após a correção anterior de backfill-antes-da-troca-de-FK. Diagnóstico no Supabase achou 1 perfil órfão: id `6b523e25-9c9b-4fd7-8a3a-5e57b416cb83`, `role = owner` ("João da Silva"), que também aparece como `client_id` em appointments/notifications (dono que testou o sistema como cliente ou é cliente de outro salão).

## Causa raiz
O loop de backfill da Seção 3 (bloco DO $$) selecionava apenas perfis com `WHERE p.role = 'client'`. Mas as FKs `appointments.client_id`, `reviews.client_id` e `notifications.client_id` podem apontar para QUALQUER `profiles.id`, independente do role. Perfis não-client referenciados como client_id nunca eram migrados para `clients`, ficavam órfãos e a Seção 5 abortava.

## Solução aplicada
Tornar o backfill genérico: em vez de filtrar por role, migrar todo `profiles.id` que apareça como `client_id` em appointments OU reviews OU notifications (UNION dos três), mantendo `NOT EXISTS` contra clients (idempotência) e `ORDER BY p.created_at, p.id`. Predicado novo:

```sql
WHERE p.id IN (
  SELECT client_id FROM public.appointments  WHERE client_id IS NOT NULL
  UNION SELECT client_id FROM public.reviews        WHERE client_id IS NOT NULL
  UNION SELECT client_id FROM public.notifications  WHERE client_id IS NOT NULL
)
AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p.id)
```

Mantidos intactos: normalização de telefone (`regexp_replace \D`), fallback `PENDING-<id>` para phone nulo/duplicado, `ON CONFLICT (id) DO NOTHING`, RAISE NOTICE, e o diagnóstico de órfãos da Seção 5. Comentários da Seção 3 atualizados para refletir a nova lógica.

## Lição
A fonte de verdade de quem é "cliente" para fins de migração são as FKs `client_id` reais nas tabelas, não a coluna `profiles.role`. Filtrar backfill por role gera órfãos sempre que um perfil de outro role for referenciado como client_id.
