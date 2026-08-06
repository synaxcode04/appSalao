# Valor cheio riscado + economia nos cards de plano (owner e client)

**Agent:** session (orchestrator + general-purpose)
**Tipo:** bug
**Data:** 2026-08-06
**Status:** Aprovado para deploy — code-reviewer: 0 bloqueantes.

## Problema
Nos cards de plano (tela do dono e do cliente), o valor cheio riscado — o total que o cliente pagaria se comprasse cada serviço avulso — nunca aparecia. Só o preço do plano e, em alguns pontos, a linha de economia eram exibidos.

## Causa raiz
`computePlanSavings` (`app/src/utils/planSavings.js`) já retornava tanto `savings` quanto `fullValue`, mas os 3 pontos de consumo desestruturavam apenas `savings`, descartando `fullValue`. Bug puramente de renderização: o campo já estava calculado, o JSX simplesmente jogava fora. Nenhum defeito de cálculo.

## Solução
Sem tocar em `planSavings.js`. Nos 3 pontos de consumo passou-se a capturar também `fullValue` e a renderizar "De R$ X,XX" riscado acima do preço do plano, seguido da linha de economia já existente — exibido **apenas quando `fullValue > planPrice`** (evita mostrar valor cheio igual/menor que o preço do plano).

- Classes CSS novas: `.plan-full-value` (owner) e `.client-plan-card-full-value` (client) — `text-decoration: line-through` + cor apagada.

## Arquivos tocados
- `app/src/pages/owner/PlansManager.jsx` — card "Seus Planos" e prévia do wizard (etapa 3).
- `app/src/pages/client/ClientPlans.jsx` — cards de planos disponíveis.
- `app/src/index.css` — classes `.plan-full-value` e `.client-plan-card-full-value`.
- `app/src/__tests__/PlansManager.test.jsx` — 2 testes novos.
- `app/src/__tests__/ClientPlans.test.jsx` (novo) — 2 testes.

## Testes
Suíte completa: 144 testes passando.
