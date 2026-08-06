# Economia mensal no card "Seus Planos" (painel do dono)

- **Agent:** frontend / general-purpose (via orchestrator)
- **Tipo:** bug
- **Data:** 2026-08-06

## Descrição
No painel do dono, o card "Seus Planos" (listagem de planos em `PlansManager.jsx`) não exibia a linha "Economize R$ X por mês", ao contrário do preview durante o cadastro/edição do plano. O dado necessário para calcular a economia (preços e serviços do plano) já vinha do join executado por `loadPlans` (`subscription_plan_services`), mas não era usado na renderização do card.

## Causa raiz
Lacuna de renderização, não de dados. O join de `loadPlans` já trazia `subscription_plan_services` com os serviços e cotas de cada plano, mas o card da listagem nunca montava o array de serviços nem chamava `computePlanSavings` — a linha de economia simplesmente não era renderizada. Não havia bug de query nem de cálculo; faltava exibir o resultado.

## Solução
No card de cada plano em `PlansManager.jsx`:
- Montar o array de serviços a partir de `subscription_plan_services` (já presente no objeto do plano vindo do join).
- Reusar a função existente `computePlanSavings` para calcular a economia mensal.
- Renderizar a linha condicionalmente a `savings > 0`, com a classe CSS já existente `.plan-preview-savings` (mesma usada no preview do wizard de cadastro).

Nenhum novo fetch, função de cálculo ou classe CSS — apenas reuso de `computePlanSavings` e `.plan-preview-savings`.

## Evidência / teste
Testes automatizados (positivo e negativo) em `app/src/__tests__/PlansManager.test.jsx`. Suite completa verde: 140 testes passando. Code-reviewer: "Aprovado para deploy: SIM", 0 bloqueantes.
