# Decisões — Planos de assinatura

**Agent:** session / orchestrator
**Tipo:** decisao
**Data:** 2026-08-01

## Contexto

Feature "Cadastro de planos de assinatura" saiu de ideia futura (era "pacote de sessões /
assinatura" na lista de benchmarking) para EM DESENVOLVIMENTO. Registro das 4 decisões de
arquitetura tomadas em 2026-08-01.

Nomenclatura de tabelas do modelo de dados (migration escrita em paralelo):
`subscription_plans`, `subscription_plan_services`, `client_subscriptions`.

## As 4 decisões

1. **Sem integração de pagamento por ora** — "assinar" é registro administrativo, não cobrança.
   A integração com a API do Mercado Pago fica para uma feature futura SEPARADA. A tabela
   `client_subscriptions` foi desenhada como tabela própria justamente para acomodar um futuro
   `payment_status`/`gateway_ref` via `ADD COLUMN`, sem redesenho — mas esses campos NÃO existem
   agora.
2. **Ciclo de cota em janela rolante de 30 dias SEM acúmulo** — a cota de cada serviço no plano vale
   por um ciclo de 30 dias contados a partir da DATA DE ASSINATURA (`client_subscriptions.started_at`),
   NÃO por mês-calendário. Ex: assinou dia 15 → cota vale até o dia 15 do mês seguinte; reinicia a cada
   30 dias contados da data de assinatura. Não há saldo cumulativo entre ciclos (ex: plano de 4
   barbas/ciclo, usou 1 → o restante zera ao virar o ciclo). Implementado por **contagem derivada** dos
   agendamentos dentro do ciclo corrente, **sem job de reset**.
3. **Plano é por salão** — cada salão define seus próprios planos, preços, serviços e cotas
   mensais. Não é entidade global entre salões.
4. **Cancelamento pelo cliente OU pelo dono** — não há automação do sistema sobre agendamentos
   futuros já marcados com o plano no momento do cancelamento; fica para negociação humana fora do
   app. O dono gerencia manualmente esses agendamentos remanescentes no painel, e o sistema não o
   impede de agir sobre eles após o cancelamento.

## Regra de segurança derivada

- Assinar/cancelar plano do lado do **cliente** vai por Vercel Function `service_role` — NUNCA via
  RLS/`auth.uid()`, pois o cliente usa sessão leve (`auth.uid()` sempre NULL). Escrita do **dono**
  (cadastro de planos, cotas, preços) continua via Supabase client com sessão Auth real.
- Registrada como item em "Nunca fazer" (CLAUDE.md/GEMINI.md) e nas rules `convencoes-gerais.md`
  (`.claude/rules/` e `.agents/rules/`).

## Ponto de extensão futuro

- **Integração Mercado Pago**: feature separada. `client_subscriptions` já preparada para receber
  `payment_status`/`gateway_ref` via `ADD COLUMN`, sem redesenho do modelo.

## Item em aberto

- **Semântica de "dias por plano"** ainda NÃO foi definida — decisão em aberto (`[ ]` em CLAUDE.md
  e GEMINI.md).

## Arquivos de documentação atualizados

- `CLAUDE.md` — seção "Feature em desenvolvimento — Planos de assinatura", item em "Nunca fazer",
  "Ideias de features futuras" (marcada EM DESENVOLVIMENTO) e "Decisões em aberto".
- `GEMINI.md` — mesmas seções equivalentes (regra de paridade).
- `.claude/rules/convencoes-gerais.md` e `.agents/rules/convencoes-gerais.md` — nota sobre escrita
  de assinatura.

## Paridade de harness

Todas as edições em CLAUDE.md e `.claude/rules/**` foram replicadas em GEMINI.md e
`.agents/rules/**`, conforme a regra de paridade no topo do CLAUDE.md e o mapeamento em
`.claude/knowledge/gemini-antigravity-harness.md`.
