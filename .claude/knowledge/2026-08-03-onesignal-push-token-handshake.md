---
Agent: notifier
Tipo: bug
Data: 2026-08-03
Título: OneSignal reportava optedIn:true sem token push real (handshake incompleto)
---

## Sintoma

`OneSignal.User.PushSubscription.optedIn` retornava `true` no cliente, mas o painel do OneSignal mostrava "Never Subscribed / No Push Token". Usuário via mensagem de sucesso e achava que estava inscrito, mas não recebia nenhum push.

## Causa raiz

Três problemas combinados:

1. **Verificação insuficiente de estado**: o código checava apenas `optedIn === true` para considerar a assinatura ativa e retornava sucesso sem confirmar que um push token (`.token` ou `.id`) havia sido gerado e enviado ao backend do OneSignal/FCM. `optedIn` reflete a permissão do navegador, não o registro completo do token no servidor.

2. **Erro silenciado**: o `catch` de `ClientProfile.jsx` engolia a exceção e exibia mensagem genérica, impedindo o diagnóstico da falha real em dispositivo físico sem USB debug.

3. **Race condition entre Service Workers**: o Workbox (VitePWA `registerType:'autoUpdate'`, escopo `/`) e o OneSignal SW (`/onesignal/OneSignalSDKWorker.js`, escopo `/onesignal/`) eram registrados de forma assíncrona sem ordem garantida. Em alguns cenários o Workbox ativava com `clients.claim()` antes do OneSignal SW estar firmado, interferindo no handshake pushManager → FCM → token.

## Solução

### 1. Verificação dupla (optedIn + token)
Em `Settings.jsx` e `ClientProfile.jsx`: só considera "já ativadas" se `optedIn && (token || id)`. Se `optedIn` sem token, trata como estado inválido e força nova tentativa via `requestPermission()`.

### 2. Diagnóstico pós-subscribe
Após `requestPermission()` retornar `true`, aguarda 1,5 s (tempo para o SDK completar o handshake FCM) e verifica se o token foi de fato gerado. Se não, exibe toast com instrução clara ao usuário ("feche o app, reabra e tente novamente").

### 3. Exposição do erro real
`catch (error)` agora usa `toast.error("Erro ao ativar notificações: " + (error?.message || String(error)))` nos dois arquivos, tornando a exceção visível sem USB debug.

### 4. Pré-registro explícito do OneSignal SW
Em `app/index.html`, adicionado bloco `<script>` antes do SDK do OneSignal que chama `navigator.serviceWorker.register('/onesignal/OneSignalSDKWorker.js', { scope: '/onesignal/' })` de forma síncrona (sem await). Isso garante que o SW do OneSignal seja registrado no browser antes do Workbox executar seu próprio registro (que vem com o bundle JS carregado depois), eliminando a race condition de ativação.

## Arquivos alterados

- `app/index.html` — pré-registro do SW do OneSignal
- `app/src/pages/owner/Settings.jsx` — verificação dupla + diagnóstico token
- `app/src/pages/client/ClientProfile.jsx` — verificação dupla + diagnóstico token + catch com mensagem real

## Padrão fixado

Nunca tratar `optedIn === true` como "push ativo". O contrato correto é: `optedIn === true && (token || id) != null`.
