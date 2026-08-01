# Harness espelhado para Gemini CLI e Google Antigravity

**Agent:** general-purpose (harness)
**Tipo:** decisao
**Data:** 2026-08-01

## O que foi feito
Espelhamento aditivo do harness agêntico `.claude/` + `CLAUDE.md` para os formatos do **Gemini CLI** e do **Google Antigravity**, sem alterar a fonte de verdade (`.claude/`, `CLAUDE.md`, `app/` intactos). Pesquisa das convenções atuais das duas ferramentas feita antes de escrever (fontes no mapping README).

### Arquivos criados
- `GEMINI.md` (raiz) — equivalente ao `CLAUDE.md`, adaptado; importa as rules via `@.agents/rules/...` e documenta o catálogo de agents + protocolo do orchestrator + GAPS.
- `.agents/agents/*.md` (8) — subagents nativos do Antigravity: orchestrator, rls-security, booking-engine, auth-guard, notifier, devops, qa, code-reviewer.
- `.agents/rules/*` (5, com subpastas frontend/backend/tests) — cópia verbatim das rules; workspace rules do Antigravity + importadas no GEMINI.md para o Gemini CLI.
- `.gemini/commands/*.toml` (8) — comandos customizados do Gemini CLI (`$ARGUMENTS` → `{{args}}`).
- `.agents/workflows/*.md` (8) — workflows do Antigravity espelhando os comandos.
- `.claude/knowledge/gemini-antigravity-harness.md` — mapping README (1:1 / adaptado / GAPS + URLs).
- `Documentos/regressao_harness_gemini.md` — checklist de paridade executável nas 3 ferramentas.

## Decisões de mapeamento
- **Orchestrator:** subagent nativo no Antigravity (`invoke_subagent`); no Gemini CLI vira persona no GEMINI.md + comandos TOML (delegação simulada por troca de papel — sem subagents nativos).
- **Model tiers:** opus/sonnet → `pro`; haiku (devops, qa) → `flash`. Gemini CLI usa o modelo global.
- **Tools:** array `tools` **omitido** do frontmatter dos subagents Antigravity (a doc avisa que nomes de tool não mapeados podem travar o processo, e não há lista oficial confirmada). Restrições declaradas em prosa → viram soft.
- **Rules no Gemini CLI:** carregadas por `@import` no GEMINI.md (não há auto-load de diretório); no Antigravity são nativas em `.agents/rules/`.

## GAPS / incertezas
- **GAP-1 (principal): hooks de bloqueio.** `.claude/hooks/**` (PreToolUse block-*, PostToolUse run-tests, Stop verify-tests) não têm equivalente em Gemini CLI nem Antigravity. Restrições ("nunca escreve código", "só SQL", "somente leitura", "não edita JSX", "só testes") passam a ser prompt-level (soft). TDD após edição / verificação ao encerrar deixam de ser automáticos.
- **GAP-2:** RAG local (`embed.ts` + `rag.db`, sqlite-vec + MiniLM) não replicado.
- **GAP-3:** sem spawn real de subagent no Gemini CLI (troca de papel do mesmo modelo).
- **GAP-4:** `squads/` não mapeado.
- **Incerteza 1:** pasta de workflows do Antigravity assumida como `.agents/workflows/` (doc não confirma o nome exato) — verificar na UI.
- **Incerteza 2:** semântica de `tools: []` no Antigravity (todas vs. nenhuma) — array omitido por segurança.
- **Incerteza 3:** `AGENTS.md` já existia no repo (intacto); GEMINI.md é o ponto de entrada canônico. Gemini CLI pode ser apontado a AGENTS.md via `context.fileName`.

## Observações
- Nada em `.claude/`, `CLAUDE.md` ou `app/` foi modificado.
- Este registro não foi indexado (embed) — a indexação será feita por outro agent.
