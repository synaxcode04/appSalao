# OneSignal login() race condition — subscription change listener

- **Agent:** notifier
- **Tipo:** bug / fix
- **Data:** 2026-08-04

## Sintoma

`errors.invalid_aliases { external_id: [...] }` na resposta da API do OneSignal ao disparar push para o cliente (mobile). `recipients: undefined`. No computador (dono) chegava; no celular (cliente) não chegava.

## Causa raiz

`OneSignal.login(externalId)` era chamado apenas no mount / auth state change — nunca re-chamado quando a push subscription mudava. No mobile, se o usuário concedia permissão DEPOIS do mount (clicando "Ativar Notificações"), a nova subscription/token criada ficava SEM external_id associado. Resultado: OneSignal não conseguia mapear o `external_id` para nenhuma subscription válida → `invalid_aliases`.

É uma race condition: `login()` rodava antes de existir uma subscription push ativa para vincular.

## Solução

Adicionado `OneSignal.User.PushSubscription.addEventListener('change', handler)` em dois pontos:

1. **`app/src/App.jsx`** — dono. Listener adicionado dentro do `OneSignalDeferred.push` callback (após `login` inicial e após cada `onAuthStateChange`). Listener antigo é removido antes de registrar novo (via `removePushListener` closure). Cleanup do useEffect remove o listener.

2. **`app/src/contexts/ClientSessionContext.jsx`** — cliente. Listener adicionado dentro do `OneSignalDeferred.push` callback após o `login` inicial. Cleanup do useEffect remove o listener.

O handler verifica o contrato `optedIn === true && (token || id) != null` antes de re-chamar `login()`, evitando chamadas desnecessárias.

**Defesa extra (re-login explícito após requestPermission):**

3. **`app/src/pages/owner/Settings.jsx`** — após `requestPermission()` resolver com `accepted=true` e token confirmado, chama `supabase.auth.getSession()` + `OneSignal.login(session.user.id)` explicitamente.

4. **`app/src/pages/client/ClientProfile.jsx`** — após `requestPermission()` resolver com `accepted=true` e token confirmado, chama `OneSignal.login(clientSession.client_id)` explicitamente.

## Cobertura dos cenários

| Cenário | Coberto por |
|---------|-------------|
| Usuário já tinha permissão (retorna ao app) | `login()` no mount / `OneSignalDeferred.push` inicial |
| Usuário concede permissão APÓS mount | change listener dispara → re-chama `login()` |
| Usuário clica "Ativar Notificações" | change listener + re-login explícito após `requestPermission` |

## Arquivos alterados

- `app/src/App.jsx` — `attachPushListener` + cleanup via `removePushListener`
- `app/src/contexts/ClientSessionContext.jsx` — change listener com cleanup no return do useEffect
- `app/src/pages/owner/Settings.jsx` — re-login após requestPermission com token confirmado
- `app/src/pages/client/ClientProfile.jsx` — re-login após requestPermission com token confirmado

## Relacionado

- `.claude/knowledge/2026-08-03-onesignal-push-nao-chegava-sw-scope-e-login-cliente.md`
- `.claude/knowledge/2026-08-03-onesignal-push-token-handshake.md`
