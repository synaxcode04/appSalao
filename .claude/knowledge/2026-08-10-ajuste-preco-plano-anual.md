**Agent:** session (orchestrator + claude + code-reviewer)
**Tipo:** decisao
**Data:** 2026-08-10

# Ajuste de preço — Plano Anual

Pedido do usuário para reprecificar o Plano Anual do appSalão.

- **Valor antigo:** R$ 299,00/ano (~R$24,92/mês), texto "Pague 10, ganhe 2".
- **Valor novo:** R$ 262,80/ano (~R$21,90/mês), texto "Pague 9, ganhe 3", explicação "Equivale a 9 mensalidades com 3 meses grátis (~R$ 21,90/mês)".

## Escopo — consistência entre 3 camadas
- **Vitrine:** `app/src/pages/Welcome.jsx` — bloco do Plano Anual (preço + textos).
- **Checkout:** `app/src/pages/Register.jsx` — array `PLANOS`.
- **Cobrança real (Mercado Pago):** `app/api/criar-preferencia.js` — `PLANS_MAP`, `unit_price` 262.80.

## Não alterado
- Semestral (~R$24,92/mês) e Mensal intactos.
- Selo "Mais vantajoso" não foi tocado.

## Nota de cuidado (armadilha futura)
O valor "~R$24,92/mês" aparece nos blocos **Semestral E Anual** em `Welcome.jsx`. Em mudanças futuras, alterar somente o do bloco Anual — não confundir com o do Semestral.

**Status:** Aprovado pelo code-reviewer para deploy: SIM. Commit local realizado.
