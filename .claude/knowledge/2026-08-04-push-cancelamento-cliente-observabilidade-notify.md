# Push de cancelamento do dono não chegava ao cliente — lacuna de observabilidade em notify.js

**Agent:** notifier + devops (via orchestrator)
**Tipo:** bug / diagnostico
**Data:** 2026-08-04

## Problema
Dono cancela agendamento no painel → dono recebe push, mas o CLIENTE (com push autorizado no celular) NÃO recebe o push de cancelamento (evento `owner_canceled`). Diferente do bug in-app/sininho de 2026-08-03 (esse era a tabela `notifications` + polling); este é PUSH real via OneSignal.

## Investigação (o que NÃO era a causa)
- `app/api/notify.js` EVENT_MAP já correto: `owner_canceled: { recipientRole: 'client' }`.
- `DashboardHome.jsx` handleCancel já chama `/api/notify` com event `owner_canceled` e `targetExternalId = appt.client_id` (existia antes, confirmado no git).
- `ClientSessionContext.jsx` já faz `OneSignal.login(client_id)` (fix de 2026-08-03, commit 99711c3) — external_id do cliente = client_id.
- Logs Vercel de produção: 48 chamadas a `/api/notify`, todas HTTP 200.

## Causa raiz (provável, a confirmar por log)
`notify.js` retornava HTTP 200 mesmo quando o OneSignal responde com `recipients: 0` / `errors.invalid_aliases` — ou seja, push "enviado para ninguém". Isso mascarava o fato de o external_id do cliente provavelmente NÃO estar registrado no OneSignal no momento do envio (cliente que autorizou push antes do fix de OneSignal.login, ou device ainda não re-registrado). O HTTP 200 dava falsa sensação de sucesso e impedia o diagnóstico pelos logs.

## Correção aplicada
Em `app/api/notify.js`, ramo `if (response.ok)`: agora loga sempre o resultado do OneSignal (`event`, `targetExternalId`, `recipientRole`, `result.id`, `result.recipients`, `result.errors`) e retorna corpo `{ success, delivered, recipients, notificationId }`. Mantém best-effort (sempre 200 no ramo ok, não quebra a operação do dono). Não altera EVENT_MAP nem include_aliases.

## Próximo passo (empírico)
Após redeploy (`vercel --prod`), reproduzir um cancelamento e ler os logs: se aparecer `recipients: 0` / `invalid_aliases` para `owner_canceled`, confirma que o device do cliente não está associado ao external_id no OneSignal — solução é garantir que o cliente reabra o link do salão (dispara `OneSignal.login(client_id)`) com push autorizado antes do envio. Se `recipients: 1`, o problema é entrega/OneSignal e não associação.

## Gap de teste
`DashboardHome.test.jsx` não cobre handleCancel → sendPushNotification('owner_canceled', client_id). Regressão possível sem detecção. Registrar como pendência.
