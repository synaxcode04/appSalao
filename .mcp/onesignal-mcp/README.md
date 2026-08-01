# onesignal-mcp

MCP Server que permite aos agents do App Salão enviar notificações de teste, verificar entrega dos 8 eventos do SPEC e consultar estatísticas de subscribers sem abrir o OneSignal Dashboard.

## Instalação

```bash
cd .mcp/onesignal-mcp
npm install
```

## Variáveis de ambiente

| Variável | Onde encontrar | Obrigatória |
|----------|---------------|-------------|
| `ONESIGNAL_APP_ID` | OneSignal Dashboard → App → Settings → Keys & IDs → OneSignal App ID | ✅ |
| `ONESIGNAL_REST_API_KEY` | Dashboard → App → Settings → Keys & IDs → REST API Key | ✅ |

> ⚠️ Nunca use a User Auth Key aqui — ela dá acesso à conta inteira. A REST API Key é por app.

## Tools disponíveis

| Tool | Parâmetros | O que faz |
|------|-----------|-----------|
| `send_test_notification` | `player_id`, `title`, `message`, `event_type?` | Envia push para um dispositivo específico para teste |
| `check_delivery_status` | `notification_id` | Verifica se a notificação foi entregue, falhou ou está pendente |
| `list_recent_notifications` | `limit?`, `offset?` | Lista últimas N notificações com status de entrega |
| `get_app_stats` | — | Retorna total de subscribers, messageable players e dados do app |
| `get_notification_detail` | `notification_id` | Retorna payload completo e métricas de uma notificação específica |

## Configuração no Claude Code

Já configurado em `.claude/settings.json`. Defina as variáveis de ambiente antes de iniciar.

## Como obter o player_id para testes

1. Abra o app no navegador com OneSignal inicializado
2. Abra DevTools → Console e execute:
   ```js
   await OneSignal.getUserId()
   ```
3. Copie o UUID retornado — esse é o `player_id`

## Exemplo de uso

**Testar o evento `new_appointment` (critério 3 do SPEC — 30s de entrega):**
```
use onesignal-mcp send_test_notification com:
  player_id="uuid-do-dono"
  title="Novo agendamento"
  message="Maria Silva agendou Corte às 14h"
  event_type="new_appointment"

(anota o notification_id)
(espera ~30s)

use onesignal-mcp check_delivery_status com notification_id="..."
```

**Ver estatísticas antes do smoke test:**
```
use onesignal-mcp get_app_stats
```
