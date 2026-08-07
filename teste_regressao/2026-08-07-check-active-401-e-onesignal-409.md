# Teste de Regressão — 401 em check_active (sessão leve) e 409 duplicado no OneSignal login do dono

**Data:** 2026-08-07
**Commit:** `88afb65` — fix(client): corrige 401 em check_active (sessao leve) e 409 no OneSignal login do dono
**Ambiente:** Produção (`https://appsalao-psi.vercel.app`)

---

## O que foi testado

Dois problemas distintos corrigidos no mesmo commit:

1. `check_active` em `app/api/client-identity.js` retornando HTTP 401 para o cliente
   (sessão leve, sem Bearer token).
2. `PATCH` para a API do OneSignal retornando HTTP 409 por `OneSignal.login` disparado
   em duplicidade no fluxo do dono (`App.jsx`).

**Comportamento esperado:**
- `check_active` responde 200 `{ blocked }` com ou sem token, para dono e cliente.
- `toggle_active` continua exigindo token (ação administrativa do dono).
- `OneSignal.login(external_id)` é chamado uma única vez por sessão do dono, mesmo sob
  StrictMode/HMR/re-renders.

---

## Passos reproduzidos

### Problema 1 — check_active 401

1. Antes da correção: `check_active` estava em `authGuardedActions`, exigindo Bearer
   token. Cliente (sessão leve, `auth.uid()` sempre NULL, nunca envia token) chamava a
   ação e recebia HTTP 401 — a pré-checagem de bloqueio no `BookingWizard`/
   `BookingEngine` ficava inoperante.
2. Após a correção: `check_active` removida do gate de token, passa a usar auth
   condicional (mesmo padrão de `update`/`link_to_salon`) via `service_role`.
3. Testado em produção: chamada de `check_active` sem token retorna 200 `{ blocked:
   true/false }` tanto para cliente quanto dono.
4. `toggle_active` retestado — continua exigindo token corretamente (sem regressão de
   segurança).

### Problema 2 — OneSignal 409 duplicado

1. Antes da correção: login do dono disparava `OneSignal.login(external_id)`
   repetidamente no mesmo `useEffect` (StrictMode/HMR/race), causando PATCH 409 na API
   do OneSignal.
2. Após a correção: guard de dedupe `lastLoggedInId` adicionado — só chama
   `OneSignal.login` quando o `external_id` muda; resetado no logout.
3. Testado em produção: login do dono não gera mais 409 repetido nas chamadas de rede
   ao OneSignal.

---

## Causa raiz

- **check_active:** ação de leitura necessária ao cliente estava incorretamente
  classificada como ação que exige token — incompatível com o modelo de sessão leve do
  cliente (decisão de 2026-08-01, `auth.uid()` sempre NULL).
- **OneSignal 409:** ausência de dedupe no `useEffect` de login do dono em `App.jsx`,
  reexecutado por StrictMode/HMR/race de re-render.

Ver `.claude/knowledge/2026-08-07-check-active-401-sessao-leve-cliente.md` e
`.claude/knowledge/2026-08-07-onesignal-409-dedupe-login-app-jsx.md`.

---

## Correção aplicada

- `client-identity.js`: `check_active` fora do gate de token, sempre via
  `service_role`, retorna 200 `{ blocked }`. Enforcement real de bloqueio permanece em
  `app/api/appointments.js` (esta correção só reabilita a pré-checagem de UX).
- `App.jsx`: guard `lastLoggedInId` evita `OneSignal.login` duplicado; resetado no
  logout.
- `index.html`: meta PWA padrão W3C `mobile-web-app-capable` adicionada.

---

## Testes automatizados

- Novos casos em `app/src/__tests__/client-identity.test.js` cobrindo `check_active`
  sem token (`blocked` true/false + validação de input).
- Suíte verde.

---

## Resultado

**PASS — check_active responde 200 sem token; OneSignal.login do dono não duplica mais
em produção.**

---

**Testador:** Claude Code (via orchestrator)
**Data:** 2026-08-07
