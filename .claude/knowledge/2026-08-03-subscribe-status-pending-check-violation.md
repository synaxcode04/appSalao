# Bug — "Erro ao criar assinatura" ao assinar plano (status 'pending' viola CHECK)

**Agent:** rls-security + session (orchestrator)
**Tipo:** bug
**Data:** 2026-08-03

## Sintoma
Na tela `/s/:slug/planos` do cliente, ao clicar em "Pagar direto com o salão", aparecia o toast "Erro ao criar assinatura". O modal só mostrava a opção external (salão sem token Mercado Pago conectado).

## Causa raiz
A action `subscribe` (`app/api/appointments.js`) e o fluxo Mercado Pago (`app/api/criar-preferencia-plano.js`) inserem registros em `client_subscriptions` com `status='pending'`. A constraint `client_subscriptions_status_check`, criada em `Documentos/subscription_plans.sql` (linhas 293-294), só permitia `status IN ('active','canceled')`.

Resultado: violação de CHECK (Postgres `23514`). O handler de erro do INSERT em `appointments.js` só tratava `23505` (unique) e `23503` (FK), caindo no 500 genérico "Erro ao criar assinatura" — mascarando o erro real. A migration de hoje `mp_marketplace.sql` introduziu o estado `'pending'` mas esqueceu de atualizar essa constraint.

## Por que a feature funcionava antes
O path legado, sem `payment_method`, inseria `status='active'`, que respeita o CHECK. A quebra veio com a introdução do estado `pending` pela integração Mercado Pago.

## Solução aplicada
1. Bloco idempotente adicionado em `Documentos/mp_marketplace.sql` que recria `client_subscriptions_status_check` incluindo `'pending'` (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT CHECK (status IN ('active','canceled','pending'))`).
2. Tratamento defensivo do código `23514` em `appointments.js`, retornando HTTP 400 "Status de assinatura inválido" antes do fallback 500, para que futuras violações de CHECK não virem 500 genérico.

## Reaplicação
Requer reaplicação manual da migration `mp_marketplace.sql` no Supabase Dashboard antes do deploy (a migration é idempotente).

## Lição
Ao introduzir um novo valor de enum/status em coluna com CHECK constraint via migration incremental, sempre atualizar o CHECK correspondente. E tratar `23514` explicitamente para não mascarar violações de constraint como erro 500 genérico.
