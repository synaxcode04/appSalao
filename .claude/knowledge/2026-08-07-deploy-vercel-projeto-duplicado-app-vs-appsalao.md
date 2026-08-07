# Deploy Vercel — Projeto Duplicado `app` vs `appsalao`

**Agent:** devops  
**Tipo:** bug  
**Data:** 2026-08-07

## Título
Deploy criou projeto Vercel duplicado `app` ao remover `.vercel/`

## Descrição do problema
Ao rodar `vercel --prod` a partir de `app/`, o CLI criou um NOVO projeto Vercel chamado `app` em vez de usar o projeto existente `appsalao`. Isso aconteceu porque o `.vercel/` (que continha o `project.json` com o projectId do projeto original `appsalao`, `prj_NftwDKcTjUKLt9an0GCI758cgs16`) tinha sido removido durante uma tentativa de corrigir conflito de estrutura. Sem o projectId salvo, o `vercel --prod` relinkou para um projeto novo de nome `app`, deixando o domínio fixo `appsalao-psi.vercel.app` desconectado do novo deployment.

## Causa raiz
Remoção do `.vercel/project.json` (perda do vínculo com o projeto `appsalao`). O CLI, sem link, cria projeto novo pelo nome da pasta (`app`).

## Impacto
- Produção NÃO caiu (o domínio fixo continuou servindo o último deploy bom do projeto `appsalao`)
- Gerou um projeto órfão `app` (em `app-six-omega-73.vercel.app`)

## Solução aplicada
Rodar `npx vercel link --yes --project appsalao` para revincular a pasta ao projeto existente `appsalao` (projectId `prj_NftwDKcTjUKLt9an0GCI758cgs16`), confirmar o `project.json`, e só então rodar `npx vercel --prod`. Deployment correto: `dpl_6cRsG2GGvtWcDrcRjv7nEt3YaDLj`, aliasado ao domínio fixo `https://appsalao-psi.vercel.app`.

## Prevenção
- NUNCA remover `.vercel/project.json` para "corrigir" problemas de estrutura — ele guarda o vínculo com o projeto Vercel correto
- Se precisar corrigir link, use `vercel link --project appsalao` explicitamente, nunca deixe o CLI criar projeto por nome de pasta
- Coerente com o guardrail do CLAUDE.md (não criar estrutura nova por conta própria) e com a memória "api/ duplicada na raiz"

## Pendência
O projeto órfão `app` (`app-six-omega-73.vercel.app`) pode ser deletado manualmente no Vercel Dashboard.
