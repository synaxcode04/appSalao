# Notificações push — mapa dos 7 eventos

**Agent:** notifier
**Tipo:** regra-negocio

## Contexto / Problema
O sistema dispara notificações push via OneSignal a partir do endpoint serverless `notify.js`. O mapa de eventos em `notify.js` é a fonte de verdade dos 7 eventos do SPEC.

## Detalhe
Qualquer evento fora do mapa retorna HTTP 400 — nunca 200 silencioso. O campo `recipientRole` determina o destinatário do push (owner ou client). Inverter significa notificar a pessoa errada.

Mapa dos 7 eventos (evento → destinatário):
- `new_appointment` → owner
- `client_canceled` → owner
- `owner_canceled` → client
- `client_rescheduled` → owner
- `owner_rescheduled` → client
- `completed_by_owner` → client
- `new_review` → owner

> `completed_by_client` removido em 2026-08-07: o cliente não conclui mais atendimentos — somente o dono pode marcar como concluído. O evento foi removido do `EVENT_MAP` em `notify.js` e retorna 400 se enviado.

## Solução / Regra aplicada
A REST API key do OneSignal é server-side only — nunca vai em código enviado ao cliente (sem prefixo `VITE_`). Erros da API do OneSignal são logados com `console.error`, mas detalhes não vazam no corpo da resposta ao cliente.
