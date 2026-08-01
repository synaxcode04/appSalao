**Agent:** session (orchestrator + auth-guard + general)
**Tipo:** decisao
**Data:** 2026-08-01

## Resolução dos 3 achados da rodada Vitest/harness

### 1. Redirect do ProtectedRoute (no-session → /login)
Confirmado em `App.jsx`: rota `/` = `<Welcome />` (landing pública de marketing), `/login` = `<Login />`. Por isso `ProtectedRoute.jsx` linha 46 (caso SEM sessão) foi alterado de `<Navigate to="/" />` para `<Navigate to="/login" />`, alinhando com o critério do CLAUDE.md. A linha 48 (role incorreta, usuário JÁ autenticado) foi mantida em `/` de propósito: mandar um usuário logado para /login seria incorreto; "acesso negado" é satisfeito pela landing. Teste "sem sessão" em `ProtectedRoute.test.jsx` atualizado para assertar `/login`; testes de role errada mantêm fallback `/`.

### 2. Nomenclatura is_active → salons.status (documentação)
A coluna real de suspensão de licença em `salons` é `status` ('active'/'expired') + `subscription_expires_at`. `is_active` só existe em `professionals`. Docs de guard de suspensão corrigidos: `.claude/agents/auth-guard.md`, `.agents/agents/auth-guard.md`, `GEMINI.md`, `AGENTS.md`, `.opencode/agents/auth-guard.md`, e as linhas de catálogo em `.claude/agents/orchestrator.md` e `.agents/agents/orchestrator.md`. Também corrigida a referência de arquivo do guard público: é `SalonLayout.jsx`, não `SalonDetails.jsx`.
RESÍDUOS deliberadamente NÃO editados (domínio de migração de schema / rls-security — decisão separada pendente): `.claude/agents/rls-security.md` e espelhos, `Documentos/PLAN.md`, `.claude/skills/suspend-salon/SKILL.md` (inclui passo SQL + refs de guard), `.claude/skills/smoke-prod/SKILL.md` (linha 44), menções "1.2 RLS + is_active" nos orchestrators/opencode.

### 3. SuspendedScreen centralizado
Criado `app/src/components/SuspendedScreen.jsx` com prop `variant` ('owner' | 'public'), EXTRAINDO verbatim o texto/UI que já existia inline. Variante 'owner' (de OwnerLayout): h2 "Acesso Suspenso" + botão "Falar com o Suporte" (wa.me). Variante 'public' (de SalonLayout): h1 "Página Indisponível", sem botão. Condições de bloqueio (`status === 'expired' || subscription_expires_at < now`) permanecem nos layouts, inalteradas. Não houve decisão nova de copy/design — apenas centralização. Teste `SuspendedScreen.test.jsx` cobre as duas variantes (painel do dono + link público). Decisão em aberto do CLAUDE.md sobre o visual da tela de suspensão marcada como resolvida (por extração, não novo design). Suíte Vitest: 25/25 passando, exit 0.

### Pendências ainda em aberto
- Reagendamento (editar vs cancelar+criar) continua em aberto no CLAUDE.md.
- Nomenclatura is_active nos docs de rls-security/PLAN/skills segue pendente (depende de decisão de schema).
