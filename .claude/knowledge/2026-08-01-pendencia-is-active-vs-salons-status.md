**Agent:** auth-guard (registrado via session/orchestrator)
**Tipo:** decisao

# Pendência: nomenclatura `is_active` vs `salons.status` para suspensão de salão

**Problema:** A documentação de vários agents/rules citava `is_active` como a coluna que bloqueia um salão suspenso. A coluna real usada hoje é `salons.status` (`'active'`/`'expired'`) combinada com `subscription_expires_at`, confirmado em `app/src/layouts/OwnerLayout.jsx` e `SalonLayout.jsx`. A coluna `is_active` existe de fato apenas em `professionals` — contexto diferente, não é sobre suspensão de salão.

**Já corrigido na sessão de 2026-08-01** (documentação de agents que citava `is_active` para salão): `.claude/agents/auth-guard.md`, `.agents/agents/auth-guard.md`, `GEMINI.md`, `AGENTS.md`, `.opencode/agents/auth-guard.md`, `.claude/agents/orchestrator.md`, `.agents/agents/orchestrator.md`.

**Ainda resta (fora de escopo da sessão, domínio de schema/banco):** `.claude/agents/rls-security.md` (+ espelhos `.agents/`/`.opencode/`), `Documentos/PLAN.md` (Task 1.2 e 3.2), `.claude/skills/suspend-salon/SKILL.md` (passo SQL), `.claude/skills/smoke-prod/SKILL.md` (linha ~44).

**Decisão pendente:** (1) manter `is_active` em algum ponto do schema real do Supabase — então o código/testes mudariam; ou (2) padronizar tudo (schema, skills, docs) para `salons.status`. A decisão deve ser conduzida pelo sub-agent `rls-security` numa sessão futura, por envolver schema de banco. Nesta sessão apenas registrado — nada implementado.
