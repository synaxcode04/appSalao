**Agent:** session (orchestrator) + general-purpose (implementação) + code-reviewer
**Tipo:** feature

# Layout do card de plano de assinatura (listagem do dono) — ações movidas para o cabeçalho

## Contexto / pedido

O dono reclamou que, na tela "Planos de Assinatura" → aba "Planos" → card "Seus Planos" (`app/src/pages/owner/PlansManager.jsx`), o texto de cada card ficava "espremido" numa coluna estreita enquanto sobrava espaço em branco.

## Causa

A estrutura do card era um flex `justify-content: space-between` com a coluna de conteúdo (`flex:1`) dividindo a largura horizontal com uma coluna FIXA lateral dos 3 botões de ação (toggle ativar, editar, excluir, com `flexShrink:0`). Essa coluna lateral estreitava o texto (descrição, preço, serviços/cotas, dias, economia, valor avulso).

## Solução aplicada

- Moveu os 3 botões de ação da coluna lateral para o CABEÇALHO do card, ao lado do título do plano (novo `.plan-card-header` com `justify-content: space-between`).
- O corpo de texto passou a ocupar a largura TOTAL do card, com respiro.
- Extraiu estilos inline estáticos para classes CSS em `app/src/index.css` (`.plan-card`, `.plan-card-header`/`-title`, `.plan-card-inactive-badge`, `.plan-card-actions`, `.plan-card-action-toggle/-edit/-delete`), mantendo inline apenas valores dinâmicos (`opacity` do plano inativo, `color` do toggle dependente de `plan.is_active`).
- Acessibilidade: adicionado `title="Editar plano"` e `title="Excluir plano"` aos botões (o toggle já tinha).

## Escopo / restrições respeitadas

Mudança puramente visual — nenhuma lógica de negócio, query Supabase ou handler alterado. Sem framework de UI externo, mobile-first preservado (~360px), sem estrutura nova de pastas/config. Aba "Assinantes" e wizard/modal não tocados.

## Validação

Testes `npm run test -- PlansManager` → 10/10 passaram. Code-reviewer: 0 bloqueantes, 0 importantes, "Aprovado para deploy: SIM". Commit local eb708ec na branch dev (sem push).
