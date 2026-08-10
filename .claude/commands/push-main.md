Promova o branch `dev` para `main` (produção) no GitHub e envie (`origin/main`). Só execute quando o usuário disparar este comando explicitamente — nunca automaticamente.

Sequência:

1. Confirme com o usuário que o `dev` já foi validado/testado e que ele realmente quer promover para produção agora (isso é uma ação visível/hard-to-reverse em branch de produção).
2. Rode `git status`, `git fetch origin` e `git log origin/main..origin/dev --oneline` para mostrar exatamente o que vai entrar em `main`.
3. Faça o merge de `dev` em `main` (fast-forward se possível; se não for possível, avise o usuário antes de criar merge commit).
4. Execute `git push origin main`.
5. Reporte o resultado (commits promovidos, link do compare/PR se relevante).

Lembre o usuário: isso **não** aciona deploy — a Vercel não está conectada a este remote GitHub (deploy continua manual via `vercel --prod`, com confirmação explícita à parte).
