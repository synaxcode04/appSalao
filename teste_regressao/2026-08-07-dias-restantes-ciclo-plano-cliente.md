# Teste de Regressão — Dias restantes do ciclo no plano ativo do cliente

**Data:** 2026-08-07
**Commits:** `8bb6f79` (feature) → `5f026fe` (refactor: exporta função e testa a real) → `3a42602` (refactor: unifica constantes DAY_MS/CYCLE_MS)
**Ambiente:** Produção (`https://appsalao-psi.vercel.app`)

---

## O que foi testado

Card do plano ativo em `app/src/pages/client/ClientPlans.jsx` passou a exibir "Renova em X dia(s)", calculado a partir do ciclo rolante de 30 dias (`client_subscriptions.started_at`), reaproveitando a mesma janela já usada pela contagem de cota "X/Y no ciclo atual".

**Comportamento esperado (função `cycleDaysRemaining`, exportada do componente):**
- `started_at` = hoje − 10 dias → 20 dias restantes
- `started_at` = hoje − 29 dias → 1 dia restante
- `started_at` = hoje − 30 dias (ciclo já renovou) → 30 dias restantes
- `started_at` = hoje → 30 dias restantes

---

## Passos reproduzidos

1. Testes unitários (`app/src/__tests__/ClientPlans.test.jsx`) cobrindo os 4 casos acima, importando a função real do componente (não uma cópia da lógica) — corrigido depois que o code-reviewer apontou a duplicação como item IMPORTANTE.
2. Suíte completa rodada: 205/205 passando.
3. Deploy em produção + smoke test manual: card do plano ativo em `/s/:slug/perfil` (ou tela equivalente) confirmado exibindo o rótulo de dias restantes sem quebrar o layout existente (progresso por serviço, badge "Ativo", botão cancelar).

## Resultado

**PASS.** Sem regressão nos demais campos do card de plano. Nenhuma mudança em `subscription_plan_days`/`formatDays` (decisão em aberto não tocada).

## Observações

- Refatoração pós-review: `cycleDaysRemaining` e `computeCycleWindow` passaram a compartilhar `DAY_MS`/`CYCLE_MS` como constantes de módulo, eliminando duplicação sem alterar comportamento (confirmado pela mesma suíte).
- RAG: `.claude/knowledge/2026-08-07-dias-restantes-ciclo-plano-cliente.md`.
