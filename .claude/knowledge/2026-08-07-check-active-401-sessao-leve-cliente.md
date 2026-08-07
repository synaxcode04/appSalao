# check_active retornando 401 por estar no gate de token (sessão leve do cliente)

**Agent:** auth-guard
**Tipo:** bug

## Problema
A ação `check_active` de `app/api/client-identity.js` estava listada em `authGuardedActions`, exigindo Bearer token para ser executada. Como o cliente usa **sessão leve** (não tem Supabase Auth, `auth.uid()` é sempre NULL e não possui token), toda chamada de `check_active` vinda do cliente retornava **HTTP 401**. Consequência: a pré-checagem de bloqueio de cliente no `BookingWizard`/`BookingEngine` ficava morta — nunca conseguia consultar se o cliente estava bloqueado no salão.

## Causa raiz
Sessão leve do cliente (decisão de 2026-08-01): o papel `client` não tem sessão Supabase Auth, então não envia Bearer token. Qualquer ação colocada em `authGuardedActions` é inalcançável pelo cliente. `check_active` é uma leitura que o cliente precisa fazer, logo não pode estar sob o gate de token.

## Solução
- `check_active` removida de `authGuardedActions`. Agora usa **auth condicional** (mesmo padrão de `update`/`link_to_salon`): executa com ou sem token, sempre via `service_role`, e retorna **200 `{ blocked }`**.
- `toggle_active` **continua exigindo token** (ação de escrita/administrativa do dono).
- O **enforcement real** de bloqueio de agendamento permanece em `app/api/appointments.js` — esta correção só reabilita a pré-checagem de UX, não é a barreira de segurança.

## Testes
Novos casos em `app/src/__tests__/client-identity.test.js` cobrindo `check_active` sem token: `blocked true`/`false` e validação de input. Suíte verde.
