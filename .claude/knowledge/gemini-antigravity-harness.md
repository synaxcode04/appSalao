# Mapeamento do harness `.claude/` → Gemini CLI + Google Antigravity

**Criado em:** 2026-08-01
**Objetivo:** espelhar o harness agêntico do Claude Code (`.claude/` + `CLAUDE.md`) para formatos que o **Gemini CLI** e o **Google Antigravity** consomem, de forma **aditiva** (nada em `.claude/` ou `CLAUDE.md` foi alterado — continuam sendo a fonte de verdade).

Este documento é para auditar a paridade. Ele lista o que ficou **1:1**, o que foi **adaptado** e os **GAPS** (com destaque para hooks).

---

## Como cada ferramenta descobre a configuração (resumo da pesquisa)

### Gemini CLI
- **Contexto do projeto:** `GEMINI.md` na raiz, carregado hierarquicamente (global `~/.gemini/GEMINI.md` + raiz do projeto + por diretório), tudo concatenado na "memória". Suporta **imports** com `@caminho/arquivo.md`. O nome do arquivo é configurável em `settings.json` via `context.fileName` — pode apontar para `AGENTS.md` (portabilidade cross-tool).
- **Comandos customizados (slash):** arquivos `.toml` em `.gemini/commands/` (projeto) ou `~/.gemini/commands/` (global). Subdiretórios viram namespaces (`git/commit.toml` → `/git:commit`). Campos: `prompt` (obrigatório), `description` (opcional). Argumentos via `{{args}}`; injeção de shell `!{...}`; injeção de arquivo `@{...}`. Recarregar: `/commands reload`.
- **Subagents:** **não existem** como conceito nativo no Gemini CLI.
- **Hooks:** **não existem** hooks de bloqueio determinístico de ferramentas.

### Google Antigravity
- **Regras (rules):** workspace em `.agents/rules/` (compat. `.agent/rules/`); global em `~/.gemini/GEMINI.md`. Markdown, máx. 12.000 caracteres, com 4 modos de ativação: **Manual** (@mention), **Always On**, **Model Decision** (pela descrição em linguagem natural) e **Glob** (por padrão de arquivo). Suportam referência a outros arquivos via `@filename`.
- **Workflows:** Markdown (máx. 12.000 caracteres), com título, descrição e passos; invocados por `/nome-workflow`; podem chamar outros workflows. Global e por workspace, armazenados junto às regras.
- **Subagents (nativo!):** definidos em Markdown com YAML frontmatter em `.agents/agents/<nome>.md` (ou `.agents/agents/<nome>/agent.md`); global em `~/.gemini/config/agents/...`. Frontmatter: `name`, `description` (guia de seleção), `tools` (lista permitida), `model` (`inherit`/`flash`/`pro`), `subagent` (bool), `mainAgent` (bool), `commandExecutionPolicy`, `skills`/`plugins`. O corpo após `---` é o system prompt. Invocação via `invoke_subagent`; limite de 10 níveis de aninhamento. **Aviso da doc:** nomes de tools não mapeados podem travar o processo.
- **AGENTS.md:** a doc de rules/workflows do Antigravity **não menciona** suporte a `AGENTS.md` (só o Gemini CLI o suporta via `context.fileName`).
- **Hooks:** **não há** hooks de bloqueio determinístico equivalentes aos do Claude Code.

**Fontes consultadas:**
- Gemini CLI — Custom commands: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md
- Gemini CLI — Custom slash commands (Google Cloud Blog): https://cloud.google.com/blog/topics/developers-practitioners/gemini-cli-custom-slash-commands
- Gemini CLI — GEMINI.md context files: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
- Gemini CLI — Memory management: https://geminicli.com/docs/cli/tutorials/memory-management/
- Antigravity — Rules & Workflows: https://antigravity.google/docs/rules-workflows
- Antigravity — Subagents: https://antigravity.google/docs/subagents
- Antigravity — Multi-agent orchestration (Google Cloud Community): https://medium.com/google-cloud/mastering-multi-agent-orchestration-in-google-antigravity-2e73500d25fb

---

## Arquivos criados (todos aditivos)

