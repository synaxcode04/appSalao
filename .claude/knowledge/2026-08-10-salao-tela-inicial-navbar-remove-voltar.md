---
**Agent:** ui-design (implementação), ux-design (avaliação), code-reviewer (gate) — orquestrado pela session
**Tipo:** decisao

# Tela inicial do salão (cliente): card de identidade vira navbar e botão "Voltar" removido

Rota: `/s/:slug` (módulo cliente), arquivo `app/src/pages/client/SalonDetails.jsx` + `app/src/client-ds.css`.

## Contexto / pedido
Primeira de uma série de mudanças de UI que o usuário está fazendo tela a tela no módulo cliente. Escopo travado nesta rodada só na tela inicial pública do salão (antes de abrir o BookingWizard).

## Decisões aplicadas
1. **Botão "Voltar" removido.** Era `<button onClick={() => navigate(-1)}>` no topo. O ux-design confirmou que `navigate(-1)` não tem destino útil na entrada pública via deep link (link de WhatsApp/Instagram/QR → histórico vazio ou sai do app) e é redundante com a bottom-nav quando há sessão. Heurísticas de Nielsen 3, 4 e 8. Import `ArrowLeft` (lucide) removido por ficar órfão.
2. **Card de identidade do salão convertido em navbar.** Antes era `.ds-card` (fundo branco, radius, padding de card). Agora é `.client-salon-navbar`: superfície `--ds-surface` sobre fundo `--ds-bg`, `margin: 0 -16px 20px` (quebra pras bordas, espelha `client-bottom-nav`), `padding: 14px 16px`, `border-bottom: 1px solid var(--ds-surface-2)` como separador. SEM border-radius, SEM box-shadow, SEM padding de card — elevação por camada de superfície conforme o Design System (design_system/Design System.dc.html).
3. **Badge "Salão Parceiro" REMOVIDO da navbar.** Decisão do ux-design + orquestração: é copy de marketing, não estado funcional; numa navbar de identidade vira ruído (Heurística 8 e spec de badge do DS). O usuário havia listado só avatar/nome/endereço como o que manter. ATENÇÃO: se o usuário quiser prova social ("Salão Parceiro"), deve ir para uma seção de conteúdo abaixo do header, não na navbar.
4. Mantidos avatar (logo `salon.logo_url` ou inicial fallback), nome (`<h1 class="salon-name">`, 16px/600 = Subtítulo do DS) e endereço (`<p class="salon-address">` com MapPin, `--ds-text-3`, 12px, ellipsis). Avatar inicial fallback 24px/600 (Título do DS).

## Convenção reforçada
Todos os estilos estáticos da navbar foram extraídos de `style={{}}` inline para classes em `client-ds.css` (`.client-salon-navbar`, `.salon-info`, `.salon-avatar img/span`, `.salon-address svg`, `.salon-nav-controls`, `.salon-nav-controls button`). Inline só ficou para valor dinâmico (`src` do logo). Tipografia toda on-scale do DS. Gate do code-reviewer exigiu 2 rodadas de correção (font-size 1.2rem/1.6rem off-scale → 1rem/1.5rem; inline estático → CSS) até aprovar.

## Pendências fora de escopo (NÃO corrigidas nesta rodada, apontadas pelo code-reviewer como pré-existentes)
- Vários `style={{}}` inline estáticos em SalonDetails.jsx (card de saudação, cards de serviços, paddingBottom 100px do wrapper).
- `.client-bottom-nav` tem `box-shadow` (viola flat/elevação por superfície do DS).
- Hex hardcoded fora de token: `#d8eedb` (`.ds-btn-soft:hover`), `#f8d3d6` (`.ds-btn-danger:hover`).
- Keyframes de motion levemente fora do DS (`scale(0.95)` vs 0.94; `translateX(20px)` vs 24px).
- Botão "Início" (linha ~85) só renderiza com `profile.role === 'client'`, mas cliente comum tem sessão leve (profile null) → nunca aparece pro público real. ux-design sugeriu reavaliar (usar `clientSession`) — decisão do usuário pendente.

## Resultado
Build OK. 215 testes (19 arquivos) passando. Nenhum teste de SalonDetails/módulo cliente quebrou.
