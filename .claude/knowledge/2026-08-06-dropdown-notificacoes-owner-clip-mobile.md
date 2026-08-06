# Dropdown de notificações do dono cortado/vazando no mobile

**Data:** 2026-08-06
**Agent:** general-purpose (via orchestrator)
**Tipo:** bug

## Problema
No painel do dono (OwnerLayout), o dropdown do sino de notificações aparecia
cortado ou vazando para fora da tela no mobile. Parte do conteúdo do painel
ficava inacessível (clipada) e o painel colava na borda direita da tela.

## Causa raiz
- O painel de notificações usava `position: absolute` e era clipado pelo
  ancestral `.dashboard-layout { overflow: hidden }` no mobile — o `overflow:
  hidden` do container corta qualquer filho posicionado que ultrapasse seus
  limites.
- Além disso, o `right: 0` colava o painel diretamente na borda direita da
  viewport, sem respiro lateral.

## Solução aplicada
- Extraídos os estilos inline para classes CSS dedicadas:
  `.owner-notif-dropdown` (painel) e `.owner-notif-list` (lista rolável).
- No mobile (`@media (max-width: 768px)`): `position: fixed` — remove o painel
  do fluxo de clipping do ancestral com `overflow: hidden`, ancorando-o à
  viewport.
- `z-index: 1300` — acima da bottom-nav e de modais.
- Respiro lateral de 12px nas bordas (não cola mais na borda direita).
- `max-height: min(350px, 70vh)` com scroll interno na lista, evitando que o
  painel ultrapasse a altura útil da tela.

## Arquivos tocados
- `app/src/layouts/OwnerLayout.jsx`
- `app/src/App.css`

## Status
Aprovado pelo code-reviewer: SIM, 0 bloqueantes.