| Origem (`.claude/` / raiz) | Destino Gemini CLI | Destino Antigravity |
|----------------------------|--------------------|---------------------|
| `CLAUDE.md` | `GEMINI.md` (raiz) | `GEMINI.md` (raiz) serve de contexto; regras em `.agents/rules/` |
| `.claude/agents/orchestrator.md` | Persona em `GEMINI.md` + comandos `.gemini/commands/*.toml` | `.agents/agents/orchestrator.md` (subagent nativo) |
| `.claude/agents/{rls-security,booking-engine,auth-guard,notifier,devops,qa,code-reviewer}.md` | Personas no catálogo do `GEMINI.md` | `.agents/agents/*.md` (subagents nativos) |
| `.claude/rules/*` (5 arquivos, com subpastas) | `@import` no `GEMINI.md` | `.agents/rules/*` (mesma estrutura) |
| `.claude/commands/*.md` (8) | `.gemini/commands/*.toml` (8) | `.agents/workflows/*.md` (8) |

---

## O que ficou 1:1

- **Conteúdo das rules** — copiado verbatim para `.agents/rules/` (mesma árvore: `convencoes-gerais.md`, `seguranca.md`, `frontend/react.md`, `backend/serverless.md`, `tests/vitest.md`). No Gemini CLI são carregadas via `@import` no `GEMINI.md`; no Antigravity são workspace rules nativas.
- **Papel, escopo e restrições de cada sub-agent** — traduzidos integralmente para `.agents/agents/*.md`. O Antigravity tem subagents nativos + `invoke_subagent`, então o modelo de delegação do orchestrator é reproduzido quase 1:1.
- **Fluxo dos slash-commands** — cada `.claude/commands/*.md` virou um `.gemini/commands/*.toml` (Gemini CLI) e um `.agents/workflows/*.md` (Antigravity). `$ARGUMENTS` → `{{args}}` no TOML; nos workflows o argumento é o texto do pedido.
- **Conteúdo do CLAUDE.md** (stack, estrutura, como rodar, padrões, TDD, "nunca fazer", decisões em aberto) — reproduzido no `GEMINI.md`.

## O que foi adaptado (e por quê)

