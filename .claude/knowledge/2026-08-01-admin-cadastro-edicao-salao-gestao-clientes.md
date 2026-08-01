# Painel admin — cadastro/edição de salão e gestão global de clientes

**Data:** 2026-08-01
**Agent:** session (orchestrator + code-reviewer + rls-security + qa + devops)
**Tipo:** feature

## Descrição
Duas Vercel Functions novas usando `service_role` (bypassa RLS), com guard de
`role='admin'` via Bearer token:
- `app/api/admin-salon.js` — cadastro/edição manual de salão pelo admin. Cria o
  dono via `auth.admin.createUser` com senha temporária; tem rollback que remove
  o profile e deleta o usuário Auth em caso de falha parcial na criação do salão.
- `app/api/admin-clients.js` — gestão global de clientes: editar dados, ver/alternar
  vínculos `salon_clients` por salão.

`app/src/pages/admin/AdminDashboard.jsx` foi editado para consumir as Functions.

## Revisão de segurança (code-reviewer) — 2 bloqueadores, ambos tratados
1. Senha temporária estava em `input type="text"` (exposta em tela) → corrigido
   para `type="password"` em `AdminDashboard.jsx` linha 920.
2. Operações de licença (renovar/bloquear salão em `handleRegisterPayment` /
   `toggleBlockStatus`) rodam via anon client e dependem de RLS. Diagnóstico:
   `payments` INSERT já coberto por `rls_fix.sql` (policy admin), mas faltava
   policy de UPDATE em `salons` para admin — a única policy de UPDATE era
   owner-scoped (`auth.uid() = owner_id`), então não havia vulnerabilidade
   (não-admin não altera salão alheio), mas o recurso admin de bloquear/renovar
   ficava funcionalmente quebrado (0 linhas afetadas). Solução: gerado
   `Documentos/rls_admin_fix.sql` que adiciona policy "Admins can update any salon"
   (USING/WITH CHECK com EXISTS em `profiles` role='admin' e `auth.uid() IS NOT NULL`).
   PostgreSQL faz OR entre policies, então donos continuam restritos aos próprios salões.

## Achados IMPORTANTES ainda em aberto (follow-up, não bloquearam deploy)
- (a) Botão "Resetar Senha" sempre falha porque `profiles` não tem coluna `email`
  (o email real vive em `auth.users`) — `salon.owner?.email` sempre null.
- (b) Input `search` em `admin-clients.js` interpolado no filtro `.or()` do PostgREST
  sem sanitização.
- (c) `target_gender` gravado sem validação de enum server-side no update de salão.

## PENDÊNCIA PÓS-DEPLOY MANUAL
Aplicar `Documentos/rls_admin_fix.sql` (e `rls_fix.sql` se ainda não aplicado) no
Supabase Dashboard → SQL Editor. Sem isso o bloqueio/renovação de licença pelo
admin não tem efeito.

## Deploy
- qa aprovou (30/30 testes verdes, build ok, `.env` fora do git).
- devops fez deploy de produção na Vercel — status Ready, URL
  https://appsalao-psi.vercel.app, deployment `dpl_3UfjHdqBAvkJYjsatyKsHJedJz3m`.
- Todas as env vars server-side confirmadas (`SUPABASE_SERVICE_ROLE_KEY`,
  `ONESIGNAL_REST_API_KEY` sem prefixo `VITE_`).
