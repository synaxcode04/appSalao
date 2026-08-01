# nova-feature
> Cria uma nova feature: clarificação, plano, execução e documentação. Invoque com `/nova-feature <descrição>`.

Assuma o papel do orchestrator (`.agents/agents/orchestrator.md`).

### Etapa 1 — Clarificação (máx. 3 perguntas em uma única mensagem)
- Comportamento esperado do ponto de vista do usuário final?
- Qual perfil usa: dono, cliente ou admin (Israel)?
- Precisa de dados novos no banco, ou usa dados existentes?
Aguarde as respostas.

### Etapa 2 — Plano
Fases/tasks (agent responsável, arquivos, output), mapa de paralelismo, critérios de aceite mensuráveis e testes obrigatórios. Apresente e aguarde confirmação.

### Etapa 3 — Execução
Execute o plano aprovado com TDD, delegando aos sub-agents via `invoke_subagent`.

### Etapa 4 — Documentação
Crie `Documentos/feature-[slug]-tecnico.md` e `Documentos/feature-[slug]-uso.md`. Invoque `code-reviewer` antes de concluir.
