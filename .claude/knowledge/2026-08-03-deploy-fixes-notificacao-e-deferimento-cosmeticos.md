# Deploy 2026-08-03 dos fixes de notificação + deferimento de pendências cosméticas

**Agent:** session (orchestrator) + qa + devops
**Tipo:** decisao

## Contexto

Nesta sessão foram deployados para produção dois fixes de notificação já commitados localmente e aprovados por code-reviewer:

- **commit 99711c3** — push OneSignal não chegava: conflito de escopo de Service Worker + `client_id` nunca registrado via `OneSignal.login`.
- **commit a6ffcd5** — sininho in-app do cliente não recebia notificação quando o dono cancelava/concluía: RLS bloqueava INSERT + Realtime não funciona sem `auth.uid()` para a sessão leve do cliente.

## Pre-deploy-check (qa modo 1)

**PRONTO PARA DEPLOY** — build exit 0, 76/76 testes passando, sem RLS `WITH CHECK (true)`, `.env` fora do git. Decisões em aberto (reagendamento, semântica "dias por plano") são de UX e não bloqueiam.

## Deploy

Executado via `vercel --prod` a partir de `app/` (exit 0). Domínio fixo de produção https://appsalao-psi.vercel.app confirmado servindo o novo build (HTTP 200). Sem `git push` (projeto não usa push para deploy).

## DECISÃO — pendências cosméticas do code-reviewer DEFERIDAS para sessão futura

Itens deferidos: null-guards adicionais em JSX de `DashboardHome.jsx` (acessos `appt.services.name`, `appt.professionals.name`) e `console.error` na linha 139.

Justificativa:
1. `handleWhatsApp` já tem null-guard;
2. `console.error` da linha 139 é log de erro legítimo em handler de falha de fetch, não debug — a regra "sem console.log" mira debug;
3. mexer em caminhos de renderização JSX imediatamente antes do deploy adiciona risco sem endereçar o bug publicado;
4. pre-deploy estava verde.

São itens não-bloqueantes.

## Smoke test (qa modo 2)

Verificações automatizáveis OK (deploy 200, manifest PWA válido standalone, `sw.js` acessível, `/api/notify` e `/api/appointments` rejeitam payloads inválidos com 400). Itens manuais (login dono, fluxo dono cancela → sininho cliente em até 45s + push, licença suspensa, RLS, PWA instalável) documentados em `Documentos/smoke_test_result.md`, PENDENTES de confirmação manual do usuário.