1. **Orchestrator no Gemini CLI = persona, não subagent.** O Gemini CLI não tem subagents nativos. Solução: o catálogo de agents e o protocolo do orchestrator vivem dentro do `GEMINI.md` (sempre em contexto), e os comandos `.gemini/commands/*.toml` instruem o modelo a "assumir o papel do orchestrator". A delegação é **simulada por prompt** (o mesmo modelo troca de papel), não por spawn real de subagent. No **Antigravity** a delegação é real via `invoke_subagent`.
2. **Model tiers.** Claude usa ids (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`). Antigravity usa tiers `inherit`/`flash`/`pro`. Mapeamento aplicado: opus/sonnet → `pro`; haiku → `flash` (`devops`, `qa`). O Gemini CLI usa o modelo configurado globalmente — sem seleção por agent.
3. **Restrição de ferramentas em prosa, não em frontmatter.** A doc do Antigravity avisa que **nomes de tools não mapeados podem travar o processo**. Como não há uma lista oficial confirmada de identificadores de tools do Antigravity, **omiti o array `tools`** do frontmatter dos subagents e declarei as ferramentas permitidas em prosa dentro de cada agent. Consequência: a restrição vira **soft** (o modelo deve respeitá-la), não uma barreira imposta pelo runtime. Ver GAP 1.
4. **Rules carregadas por `@import` no Gemini CLI.** O Gemini CLI não auto-carrega um diretório de rules; carrega o `GEMINI.md`. Por isso os 5 arquivos de `.agents/rules/` são importados explicitamente no `GEMINI.md` via `@.agents/rules/...`. No Antigravity, `.agents/rules/` é nativo (ative "Always On" para paridade com o carregamento automático do Claude).

---

## GAPS e incertezas (não têm equivalente 1:1)

### GAP 1 — Hooks de bloqueio determinístico (o mais importante)
`.claude/hooks/**` contém scripts shell que o Claude Code executa como **barreiras rígidas**, independentes do julgamento do modelo:
- `PreToolUse` que **bloqueia** Write/Edit/Bash (ex.: `orchestrator/block-writes.sh`, `rls-security/block-non-sql-writes.sh`, `code-reviewer/block-all-writes.sh`, `devops/block-jsx-edits.sh`, `devops/block-vercel-deploy.sh`, `qa/block-code-changes.sh`, `*/block-dangerous-bash.sh`).
- `PostToolUse` que **roda testes após cada edição** (`*/run-tests-after-edit.sh`).
- `Stop` que **verifica testes ao encerrar** (`*/verify-tests-on-stop.sh`).

**Nem o Gemini CLI nem o Antigravity têm hooks de bloqueio equivalentes.** Consequências:
- As restrições "nunca escreva código" (orchestrator), "só SQL" (rls-security), "somente leitura" (code-reviewer), "nunca edite JSX / nunca faça deploy" (devops), "só comandos de teste" (qa) passam a depender do **cumprimento pelo modelo** (prompt-level), documentado em cada `.agents/agents/*.md` num bloco "Restrição sem hook".
- Rodar testes após edição e verificar testes ao encerrar deixa de ser automático — cada agent recebeu a instrução explícita de rodar `cd app && npm run test:run` manualmente.
- **Recomendação de mitigação:** no Antigravity, restringir de fato as ferramentas via frontmatter `tools` **se/quando** a lista oficial de identificadores for confirmada; e usar `commandExecutionPolicy` mais restritiva para agents somente-leitura. No Gemini CLI, considerar `tools.exclude`/allowlist em `settings.json` (a confirmar) para negar Write/Shell a sessões de revisão.

### GAP 2 — RAG local (`.claude/scripts/embed.ts` + `.claude/rag.db`)
O protocolo do orchestrator consulta e registra conhecimento numa base vetorial local (sqlite-vec + embeddings `Xenova/all-MiniLM-L6-v2`). Isso é específico do fluxo Claude e **não foi replicado**. O `GEMINI.md`/subagents mantêm a instrução de registrar decisões em `.claude/knowledge/`, mas a indexação semântica e a consulta automática não existem no Gemini/Antigravity.

### GAP 3 — Spawn real de subagent no Gemini CLI
Não há subagents nativos no Gemini CLI. A "delegação" é troca de papel do mesmo modelo (prompt). Perde-se o isolamento de contexto e o model-por-agent que existem no Claude e no Antigravity.

### GAP 4 — `squads/` (multi-agent squads)
O orchestrator do Claude referencia uma pasta `squads/` (formato `squad.yaml` com pipeline/checkpoints). Isso não tem equivalente e **não foi mapeado** — fica fora do escopo deste harness.

### Incerteza 1 — Pasta de workflows do Antigravity
A doc afirma que workflows ficam "junto às regras", mas **não confirma explicitamente** o nome da subpasta. Usei `.agents/workflows/` por inferência. **Verificar na UI do Antigravity** (ela também permite criar workflows visualmente) e mover os arquivos se a pasta correta for outra. Os arquivos são markdown inofensivos se a pasta estiver errada — só não auto-registram.

### Incerteza 2 — Semântica de `tools: []` no Antigravity
A tabela da doc indica default `tools = []`. Não está claro se `[]` significa "todas herdadas" ou "nenhuma". Por segurança, o array foi omitido (não definido como `[]`). Confirmar antes de endurecer as restrições.

### Incerteza 3 — `AGENTS.md` já existente no repo
O repo já tinha um `AGENTS.md` (regras por submódulo do SPEC), independente deste trabalho. O Gemini CLI pode ser apontado para ele via `context.fileName`, mas por padrão lê `GEMINI.md`. Mantive `AGENTS.md` intacto; `GEMINI.md` é o ponto de entrada canônico deste harness. Se quiser que o Gemini CLI carregue ambos, use imports ou ajuste `context.fileName`.

---

## Checklist de verificação de paridade
Ver `Documentos/regressao_harness_gemini.md` — roteiro executável em Claude Code e em Gemini/Antigravity para confirmar que orchestrator e sub-agents se comportam de forma equivalente (e quais critérios herdam os GAPS acima).
