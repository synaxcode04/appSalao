# 2026-08-04 — Causa raiz real do 500: api/ duplicada na raiz do repo + Root Directory errado na Vercel

## O que foi testado
Mesmo sintoma do arquivo `2026-08-04-500-appointments-client-identity-env-vars.md`
(cliente não consegue agendar, `/api/appointments` e `/api/client-identity` retornando
500), mas com a hipótese de env vars já descartada pelo usuário (env vars corretas
confirmadas no Dashboard, Redeploy manual feito, 500 continuou).

## Investigação — evidência decisiva
Autenticado via Vercel CLI (`vercel logs <deployment-url> --token=...`) direto no
deployment mais recente, foi possível ler o erro real de runtime pela primeira vez
(o navegador só mostrava "500" genérico, sem corpo):

```
Cannot find module '@supabase/supabase-js'
Require stack: /var/task/api/appointments.js
Did you forget to add it to "dependencies" in `package.json`?
```

O caminho `/var/task/api/...` (sem `app/`) foi o que revelou o problema: a Vercel
estava servindo funções a partir de um diretório `api/` **na raiz do repositório**
(fora de `app/`), não de `app/api/`.

## Causa raiz confirmada
1. O projeto Vercel `appsalao` estava com **Root Directory = raiz do repo** (não
   `app/`) — confirmado via API (`GET /v9/projects/...` → `"rootDirectory": null`).
2. Existia uma **pasta `api/` inteira duplicada e desatualizada na raiz do repositório**
   (fora de `app/`), com 10 funções — cópia antiga (commitada em 01/08), sem o fix de
   `.eq(null)`/`.is(null)` de `professional_id` que já existia em `app/api/`.
3. O `package.json` da raiz só tinha `tsx` como dependência (usado por
   `.claude/scripts/` para o RAG) — **sem `@supabase/supabase-js`**. Por isso as
   funções da raiz crashavam com `Cannot find module`.
4. Também existia um `vercel.json` órfão na raiz, com `buildCommand: "cd app && npm
   install && npm run build"` e `outputDirectory: "app/dist"` — o build do frontend
   funcionava normalmente (por isso só as funções de API quebravam, não o site).
5. **Isso é uma recorrência do incidente já documentado no `CLAUDE.md`**
   ("Guardrail — não criar estrutura nova por conta própria", 2026-08-01): uma
   tentativa anterior de corrigir deploy criou `vercel.json` + `api/` duplicados na
   raiz. O histórico do git mostra que foi criado (`95283b2`), parcialmente
   revertido (`ad5e6c7`, mas `api/` continuou rastreado) e **recriado** (`bb178ad`)
   — nunca foi limpo de verdade.

Ou seja: **todos os fixes de código aplicados hoje em `app/api/appointments.js`
(inclusive o fix `.is(null)` de sessões anteriores) nunca estiveram de fato em
produção**, porque a Vercel servia a cópia da raiz o tempo todo.

## Correção aplicada
1. Removidos do git (`git rm`) os duplicados órfãos da raiz: `api/` (10 arquivos),
   `vercel.json`, `package.json`, `package-lock.json`. `node_modules/` e `.vercel/`
   da raiz (não rastreados) também removidos localmente.
2. `rootDirectory` do projeto Vercel corrigido para `"app"` via API
   (`PATCH /v9/projects/prj_NftwDKcTjUKLt9an0GCI758cgs16`).
3. Confirmado que `package.json` da raiz não tinha relação com o script de RAG —
   `.claude/scripts/package.json` é autocontido (tem seu próprio `tsx`), então a
   remoção não quebrou nada.
4. Deploy de produção (`vercel --prod`, a partir da raiz do repo agora que
   `rootDirectory=app`) — sucesso.

## Resultado
- Logs pós-deploy confirmaram: sem mais `Cannot find module`.
- Teste smoke via `curl`: `/api/appointments` e `/api/client-identity` passaram de
  `500` para `400` (erro de validação normal ao mandar corpo vazio — comportamento
  correto de um endpoint que agora carrega).
- Usuário testou o agendamento real na página pública do salão → **confirmado
  funcionando**.
- Commit `fcfaa0c` (`dev`, push para `origin/dev`) — remove as duplicatas.

## Lição / blindagem para não recorrer
- **Nunca deve existir `api/`, `vercel.json` ou `package.json` fora de `app/`** neste
  projeto. Se algum desses arquivos reaparecer na raiz do repo num `git status`,
  é sinal do mesmo incidente se repetindo — investigar imediatamente antes de
  qualquer outra hipótese (env vars, cache, etc.).
- Ao investigar um 500 "genérico" numa Vercel Function, **sempre puxar
  `vercel logs <url> --token=...` antes de qualquer outra hipótese** — o corpo do
  erro real (module not found, stack trace) é muito mais rápido de diagnosticar do
  que testar hipóteses às cegas pelo navegador.
