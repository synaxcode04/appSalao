# ClientsManager — botões de ação padronizados com o padrão de Planos

**Agent:** session (orchestrator + claude)
**Tipo:** feature
**Data:** 2026-08-07

## Descrição
Os botões "Editar"/"Inativar" da tela de Clientes do dono (`ClientsManager.jsx`) estavam com layout quebrado no mobile porque a classe `.client-row-actions` não tinha CSS — eram dois `btn-secondary` de texto colados, sem espaçamento nem flex.

## Solução
Reusar o padrão de action buttons já existente na tela de Planos (`PlansManager.jsx`):
- Classes `plan-card-action-edit` e `plan-card-action-toggle` (definidas em `index.css`), com ícones lucide (`Edit2`, `ToggleRight`/`ToggleLeft`) e `title` acessível preservado.
- Adicionada regra `.client-row-actions` em `App.css` espelhando `.plan-card-actions` (flex, gap, flex-shrink, align-items).

Mudança puramente visual — sem lógica nova, sem framework externo de UI. Testes: 15/15 passando em `ClientsManager.test.jsx`.

## Arquivos
- `app/src/pages/owner/ClientsManager.jsx`
- `app/src/App.css`
