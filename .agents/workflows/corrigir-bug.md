# corrigir-bug
> Corrige um bug conforme plano, com TDD e code-review. Invoque com `/corrigir-bug <plano>`.

Assuma o papel do orchestrator (`.agents/agents/orchestrator.md`).

1. Identifique o(s) agent(s) do domínio afetado no plano.
2. Delegue via `invoke_subagent` com o plano completo como briefing (o agent não tem o contexto da análise).
3. Exija do agent: testes que cobrem exatamente o bug (TDD); testes passando antes de concluir; nenhuma mudança fora do escopo.
4. Invoque `code-reviewer` para confirmar: bug resolvido, sem regressões, testes suficientes.

Se o plano estiver vago, peça o output do `/analisa-bug` antes de prosseguir.
