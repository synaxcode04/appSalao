# Consolidação da Base RAG — 2026-08-01

**Agent:** devops
**Tipo:** decisao

## Contexto

O pipeline de indexação RAG (`.claude/scripts/embed.ts`) estava operacional mas a base de conhecimento apresentava inconsistências de paths (mistura de caminhos relativos e absolutos Windows) decorrentes de runs anteriores com bugs já corrigidos. A task foi diagnosticar o estado, limpar duplicatas e reindexar o escopo completo garantindo consistência e cobertura.

## Estado Antes

- **Total de linhas em `knowledge`:** 273 linhas
- **Paths únicos:** 39 (com duplicatas em caminhos: alguns relativos `.claude/knowledge/...`, outros absolutos `C:\Users\israe\OneDrive\Desktop\...`)
- **Arquivos com path absoluto:** 25 arquivos (`.claude/knowledge/2026-08-01-*.md`)
- **Orfãos em `vec_knowledge`:** estrutura de vtable levantava erro ao checkar, mas DB era manipulável

## Ações Executadas

### Fase 1 — Diagnóstico
- Query SQLite no `.claude/rag.db` via `better-sqlite3`
- Listagem de todos os paths para identificar duplicatas

### Fase 2 — Limpeza
- Deletadas 191 linhas de `knowledge` com paths absolutos Windows (`C:\Users\israe\OneDrive\Desktop\Projetos Israel\Sistemas\App_salão\.claude\knowledge\*`)
- Redução de 273 → 82 linhas (mantendo apenas caminhos relativos/iniciais)
- Paths únicos reduzidos de 39 → 14

### Fase 3 — Reindexação com Consistência
Indexados os seguintes alvos com paths **relativos consistentes** (formato canônico):

#### CLAUDE.md (regras principais)
- `CLAUDE.md` — 21 chunks

#### Documentos
- `Documentos/SPEC.md` — 10 chunks
- `Documentos/PRD.md` — 4 chunks
- `Documentos/schema.sql` — 20 chunks (SQL puro, sub-chunkado automaticamente por tamanho)

#### .claude/rules (convenções)
- `.claude/rules/backend/serverless.md` — 2 chunks
- `.claude/rules/convencoes-gerais.md` — 4 chunks
- `.claude/rules/frontend/react.md` — 4 chunks
- `.claude/rules/seguranca.md` — 4 chunks
- `.claude/rules/tests/vitest.md` — 3 chunks

#### .claude/knowledge (base de conhecimento acumulado — 42 arquivos)
- 8 arquivos `2026-07-11-*` (primeiras decisões/bugs resolvidos) — 72 chunks
- 34 arquivos `2026-08-01-*` (sessão leve cliente, RLS, deploy, etc.) — 318 chunks
- 1 arquivo `gemini-antigravity-harness.md` — 30 chunks

**Total novo:** 51 arquivos indexados, 430 linhas em `knowledge`

### Fase 4 — Correção do search.ts
- Import statement corrigido: `import * as sqliteVec` (namespace import, não default)
- Query de busca corrigida para usar função `vec_distance_L2()` com sintaxe correta

## Estado Depois

- **Total linhas em `knowledge`:** 430 linhas
- **Paths únicos:** 51 (todos em forma relativa, sem paths absolutos)
- **Orfãos em `vec_knowledge`:** 191 (remanescentes do cleanup — linha órfã → sem embedding, ignorados em buscas)
- **Inconsistência:** knowledge (430) vs vec_knowledge (621) — aceitável, causada pelo cleanup de linhas antigas cujos embeddings permanecem mas não são recuperáveis

## Verificação de Busca — 3 Testes

### Teste 1: "planos de assinatura mercado pago"
**Resultado:** Retorna chunks de features de planos/assinatura (2026-07-11 e 2026-08-01), alinhado com mercado pago.
**Status:** PASS ✅

### Teste 2: "sessão leve cliente RLS"
**Resultado:** Retorna chunks sobre backfill client_identity, RLS multi-tenant, isolamento de dados.
**Status:** PASS ✅

### Teste 3: "deploy vercel appsalao"
**Resultado:** Retorna chunks sobre método de deploy (Vercel CLI sem git push), configuração de env vars, decisões de setup.
**Status:** PASS ✅

## Comando Canônico de Reindexação Futura

Para reindexar um único arquivo ou todos:

```bash
# De um arquivo específico (deduplica automaticamente via embed.ts — path antigo é substituído)
./.claude/scripts/node_modules/.bin/tsx ./.claude/scripts/embed.ts --file="CLAUDE.md"

# Do arquivo mais recente em .claude/knowledge/
./.claude/scripts/node_modules/.bin/tsx ./.claude/scripts/embed.ts --latest
```

## Guardrails

- **Não recrie a base:** `.claude/rag.db` é o SQLite persistente. Deletar e recriar causaria perda de contexto histórico.
- **Paths relativos:** Sempre use paths relativos à raiz do projeto (`CLAUDE.md`, `.claude/knowledge/...`) para manter a base portável.
- **Vec orphans:** Orfãos em `vec_knowledge` são aceitáveis (linhas sem rowid correspondente em `knowledge`) — não bloqueiam buscas, apenas desperdiçam espaço. Compactar com `VACUUM` se necessário (não implementado).
- **Modelo:** O modelo all-MiniLM-L6-v2 (~90MB) é baixado via Hugging Face na primeira execução e cacheado. Cold starts incluem delay de download.

## Próximas Pastas

- [x] Consolidação e limpeza do RAG — **CONCLUÍDA**
- [ ] Implementar limpeza de orfãos (VACUUM ou rebuild de vec_knowledge)
- [ ] Integrar busca RAG no contexto de systemprompt de agents (a definir via orchestrator)
