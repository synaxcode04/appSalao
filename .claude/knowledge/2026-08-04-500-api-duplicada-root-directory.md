**Agent:** session (Claude, investigação direta via Vercel CLI/API)
**Tipo:** bug crítico / incidente estrutural (recorrência)
**Data:** 2026-08-04

## Sintoma

Mesmo sintoma de `2026-08-04-500-appointments-client-identity-env-vars.md` (500 em `/api/appointments` e `/api/client-identity`, cliente não conseguia agendar), mas persistindo mesmo depois de o usuário confirmar env vars corretas na Vercel e refazer Redeploy manual pelo Dashboard.

## Causa Raiz

O projeto Vercel `appsalao` estava com **Root Directory = raiz do repositório** (`rootDirectory: null` via API), não `app/`. Existia uma **pasta `api/` inteira duplicada e desatualizada na raiz do repo** (fora de `app/`, commitada em 01/08, sem os fixes de `professional_id` null aplicados posteriormente em `app/api/`), com seu próprio `vercel.json` (buildCommand `cd app && npm install && npm run build`) e `package.json` (só `tsx`, sem `@supabase/supabase-js`).

A Vercel servia as funções serverless a partir dessa `api/` da raiz. Erro real de runtime (só visível via `vercel logs`, não no navegador): `Cannot find module '@supabase/supabase-js'`, stack `/var/task/api/appointments.js` (sem `app/`) — essa ausência de `app/` no path foi a pista decisiva.

**Isso é recorrência do incidente já documentado no guardrail do `CLAUDE.md`** (2026-08-01: tentativa de corrigir deploy criou `vercel.json` + `api/` duplicados na raiz). Histórico git: criado (`95283b2`), parcialmente revertido (`ad5e6c7`, `api/` continuou rastreado), recriado (`bb178ad`) — nunca foi limpo de verdade. Consequência prática: **nenhum fix aplicado em `app/api/` esteve realmente em produção** até a limpeza de hoje.

## Como diagnosticar isso rápido da próxima vez

1. Um 500 "genérico" numa Vercel Function sem stack visível no navegador → **primeiro passo é `vercel logs <deployment-url> --token=...`**, não hipóteses de env var/RLS/lógica.
2. Se o path do stack trace não bate com a estrutura esperada (ex: `/var/task/api/...` quando o código real está em `app/api/...`), suspeitar de Root Directory errado ou duplicação de arquivos-fonte.
3. Checar `git status`/`git ls-files` por `api/`, `vercel.json` ou `package.json` **fora de `app/`** — não devem existir nesse projeto.

## Solução

1. `git rm` das duplicatas da raiz: `api/` (10 arquivos), `vercel.json`, `package.json`, `package-lock.json`. `node_modules/`/`.vercel/` da raiz (não rastreados) removidos localmente.
2. `rootDirectory` do projeto Vercel corrigido para `"app"` via `PATCH /v9/projects/{id}` da API REST da Vercel.
3. Confirmado que `.claude/scripts/package.json` (RAG) é autocontido — remoção do `package.json` órfão da raiz não quebrou o script de RAG.
4. `vercel --prod` a partir da raiz do repo (agora com `rootDirectory=app` configurado) — sucesso.

## Resultado

- Logs pós-deploy sem `Cannot find module`. Smoke test via `curl`: 500 → 400 (validação normal). Usuário confirmou agendamento funcionando em produção.
- Commit `fcfaa0c` (`dev`), push para `origin/dev`.

## Registro de regressão

`teste_regressao/2026-08-04-500-api-duplicada-root-directory.md`.
