---
agent: session (orchestrator + general-purpose + code-reviewer)
tipo: feature
data: 2026-08-06
---

# Linha "Valor total avulso" nos cards de plano de assinatura

**Agent:** session (orchestrator + general-purpose + code-reviewer)
**Tipo:** feature
**Data:** 2026-08-06

## Descrição

Pedido de UI para adicionar linha "Valor total avulso: R$ XXX,XX" abaixo da linha de economia nos cards de plano de assinatura, exibindo o `fullValue` (computePlanSavings) por extenso — sem substituir o valor riscado que já aparece ao lado do preço.

## Solução aplicada

- `ClientPlans.jsx` (card de planos disponíveis): `<p className="client-plan-card-full-value-line">` condicional a `fullValue > planPrice`.
- `PlansManager.jsx`: mesma linha no card "Seus Planos" e na prévia do wizard etapa 3 (condição `savingsData.fullValue > savingsData.planPrice`), mantendo paridade dono/cliente.
- Formatação de moeda padrão do projeto: `Number(fullValue).toFixed(2).replace('.', ',')`. `planSavings.js` NÃO foi alterado (fullValue já correto).
- Testes adicionados em `__tests__/ClientPlans.test.jsx` e `__tests__/PlansManager.test.jsx` cobrindo a nova linha. Todos passando (13 testes).
- Aprovado pelo code-reviewer sem bloqueantes.
