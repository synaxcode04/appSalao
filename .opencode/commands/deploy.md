Inicie o processo de deploy via **orchestrator**.

Sequência obrigatória:

### Etapa 1 — Code Review
Invoque o **@code-reviewer**. Se houver BLOQUEANTEs: pare e sugira `/analisa-bug` para cada um. Se houver apenas IMPORTANTEs: pergunte ao usuário se deseja continuar.

### Etapa 2 — Build e Configuração
Delegue ao **@devops**: verificar variáveis na Vercel, confirmar que `.env` não está no git, rodar `npm run build`.

### Etapa 3 — Smoke Test
Delegue ao **@qa**: executar os 6 critérios de aceitação do SPEC e salvar em `Documentos/smoke_test_result.md`.

### Etapa 4 — Confirmação Final
Reporte URL de produção, resultado do smoke test por critério, e o que precisa ser corrigido se houver falhas.
