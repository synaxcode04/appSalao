Inicie o processo de deploy via **orchestrator**.

Sequência obrigatória — não pule nenhuma etapa:

### Etapa 1 — Code Review
Invoque o **@code-reviewer** para revisar o estado atual do código.

- Se houver **BLOQUEANTEs**: pare imediatamente. Liste cada bloqueante e sugira `/analisa-bug [descrição]` para cada um. Não continue.
- Se houver apenas **IMPORTANTEs ou SUGESTÕEs**: informe o usuário com a lista completa e pergunte: "Deseja continuar mesmo assim?"
- Se aprovado sem BLOQUEANTEs: prossiga para a Etapa 2.

### Etapa 2 — Build e Configuração
Delegue ao **@devops**:
- Verificar que `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão configuradas na Vercel
- Confirmar que `app/.env` não está no git
- Rodar `npm run build` e confirmar exit 0

### Etapa 3 — Smoke Test
Delegue ao **@qa**:
- Executar os 6 critérios de aceitação do SPEC contra a URL de produção
- Salvar resultado em `Documentos/smoke_test_result.md`

### Etapa 4 — Confirmação Final
Reporte:
- URL de produção funcional
- Resultado do smoke test (pass/fail por critério)
- Se houver qualquer fail: liste o que precisa ser corrigido antes de considerar o deploy bem-sucedido
