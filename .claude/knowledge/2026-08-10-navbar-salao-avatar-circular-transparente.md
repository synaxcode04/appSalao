---
**Agent:** ui-design (implementação) + code-reviewer (gate), via orchestrator
**Tipo:** decisao
**Data:** 2026-08-10
**Tela:** Tela inicial do salão — navbar de identidade (módulo cliente)

## Contexto / pedido
Reversão + ajuste na `.client-salon-navbar` de `app/src/pages/client/SalonDetails.jsx` (CSS em `app/src/client-ds.css`, seção "Salon Identity Navbar"). Duas mudanças na mesma navbar; escopo travado nesses dois arquivos — WizardHeader.jsx e regras `.ds-wizard-*` NÃO tocados.

## Mudança 1 — Revert do avatar (desfaz `2026-08-10-navbar-salao-avatar-quadrado-scissors.md`)
A rodada anterior trocou o avatar de círculo para quadrado arredondado verde com ícone Scissors. O usuário voltou atrás. Restaurado o estado anterior:
- JSX: fallback voltou de `<Scissors size={24} />` para `<span>{salon.name.charAt(0).toUpperCase()}</span>`; branch `<img src={salon.logo_url}>` inalterado; import de `Scissors` removido de SalonDetails.jsx.
- CSS `.salon-avatar`: `border-radius` `var(--ds-radius-sm)` → `50%`; `background` `var(--ds-primary)` → `var(--ds-primary-soft)`.
- Removida a regra `.salon-avatar svg { color: var(--ds-on-primary) }`.
- Restaurada `.salon-avatar span { color: var(--ds-primary); font-weight: 600; font-size: 1.5rem; }`.

## Mudança 2 — Navbar transparente e reposicionada
- Removidos `background: var(--ds-surface)` e `border-bottom: 1px solid var(--ds-surface-2)` → navbar transparente, sem separador visual.
- `margin: 0 -16px 20px` → `margin: 0 0 20px` (removido sangramento lateral negativo; alinha ao padding do conteúdo da página).
- Removido `padding: 14px 16px` (padding compensatório dependente do fundo).
- Mantidos `display:flex; gap:14px; align-items:center`.
- Comentário do bloco atualizado (não mais "Superfície --ds-surface"/"margem negativa"/"client-bottom-nav").

## Gate code-reviewer
Aprovado para deploy: SIM — 0 bloqueantes, 0 importantes. 2 sugestões opcionais NÃO aplicadas: (1) font-weight 700 na inicial para fixar classificação WCAG large-text — não aplicada porque 600 é o estado exato do revert pedido; (2) contraste do endereço (`--ds-text-3` sobre fundo da página ~2,6:1) — pré-existente, não introduzido por esta mudança.

## Resultado
215/215 testes passando, nenhum ajuste necessário (nenhum teste dependia de Scissors nem de classe de fundo/margin da navbar). Build limpo (3.85s, 2399 módulos). Não commitado — aguardando validação visual do usuário.
