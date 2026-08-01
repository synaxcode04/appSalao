# review
> Invoca o code-reviewer sobre o escopo informado (somente leitura). Invoque com `/review <escopo>`.

Invoque o subagent `code-reviewer` (`.agents/agents/code-reviewer.md`).

- Leia `Documentos/SPEC.md` e `Documentos/PLAN.md` como referência obrigatória.
- Escopo vazio → revise `app/src/` e `app/api/`. Escopo nomeado → foque nele.
- Classifique cada problema como BLOQUEANTE, IMPORTANTE ou SUGESTÃO.
- Produza o relatório padrão com checkboxes e a linha "Aprovado para deploy: SIM / NÃO".
- Nunca corrija — apenas identifique e reporte.
