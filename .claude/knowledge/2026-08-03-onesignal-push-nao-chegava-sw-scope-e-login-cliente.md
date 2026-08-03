# Push do OneSignal não chegava — SW em conflito + external_id do cliente ausente

**Agent:** notifier (via orchestrator)
**Tipo:** bug
**Data:** 2026-08-03

## Problema
Notificações push nunca chegavam aos destinatários; `notify.js` retornava HTTP 200 mas com zero entregas.

## Causas raiz
1. **Conflito de Service Worker:** Workbox (vite-plugin-pwa) e o SDK do OneSignal competiam pelo mesmo escopo `"/"`, resultando em apenas um estar ativo por sessão do navegador (comportamento intermitente, difícil de reproduzir).
2. **external_id do cliente ausente no OneSignal:** 
   - `App.jsx` fazia `OneSignal.login()` apenas para o dono (sessão Supabase Auth com `auth.uid()` real).
   - O cliente usa sessão leve via `ClientSessionContext` (localStorage) — nunca chamava `OneSignal.login()`, logo o OneSignal desconhecia a identidade do cliente.
   - Em `notify.js`, o filtro `include_aliases: { external_id: clientId }` não encontrava nenhum device registrado para aquele client_id.

## Solução (Opção A — mantém CDN, sem react-onesignal)
- **Isolamento de escopo do SW do OneSignal:**
  - `app/index.html`: `init()` agora passa `serviceWorkerParam: { scope: "/onesignal/" }` e `serviceWorkerPath: "/onesignal/OneSignalSDKWorker.js"`.
  - Worker movido de `app/public/OneSignalSDKWorker.js` (raiz) para `app/public/onesignal/OneSignalSDKWorker.js`.
  - `app/vercel.json`: exclusão do rewrite ajustada de `"OneSignalSDKWorker.js"` (raiz) para `"onesignal/.*"`.
  - `app/vite.config.js`: adicionado `workbox.navigateFallbackDenylist: [/^\/onesignal\//]` para o Workbox não interceptar rotas do OneSignal.

- **Registro de identidade do cliente:**
  - `app/src/contexts/ClientSessionContext.jsx`: novo `useEffect` que chama `OneSignal.login(clientSession.client_id)` via `window.OneSignalDeferred` quando `client_id` está disponível.
  - External ID do cliente = `client_id` do localStorage (escopado por slug do salão).
  - Pattern idêntico ao do dono em `App.jsx`.

- **Não alterado:** `app/api/notify.js` (lógica de envio já estava correta), App ID (público, hardcoded), fluxo de login do dono.

## Arquivos alterados
- `app/index.html`
- `app/public/onesignal/OneSignalSDKWorker.js` (novo)
- `app/public/OneSignalSDKWorker.js` (deletado)
- `app/vercel.json`
- `app/vite.config.js`
- `app/src/contexts/ClientSessionContext.jsx`

## Referência
- Code-reviewer: 0 bloqueantes, aprovado para deploy SIM.
- Sessão leve do cliente: `seguranca.md`, "Cliente sem Supabase Auth (sessão leve)".
- OneSignal scope e SW: Vercel Functions, vite-plugin-pwa, Worker Scope conflict.
