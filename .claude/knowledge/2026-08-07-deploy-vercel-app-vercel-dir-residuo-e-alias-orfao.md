# Deploy Vercel — Recorrência do projeto duplicado `app` + alias órfão do domínio fixo

**Agent:** session (orchestrator + devops)
**Tipo:** bug
**Data:** 2026-08-07

## Título
Duas falhas distintas no mesmo dia: (1) alias `appsalao-psi.vercel.app` ficou órfão sem deploy nenhum quebrar; (2) `vercel --prod` rodado de dentro de `app/` recriou o projeto duplicado `app` (2ª ocorrência do incidente já documentado em `2026-08-07-deploy-vercel-projeto-duplicado-app-vs-appsalao.md`).

## Descrição do problema

**Falha 1 — alias órfão:** o domínio fixo `appsalao-psi.vercel.app` passou a retornar 404 mesmo com deployments "Ready" no projeto `appsalao`. Nenhum deploy quebrou — o alias simplesmente não estava mais atribuído a nenhum deployment. Causa mais provável: o usuário excluiu outro projeto Vercel pelo dashboard nesse período, o que derrubou o alias por algum efeito colateral da conta/domínio compartilhado. Resolvido com `npx vercel alias set <latest-deployment-url> appsalao-psi.vercel.app`.

**Falha 2 — projeto duplicado de novo:** ao autorizar um novo deploy, o comando foi rodado como `cd app && npx vercel --prod`. Diferente do incidente anterior (que foi causado por `.vercel/project.json` da raiz ter sido apagado), dessa vez havia um `app/.vercel/project.json` **residual e válido**, mas apontando para o projeto errado (`prj_pTGbPfW3cWQbP9FjrE8MLAxiYihM`, nome `app`) — resíduo do incidente anterior que nunca tinha sido limpo. Rodar o comando de dentro de `app/` usou esse link errado e recriou/reusou o projeto "app", gerando um deployment de produção nele (`app-rho-snowy-27.vercel.app`), enquanto `appsalao-psi.vercel.app` continuava sem o novo build.

## Causa raiz
- Falha 1: fora do controle do Claude Code — ação manual do usuário no dashboard Vercel (exclusão de outro projeto) com efeito colateral no alias do domínio fixo.
- Falha 2: existência de DOIS diretórios `.vercel/` no repo — um na raiz (correto, `appsalao`) e um em `app/` (residual do incidente de 2026-08-07 anterior, nunca removido, apontando para `app`). Rodar o comando a partir de `app/` usa o link errado silenciosamente — sem erro, sem aviso, o CLI só deploya no projeto que aquele `.vercel/project.json` local aponta.

## Impacto
- Falha 1: produção real ficou fora do ar (404) até a correção manual do alias.
- Falha 2: nenhum impacto em produção (o deploy errado foi para um projeto novo sem domínio), mas consumiu um ciclo de deploy e gerou confusão/perda de confiança do usuário ("de novo isso?").

## Solução aplicada
- Falha 1: `npx vercel alias set <deployment> appsalao-psi.vercel.app`.
- Falha 2: apagado `app/.vercel/` inteiro; deploy refeito a partir da **raiz** do repo (onde `.vercel/project.json` aponta corretamente para `appsalao`, `prj_NftwDKcTjUKLt9an0GCI758cgs16`); confirmado via `vercel project ls` e print do dashboard que só resta o projeto `appsalao`. O projeto órfão "app" desapareceu sozinho da listagem ao tentar removê-lo (provavelmente nunca foi persistido como projeto completo, só o deployment).

## Prevenção
- **NUNCA rodar `vercel --prod`/`vercel deploy`/`vercel link` de dentro de `app/`.** O comando de deploy real deste projeto é sempre a partir da RAIZ do repo (`cd` para a raiz, depois `npx vercel --prod`). Isso é coerente com o `Root Directory` do projeto Vercel `appsalao` estar configurado como `.` (raiz), não `app` — configuração pendente de correção pelo usuário no Dashboard (ver memória `project_vercel_rootdirectory_raiz_2026-08-07`), mas que hoje é a realidade e precisa ser respeitada pelo comando de deploy.
- Antes de qualquer deploy, checar que existe **só um** `.vercel/project.json` no repo — na raiz. Se aparecer um em `app/.vercel/`, é sinal de erro anterior; apagar antes de deployar.
- Após qualquer deploy, validar o resultado pelo `inspectorUrl`/`projectName` retornado pela CLI (deve ser `appsalao`, nunca outro nome) — não confiar apenas em "status Ready".
- Verificação pós-deploy obrigatória: confirmar `https://appsalao-psi.vercel.app/` retorna 200 e serve o bundle esperado, não só que o comando saiu com status Ready.
- Ver também memória `deploy_dominio_fixo` (atualizada com essa recorrência) e o doc irmão `2026-08-07-deploy-vercel-projeto-duplicado-app-vs-appsalao.md`.
