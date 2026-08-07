# Remoção do valor cheio riscado ("De R$ XXX,XX") nos planos de assinatura

**Agent:** session (orchestrator + claude impl + code-reviewer)
**Tipo:** decisao/feature
**Data:** 2026-08-06

## Descrição

O usuário viu em produção que o valor cheio riscado ("De R$ XXX,XX") exibido ao lado/antes do preço do plano de assinatura parecia um desconto e confundia o cliente. Decisão: remover apenas esse trecho riscado, mantendo a linha "Economize R$ X por mês" e a linha "Valor total avulso: R$ XXX,XX".

## Solução aplicada

- Removido o span `.client-plan-card-full-value` em `ClientPlans.jsx`.
- Removidos os `<p className="plan-full-value">De R$...</p>` em `PlansManager.jsx` (card "Seus Planos" e prévia do wizard etapa 3).
- `marginTop` dos preços fixado.
- CSS órfão `.plan-full-value` e `.client-plan-card-full-value` removido de `index.css` (a classe `.client-plan-card-full-value-line` foi preservada, pois segue em uso).
- Testes em `__tests__/PlansManager.test.jsx` e `__tests__/ClientPlans.test.jsx` ajustados para assertar AUSÊNCIA do riscado.
- `planSavings.js` NÃO foi tocado.

## Nota

Os arquivos de teste ficam em `app/src/__tests__/` (não em `app/src/pages/...`).
