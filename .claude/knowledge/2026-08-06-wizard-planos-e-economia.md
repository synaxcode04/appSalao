# Wizard de 3 etapas no cadastro de planos + cálculo de economia

**Agent:** orchestrator (booking-engine + UI + code-reviewer)
**Tipo:** feature
**Data:** 2026-08-06
**Status:** Aprovado para deploy — code-reviewer: 0 bloqueantes (2ª rodada). "Aprovado para deploy: NÃO" formal, mas motivado só por débito técnico pré-existente fora do escopo (ver seção "Débito técnico" abaixo) — usuário decidiu prosseguir com commit.

## O que foi feito

- `app/src/utils/planSavings.js` (novo): função pura `computePlanSavings({ price, services })` — soma(quota × preço unitário) − preço do plano, com clamp em 0. Tolera preço em string, ignora serviço sem preço.
- `app/src/__tests__/planSavings.test.js` (novo): 9 testes.
- `app/src/pages/owner/PlansManager.jsx`: modal de criação/edição de plano virou wizard de 3 etapas:
  1. Nome, descrição, preço.
  2. Serviços com cota por ciclo de 30 dias + dias da semana (mantidos aqui, como já existiam antes).
  3. Prévia (como o cliente vê) + economia calculada, com botões Voltar/Avançar/Confirmar.
  - Navegação em slide via CSS puro (`transform: translateX`), sem lib nova.
  - Join de `loadPlans` passou a trazer `services(...price)` (antes só id/name).
- `app/src/pages/client/ClientPlans.jsx`: join de planos também passou a trazer `price` de cada serviço; nos cards de "planos disponíveis" (não em ativo/pendente, por decisão do usuário) exibe "Economize R$ X por mês" quando `savings > 0`.
- `app/src/index.css`: classes novas `.plan-wizard-*`, `.plan-preview*`, `.client-plan-card*`.

## Decisões tomadas com o usuário
- Rótulo da economia: "Economize R$ X por mês" (não "por ciclo"), mesmo a cota sendo por ciclo de 30 dias rolante.
- Economia exibida só nos planos disponíveis para assinar no lado do cliente — não em ativo/pendente.
- Dias da semana permanecem na etapa 2 do wizard (junto com serviços), não viraram etapa própria.

## Débito técnico identificado (NÃO corrigido nesta tarefa — fora de escopo)
O `code-reviewer`, ao revisar do zero (2ª rodada), achou 8 itens "importantes" de `style={{}}` inline com valores estáticos que deveriam ser classes CSS (regra de `.claude/rules/frontend/react.md`), mas em código **pré-existente**, não tocado por esta feature:
- `PlansManager.jsx`: barra de abas (linha ~460), `<form>` do modal (~501), elementos internos da prévia da etapa 3 (~619-648, o container virou classe mas os filhos não), lista "Seus Planos" (~690-734), aba "Assinantes" (~741-804).
- `ClientPlans.jsx`: cards de assinatura ativa (~280-352), cards de assinatura pendente (~357-393), modal de escolha de forma de pagamento (~466-514).

Usuário decidiu não corrigir agora porque: (a) não é bug, só organização; (b) o lado do cliente (`ClientPlans.jsx`) já vai ser mexido na próxima rodada de ajustes — melhor arrumar estilo junto. Retomar esse débito quando `ClientPlans.jsx` for revisitado, e considerar os itens do `PlansManager.jsx` numa limpeza futura de CSS.

## Testes
`npx vitest run` — 138/138 passando (13 arquivos), incluindo os 9 novos de `planSavings.test.js`. `PlansManager.test.jsx` (5 testes de named exports) não afetado.
