# OneSignal 409 Conflict — logout()+login() como recuperação de alias travado

- **Agent:** notifier
- **Tipo:** bug / fix
- **Data:** 2026-08-04

## Sintoma

Cliente não recebia push. `notify.js` logava:
```
errors: { invalid_aliases: { external_id: [Array] } }
recipients: undefined
```
para o external_id do cliente (`2503d9ad-a048-40b7-bc54-486daf2f7765`).

No Console do browser do cliente, o SDK do OneSignal disparava:
```
PATCH https://api.onesignal.com/apps/{app_id}/users/by/onesignal_id/{onesignal_id}/identity → 409 (Conflict)
```

## Causa raiz

`OneSignal.login(external_id)` chama internamente `PATCH .../identity` para vincular o `external_id` ao `onesignal_id` do device atual. O 409 ocorre quando esse `external_id` já está vinculado a um `onesignal_id` DIFERENTE (outro device/browser de sessões de teste anteriores).

Com **Identity Verification OFF**, o SDK NÃO faz reassign/merge automático nesse caso — rejeita com 409 e a Promise falha. O `external_id` nunca fica vinculado ao device atual → `notify.js` não acha alias → `invalid_aliases`.

O bug foi agravado pelo **`catch {}` vazio** em `ClientSessionContext.jsx` (linha 62 antes do fix): a exceção era engolida silenciosamente. O usuário não via nenhum erro; o push simplesmente não chegava.

## Semântica do 409 no User Model v10 do OneSignal

O endpoint `PATCH /users/by/onesignal_id/{id}/identity` registra um alias (ex: `external_id`) no user record identificado por `onesignal_id`. Se esse alias já existe em OUTRO user record, o OneSignal retorna 409 (alias owned by another user). Com IV OFF, não há token JWT para provar que o solicitante é o dono do alias — por isso o OneSignal recusa.

**Padrão de recuperação documentado:**
1. `OneSignal.logout()` — remove qualquer alias do onesignal_id atual; o device recebe um novo onesignal_id anônimo ("fresh slate").
2. `OneSignal.login(external_id)` — com um onesignal_id virgem, o OneSignal consegue reivindicar o alias sem colisão.

Isso funciona porque o OneSignal — com IV OFF — permite que o alias migre para um onesignal_id que não tem conflitos. O onesignal_id anterior que "segurava" o alias fica órfão e eventualmente é limpo.

## Solução aplicada

Substituição do `catch {}` vazio por recuperação `logout()+login()` em dois pontos do fluxo do **cliente** (nunca tocando o fluxo do dono em `App.jsx`):

### 1. `app/src/contexts/ClientSessionContext.jsx`

Extraída função `attemptLogin()` que:
- Tenta `OneSignal.login(client_id)` normalmente
- Se falhar (qualquer exceção, incluindo 409): faz `logout()` + `login()` como recuperação
- Se ainda falhar: silencia (device não receberá push — não há mais o que fazer client-side)

O listener de `PushSubscription.change` também usa `attemptLogin()` no handler, cobrindo o caso de permissão concedida após o mount.

### 2. `app/src/pages/client/ClientProfile.jsx`

`handlePushPermission` — após `requestPermission` + token confirmado, o `OneSignal.login()` agora tem o mesmo padrão `try/catch` com `logout()+login()` de recuperação. Se ainda falhar após recuperação, exibe toast de erro orientando o usuário a fechar e reabrir o app.

## Arquivos alterados

- `app/src/contexts/ClientSessionContext.jsx` — `attemptLogin` com logout+login recovery
- `app/src/pages/client/ClientProfile.jsx` — idem em `handlePushPermission`

## Limpeza do estado sujo de teste (external_id travado)

O external_id `2503d9ad-a048-40b7-bc54-486daf2f7765` ficou vinculado a um onesignal_id de um device de teste antigo. Para limpar e garantir um teste limpo após o fix, o usuário deve deletar o user record do OneSignal pela REST API:

```bash
curl -X DELETE \
  "https://api.onesignal.com/apps/{ONESIGNAL_APP_ID}/users/by/external_id/2503d9ad-a048-40b7-bc54-486daf2f7765" \
  -H "Authorization: Basic {ONESIGNAL_REST_API_KEY}"
```

Substitua `{ONESIGNAL_APP_ID}` e `{ONESIGNAL_REST_API_KEY}` pelos valores das variáveis de ambiente do projeto (disponíveis no Vercel Dashboard → Settings → Environment Variables). A REST API Key é a chave server-side (sem prefixo `VITE_`).

**Após rodar o curl:** abra o app no celular do cliente, acesse qualquer página (o `ClientSessionContext` rodará `attemptLogin()` no mount) — o login deve suceder sem 409. Dispare um cancelamento pelo dono e verifique se o push chega.

## Cobertura de cenários após o fix

| Cenário | Comportamento |
|---------|--------------|
| Device novo / primeiro acesso | `login()` sucede normalmente |
| Device cujo `external_id` está travado em outro device (409) | `logout()` + `login()` — reassign bem-sucedido |
| `logout()+login()` também falha (raro) | Silencia; push não chega; usuário precisa de suporte |
| Cliente clica "Ativar Avisos" com alias travado | Mesmo pattern em `handlePushPermission`; toast de erro se irrecuperável |
| Fluxo do dono (App.jsx) | NÃO ALTERADO — continua idêntico |

## Relacionado

- `.claude/knowledge/2026-08-04-onesignal-login-race-subscription-change.md` (fix anterior — race condition)
- `.claude/knowledge/2026-08-03-onesignal-push-nao-chegava-sw-scope-e-login-cliente.md`
