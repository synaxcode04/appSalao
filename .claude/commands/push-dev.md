Envie o trabalho local para o branch `dev` no GitHub (`origin/dev`) — espelho de código para testes/desenvolvimento, sem acionar deploy.

Sequência:

1. Confirme que o branch atual é `dev` (ou pergunte antes de trocar de branch).
2. Rode `git status` e `git log origin/dev..HEAD --oneline` para mostrar o que será enviado.
3. Se houver mudanças não commitadas, avise o usuário e pare — não commite automaticamente aqui, isso é feito no fluxo normal de trabalho.
4. Execute `git pull origin dev` para trazer o que o colaborador já enviou antes de mandar o seu.
   - Se der conflito de merge, **pare e avise o usuário** — não resolva conflito sozinho sem o usuário revisar. Ele decide como resolver, aí sim você continua.
5. Execute `git push origin dev`.
6. Reporte o resultado (commits enviados, link do compare no GitHub se relevante).

Não faça merge, não mexa em `main`, não dispare deploy — isso é só espelhamento de código para o colaborador.
