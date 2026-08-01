# Pendências — App Salão

Documento de pendências para retomar em sessões futuras. Cada item tem data de registro e contexto suficiente para retomar sem re-investigar.

### 2026-08-01 — Padronizar `is_active` vs `salons.status` no schema/documentação de suspensão de salão

- **Status:** aberta
- **Levantada por:** sub-agent `auth-guard`, ao final da sessão de 2026-08-01 (após resolver o redirect do `ProtectedRoute`, a nomenclatura is_active/status na documentação e criar o componente `SuspendedScreen`).
- **Domínio:** schema de banco (Supabase) + documentação.
- **Recomendação:** conduzir a decisão via sub-agent `rls-security`, por envolver schema de banco.

**Contexto:**
A coluna real usada hoje para bloquear um salão suspenso é `salons.status` (valores `'active'`/`'expired'`) combinada com `subscription_expires_at`. Isso está confirmado em `app/src/layouts/OwnerLayout.jsx` e `SalonLayout.jsx`. A coluna `is_active` existe de fato apenas na tabela `professionals` — contexto diferente, não é sobre suspensão de salão.

**Já corrigido na sessão de 2026-08-01** (documentação de agents/rules que citava `is_active` incorretamente para salão):

- `.claude/agents/auth-guard.md`
- `.agents/agents/auth-guard.md`
- `GEMINI.md`
- `AGENTS.md`
- `.opencode/agents/auth-guard.md`
- `.claude/agents/orchestrator.md`
- `.agents/agents/orchestrator.md`

**Ainda restam referências a `is_active`-para-salão NÃO tratadas** (deliberadamente fora de escopo daquela sessão, por serem domínio de schema/banco e não documentação de agent):

- `.claude/agents/rls-security.md` (+ espelhos em `.agents/` e `.opencode/`)
- `Documentos/PLAN.md` (ver Task 1.2 e Task 3.2, que mencionam a coluna `is_active` em `salons`)
- `.claude/skills/suspend-salon/SKILL.md` (inclui um passo SQL)
- `.claude/skills/smoke-prod/SKILL.md` (linha ~44)

**Decisão pendente:**
Escolher um dos dois caminhos:

1. Manter `is_active` como nome de coluna em algum ponto do schema real do Supabase — nesse caso a documentação estaria correta e seriam o código/testes que precisariam mudar; ou
2. Padronizar tudo (schema, skills, docs) para `salons.status`.

**Próximo passo:** acionar `rls-security` numa sessão futura para conduzir a decisão e aplicar a padronização escolhida. (Nesta sessão foi apenas registrado — nada implementado.)
