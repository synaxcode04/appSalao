**Agent:** booking-engine
**Tipo:** bug/feature
**Data:** 2026-08-01
**Fase:** 4 (callers migrados para sessão leve)

## Descrição

Correção dos callers `SalonDetails.jsx` e `ClientAppointments.jsx` para usar o `client_id` da sessão leve (tabela `clients`) em vez de `profile.id` (tabela `profiles`/`auth.users`). Resolve a FK inválida em `appointments.client_id` após a migração da Fase 1 (`client_identity.sql`).

## Callers corrigidos

### `app/src/pages/client/SalonDetails.jsx`

- Importa `useClientSession` de `../../contexts/ClientSessionContext`.
- Desestrutura `clientSession` no corpo do componente.
- `checkReviewEligibility`: filtro `.eq('client_id', clientSession.client_id)` — antes usava `profile.id`.
- INSERT em `reviews`: usa `client_id: clientSession.client_id` — antes usava `profile.id`. Guarda defensiva: retorna com `toast.error` se `clientSession?.client_id` for nulo.
- Prop `clientId` no `<BookingEngine>`: `clientSession?.client_id ?? null` — antes era `profile?.id`.
- Saudação personalizada: aceita `profile?.full_name || clientSession?.full_name` para exibir nome ao cliente leve (sem conta `auth.users`).

### `app/src/pages/client/ClientAppointments.jsx`

- Importa `useClientSession` de `../../contexts/ClientSessionContext`.
- Define `clientId = clientSession?.client_id ?? null` logo no topo do componente.
- `fetchAppointments`: guarda `if (!clientId) return` + filtro `.eq('client_id', clientId)`.
- `fetchNotifications`: guarda `if (!clientId) return` + filtro `.eq('client_id', clientId)`.
- Subscription Realtime: filtro `client_id=eq.${clientId}` e dependência `[clientId, salon?.id]`.
- `markAllAsRead`: filtro `.eq('client_id', clientId)`.
- `useEffect` de busca de agendamentos: condição `if (clientId)` e dependência `[clientId, showCanceled]`.
- Prop `clientId` no `<BookingEngine>` de reagendamento: `clientId` (variável local) — antes era `profile.id`.

## Resultado dos testes

`npm run test:run` — **25 testes passando, 0 falhas** (5 arquivos: BookingEngine 7, ProtectedRoute 5, SuspendedScreen 2, notification 9, smoke 2).
