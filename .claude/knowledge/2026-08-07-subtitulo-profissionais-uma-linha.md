**Agent:** session (orchestrator + claude + code-reviewer)
**Tipo:** feature

# Subtítulo da página "Gerenciar Profissionais" ajustado para uma linha

## Pedido
Trocar o subtítulo da tela "Gerenciar Profissionais" para o texto curto "Cadastro de profissionais para agendas independentes", garantindo que caiba em UMA linha no mobile (~375px).

## Solução aplicada
- `app/src/pages/owner/ProfessionalsManager.jsx` (linha ~118): texto do `<p className="subtitle">` trocado de "Cadastre os profissionais do seu salão para permitir agendas independentes." para "Cadastro de profissionais para agendas independentes".
- `app/src/App.css`: adicionada regra ESPECÍFICA `.professionals-header .subtitle { font-size: 0.8rem; white-space: nowrap; }` — a regra global `.subtitle` NÃO foi alterada (é compartilhada por outras páginas).

## Detalhes técnicos
- A 375px o `.page-content` mobile tem padding lateral pequeno (~8px/lado), deixando ~359px úteis. A 0.8rem (~12.8px) o texto de ~51 caracteres cabe em ~326-350px — borderline mas dentro do limite com `nowrap`.
- Padrão de escopar CSS por container (`.professionals-header .subtitle`) para não afetar `.subtitle` global — reutilizável para ajustes de copy semelhantes em outras páginas do owner.
- code-reviewer: Aprovado para deploy SIM. Sugestão não-bloqueante: considerar `overflow: hidden; text-overflow: ellipsis` para degradar com graça caso o texto estoure em zoom/acessibilidade.
- Commit local: 2125829 (branch dev, sem push).
