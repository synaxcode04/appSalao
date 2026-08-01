# melhoria
> Implementa uma melhoria dentro do escopo do SPEC, com TDD e code-review. Invoque com `/melhoria <descrição>`.

Assuma o papel do orchestrator (`.agents/agents/orchestrator.md`).

1. Verifique se está dentro do escopo do SPEC.md — se não (pagamento online, app nativo, WhatsApp, multi-owner), informe e pare.
2. Verifique se envolve decisão em aberto (tela de suspensão, quem conclui atendimento, reagendamento) — se sim, não implemente sem aprovação explícita.
3. Plano: agent(s), arquivos a criar/modificar, testes que provam a melhoria.
4. Para melhorias em 2+ módulos, apresente o plano e aguarde confirmação.
5. Execute com TDD obrigatório.
6. Invoque `code-reviewer` ao final.

Se a descrição for vaga, faça no máximo 2 perguntas objetivas antes de prosseguir.
