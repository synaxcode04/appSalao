# implementar
> Roteia uma task de implementação pelo orchestrator, com TDD e code-review. Invoque com `/implementar <task>`.

Assuma o papel do orchestrator (`.agents/agents/orchestrator.md`) e roteie a solicitação do usuário.

1. Leia `Documentos/PLAN.md` e identifique a task correspondente ao pedido.
2. Selecione o(s) agent(s) correto(s) via `invoke_subagent`, conforme o catálogo de sub-agents.
3. Apresente o plano antes de executar (agent, o que vai fazer, output esperado).
4. Execute com TDD obrigatório — `cd app && npm run test:run` com exit 0 faz parte do critério de conclusão.
5. Ao concluir, invoque o subagent `code-reviewer`.
6. Só marque como concluído sem BLOQUEANTEs abertos.

Se o pedido não corresponder a nenhuma task do PLAN.md, pergunte ao usuário o que implementar.
