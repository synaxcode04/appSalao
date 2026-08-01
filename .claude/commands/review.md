Invoque o sub-agent **@code-reviewer** agora.

Escopo da revisão: $ARGUMENTS

Instruções ao code-reviewer:
- Leia `Documentos/SPEC.md` e `Documentos/PLAN.md` como referência obrigatória
- Se o escopo acima estiver vazio, revise todos os arquivos em `app/src/` e `app/api/`
- Se o escopo nomear um arquivo ou módulo específico, foque nele
- Classifique cada problema como BLOQUEANTE, IMPORTANTE ou SUGESTÃO conforme seus critérios
- Produza o relatório completo no formato padrão, com checkboxes e linha "Aprovado para deploy: SIM / NÃO"
- Nunca corrija — apenas identifique e reporte
