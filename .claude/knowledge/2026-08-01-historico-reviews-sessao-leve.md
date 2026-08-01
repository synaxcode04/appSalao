---
date: 2026-08-01
agent: booking-engine
type: bug
title: Correção pós-migração — histórico e reviews com sessão leve do cliente
---

## Contexto

A Fase 3 da "sessão leve do cliente" (Opção 4) introduziu `useClientSession` e migrou
`appointments.client_id` / `reviews.client_id` de `profiles(id)` para `clients(id)`.
Três pontos do fluxo client não foram atualizados na migração inicial.

## Bugs corrigidos

### [1] ClientHistory.jsx — histórico sempre vazio para cliente leve

- **Causa:** `supabase.auth.getUser()` retorna `null` para cliente leve (sem sessão Auth).
  O filtro `.eq('client_id', user.id)` nunca executava.
- **Correção:** Importado `useClientSession`; substituído `user.id` por
  `clientSession?.client_id`. Adicionada guarda `if (clientId)`.
- **Linhas alteradas:** 1 (import), 10 (hook), 17-37 (fetchHistory).

### [3] SalonDetails.jsx — cliente leve redirecionado para /login ao avaliar

- **Causa:** `handleSubmitReview` verificava `if (!profile)` antes de checar
  `clientSession`. Cliente leve (sem `profile`) era expulso.
- **Correção:** Removido o gate `if (!profile)`. Novo gate único:
  `if (!clientSession?.client_id)` com toast de sessão expirada.
- **Linhas alteradas:** 112-126 (handleSubmitReview).

### [4] SalonDetails.jsx — nome "Cliente Oculto" em todas as reviews

- **Causa:** Query usava `profiles(full_name)` mas FK `reviews.client_id` aponta
  para `clients(id)` após a migração — join retornava null.
- **Correção:** Trocado embed para `clients(full_name)`; renderização atualizada de
  `review.profiles?.full_name` para `review.clients?.full_name`.
- **Linhas alteradas:** 69 (select), 300 (render).

## Resultado dos testes

`npm run test:run` — 25 testes, 5 suítes, exit 0.
