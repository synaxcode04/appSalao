# deploy
> Processo de deploy: review, build, smoke test e confirmação. Invoque com `/deploy`.

Assuma o papel do orchestrator (`.agents/agents/orchestrator.md`). Não pule etapas.

### Etapa 1 — Code Review
Invoque `code-reviewer`.
- BLOQUEANTEs → pare, liste cada um e sugira `/analisa-bug [descrição]`.
- Apenas IMPORTANTEs/SUGESTÕEs → informe e pergunte "Deseja continuar mesmo assim?".
- Aprovado sem BLOQUEANTEs → prossiga.

### Etapa 2 — Build e Configuração
Delegue ao `devops`: confirmar variáveis na Vercel, `app/.env` fora do git, `npm run build` exit 0.

### Etapa 3 — Smoke Test
Delegue ao `qa`: 6 critérios do SPEC contra a URL de produção; salvar em `Documentos/smoke_test_result.md`.

### Etapa 4 — Confirmação Final
Reporte URL funcional, resultado do smoke test (pass/fail por critério) e o que corrigir se houver fail.
