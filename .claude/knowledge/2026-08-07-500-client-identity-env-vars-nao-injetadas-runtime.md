**Agent:** session (orchestrator + devops + qa)
**Tipo:** bug
**Data:** 2026-08-07

# 500 "Configuração do servidor ausente" em /api/client-identity — env vars não injetadas no runtime do deployment ativo

## Sintoma
Smoke test de 2026-08-07 detectou HTTP 500 com corpo `{"error":"Configuração do servidor ausente"}` nos endpoints `POST /api/client-identity` para as actions `toggle_active`, `check_active` e `link_to_salon` em produção (https://appsalao-psi.vercel.app). Todas as três dependem de `service_role` para bypassar RLS.

## Origem no código
`app/api/client-identity.js` linhas 115-118: a mensagem "Configuração do servidor ausente" é emitida SOMENTE quando `process.env.SUPABASE_URL` OU `process.env.SUPABASE_SERVICE_ROLE_KEY` estão ausentes/undefined no runtime, antes de instanciar o client Supabase (linha 128). É o único ponto do handler que produz essa string exata — ótimo marcador de diagnóstico.

## Investigação (timeline)
1. `vercel env ls` mostrou `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` PRESENTES em Production e Preview (existem há ~27 dias). Nomes corretos, sem variante errada. Escopo de Production confirmado correto.
2. Logs de produção não capturavam o 500 (histórico curto). Levantou-se a hipótese de "deploy defasado".
3. Re-teste ao vivo dos 3 endpoints CONFIRMOU que o 500 "Configuração do servidor ausente" AINDA reproduzia — descartando "já resolvido".
4. Conclusão: contradição entre config do projeto (vars presentes) e runtime do deployment ativo (vars ausentes).

## Causa raiz
Env vars na Vercel só entram num deployment no momento do build/deploy daquele deployment. Adicionar/ter a var no projeto NÃO reinjeta retroativamente num deployment já existente. O deployment que servia produção não tinha as vars aplicadas ao seu runtime, apesar de o projeto tê-las corretamente configuradas com escopo Production.

## Solução aplicada
Redeploy de produção `vercel --prod` a partir de `app/` (autorizado explicitamente pelo usuário). O novo build capturou as vars. Domínio fixo `appsalao-psi.vercel.app` passou a servir o novo deployment. Re-teste ao vivo pós-deploy confirmou correção: `check_active` e `toggle_active` retornam 401 "Não autenticado" (esperado sem Authorization), e `link_to_salon` retorna 500 com mensagem DIFERENTE ("Erro ao vincular cliente ao salão", por salon_id fake/FK) — ou seja, as vars estão no runtime e o handler passa da checagem de config.

## Lição / regra prática
- A string "Configuração do servidor ausente" (linhas 115-118 de client-identity.js) = env var ausente NO RUNTIME, não necessariamente ausente na config do projeto. Sempre distinguir "var no projeto" (vercel env ls) de "var no runtime do deployment ativo" (teste ao vivo / logs).
- Após adicionar/alterar env var na Vercel, é obrigatório um NOVO deploy para o runtime capturá-la. Deployments antigos não a enxergam.
- Diagnóstico definitivo de "ainda reproduz?" é teste HTTP ao vivo contra o domínio fixo de produção, não os logs (histórico curto) nem o dashboard de env vars.
