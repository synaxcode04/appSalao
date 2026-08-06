# 2026-08-06 — Economia mensal no card "Seus Planos" (painel do dono)

## O que foi testado
Exibição da linha "Economize R$ X por mês" no card de cada plano da listagem
"Seus Planos" do painel do dono (`PlansManager.jsx`), reusando `computePlanSavings`
e a classe CSS `.plan-preview-savings` já existentes no preview do wizard de cadastro.

## Contexto / bug corrigido
O card da listagem não exibia a economia mensal, embora o preview durante o
cadastro/edição já mostrasse. O dado (serviços e cotas via join `subscription_plan_services`)
já vinha de `loadPlans`; faltava apenas montar o array de serviços, chamar
`computePlanSavings` e renderizar a linha condicional a `savings > 0`.

## Passos reproduzidos
1. Abrir o painel do dono → seção "Planos" → card "Seus Planos".
2. Com um plano cujo somatório dos preços avulsos dos serviços × cotas seja maior
   que o preço do plano → o card deve exibir "Economize R$ X por mês".
3. Com um plano sem economia (`savings <= 0`) → a linha NÃO deve aparecer.

## Cobertura automatizada
`app/src/__tests__/PlansManager.test.jsx`:
- Caso positivo: plano com economia > 0 renderiza a linha com classe `.plan-preview-savings`.
- Caso negativo: plano sem economia não renderiza a linha.

## Resultado
**PASS** — testes automatizados (positivo e negativo) passam; suite completa verde
com **140 testes**. Code-reviewer: "Aprovado para deploy: SIM", 0 bloqueantes.

## Evidência
- `app/src/pages/owner/PlansManager.jsx` (renderização da economia no card).
- `app/src/__tests__/PlansManager.test.jsx` (testes positivo/negativo).
