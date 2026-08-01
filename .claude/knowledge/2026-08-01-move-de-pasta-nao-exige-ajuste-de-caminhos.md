**Agent:** session (orchestrator) + devops (registro)
**Tipo:** decisao

# Mover a pasta do projeto localmente não exige ajuste de caminhos

## Contexto
O dono moveu o projeto App Salão para `C:\Users\israe\OneDrive\Desktop\Projetos Israel\Sistemas\App_salão` e pediu para "revisar e ajustar os caminhos localmente".

## Investigação
- `git rev-parse --show-toplevel` já resolve o novo caminho — repo git íntegro, não precisa re-clonar.
- Busca por caminhos absolutos antigos em `.claude/` e `app/` (fora de node_modules): nenhuma ocorrência hardcoded.
- `.claude/settings.json` usa apenas caminhos relativos para hooks e MCP servers.
- `app/vercel.json`: só rewrites de rota, sem caminhos de filesystem.
- `app/package.json`: scripts padrão, sem caminhos absolutos.
- Shims `.bin` (ex: `esbuild.cmd`) usam `%~dp0` (relativo ao próprio shim) → portáveis.
- `better_sqlite3.node` e `app/node_modules/.bin/vite.cmd` presentes → deps instaladas.

## Conclusão / Decisão
Mover a pasta NÃO quebra o projeto quando:
1. Não há caminhos absolutos hardcoded (confirmado).
2. Os binários nativos `.node` não embutem o caminho de origem (são portáveis).
3. Os shims `.bin` no Windows usam `%~dp0` (relativo).
Nenhuma edição de código/config foi necessária.

## Ações recomendadas ao usuário (não são bloqueadores)
- Sanity check opcional: `cd app; npm install; npm run dev`.
- `git remote -v` está vazio — adicionar remote se pretende dar push.
- Projeto está sob OneDrive: `node_modules` sob sync do OneDrive pode causar locking/lentidão; considerar excluir `node_modules` da sincronização do OneDrive.
