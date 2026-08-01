## Commit automático ao concluir tarefas

Decidido em 2026-08-01. Quando uma task passar pelo fluxo do orchestrator e o **code-reviewer** retornar "Aprovado para deploy: SIM" (ou sem BLOQUEANTEs abertos), faça o **commit local automaticamente** — sem esperar o usuário pedir "pode commitar".

- **Gatilho:** somente após aprovação do code-reviewer. Trabalho ainda em andamento, com pendências ou sem passar pelo review não é commitado automaticamente.
- **Escopo do commit:** local apenas (`git commit`). **Nunca dar `git push` automaticamente** — o usuário revisa o histórico local antes de mandar pro remoto.
- **Deploy:** continua exigindo pedido explícito do usuário. Aprovar o code-reviewer e commitar **não** dispara deploy sozinho.
