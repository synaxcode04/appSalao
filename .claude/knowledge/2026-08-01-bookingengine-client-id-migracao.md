**Agent:** booking-engine
**Tipo:** bug/feature
**Data:** 2026-08-01

## Contexto

Migração de FK: `appointments.client_id` passou a referenciar `clients(id)` em vez de `profiles(id)` (via `client_identity.sql`). Tarefa: verificar e corrigir o `BookingEngine.jsx` para consistência com o novo modelo.

## O que foi verificado

1. **Lógica de cálculo de slots** — inalterada e correta: filtro de almoço, sobreposição, status 'scheduled' único bloqueador, duração do serviço como step. Todos os 7 testes do BookingEngine continuam verdes.

2. **`appointments.client_id` no INSERT** — BookingEngine usa o prop `clientId` diretamente no INSERT (`client_id: clientId`). O componente não define o valor, apenas o repassa. A correção do valor passado depende dos callers (ver dependência aberta abaixo).

3. **Lookup de nome para notificações (2 ocorrências)** — BookingEngine consultava `profiles` usando `clientId`:
   ```js
   supabase.from('profiles').select('full_name').eq('id', clientId)
   ```
   Com a migração, `clientId` agora é um UUID de `clients(id)`, não de `profiles(id)`. A query retornaria sempre vazia (nome "Cliente" hardcoded no fallback). **Corrigido** para:
   ```js
   supabase.from('clients').select('full_name').eq('id', clientId)
   ```
   Ambas as ocorrências corrigidas: bloco de reagendamento (linha ~163) e bloco de novo agendamento (linha ~202).

## Dependência aberta (reporte ao orchestrator / auth-guard)

Os callers `SalonDetails.jsx` e `ClientAppointments.jsx` passam `clientId={profile.id}` onde `profile` vem de `profiles` (i.e., `auth.uid()`). Isso significa que o INSERT em `appointments.client_id` ainda usa um UUID de `profiles`, não de `clients` — FK inválida após a migração.

A correção exige que os callers:
1. Obtenham o `clients.id` via a Vercel Function `client-identity.js` (action `create_or_get` ou `lookup`) usando o telefone do usuário autenticado.
2. Passem esse `clients.id` como `clientId` para o BookingEngine.

Isso depende do modelo de auth do cliente ainda em aberto (o agent auth-guard está tratando). **Não implementado aqui** para não forçar decisão arquitetural não tomada.

## Resultado dos testes

`npm run test:run` — **25 testes passando, 0 falhas** (5 arquivos: BookingEngine 7, ProtectedRoute 5, SuspendedScreen 2, notification 9, smoke 2).
