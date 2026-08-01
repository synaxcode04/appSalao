# Notificações push — mapa dos 8 eventos

**Agent:** notifier
**Tipo:** regra-negocio

## Contexto / Problema
O sistema dispara notificações push via OneSignal a partir do endpoint serverless `notify.js`. O mapa de eventos em `notify.js` é a fonte de verdade dos 8 eventos do SPEC.

## Detalhe
Qualquer evento fora do mapa retorna HTTP 400 — nunca 200 silencioso. O campo `recipientRole` determina o destinatário do push (owner ou client). Inverter significa notificar a pessoa errada.

Mapa dos 8 eventos (evento → destinatário):
- `new_appointment` → owner
- `client_canceled` → owner
- `owner_canceled` → client
- `client_rescheduled` → owner
- `owner_rescheduled` → client
- `completed_by_owner` → client
- `completed_by_client` → owner
- `new_review` → owner

## Solução / Regra aplicada
A REST API key do OneSignal é server-side only — nunca vai em código enviado ao cliente (sem prefixo `VITE_`). Erros da API do OneSignal são logados com `console.error`, mas detalhes não vazam no corpo da resposta ao cliente.
