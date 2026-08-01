# Testes de Regressão

Todo teste de regressão manual (feature nova ou correção de bug validada em produção/staging) é registrado aqui como um arquivo `.md` — um arquivo por rodada de teste, nomeado `AAAA-MM-DD-assunto.md`.

Isso é diferente de:
- `Documentos/smoke_test_result.md` — smoke test padrão de pré-deploy/pós-deploy (checklist fixo dos critérios de aceitação do SPEC).
- `Documentos/regressao_harness_gemini.md` — paridade de comportamento entre os harnesses (Claude Code / Gemini CLI / Antigravity), não paridade funcional do app.
- `.claude/knowledge/` — base RAG de aprendizados/decisões técnicas, não resultados de teste.

Cada arquivo aqui deve registrar: o que foi testado, passos exatos reproduzidos, resultado (PASS/FAIL), evidência (prints/logs relevantes ou referência a eles) e, se FAIL, a causa raiz e a correção aplicada.
