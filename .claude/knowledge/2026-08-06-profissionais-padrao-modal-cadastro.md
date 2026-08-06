# Cadastro de profissionais no padrão modal

**Agent:** session (orchestrator + subagent claude)
**Tipo:** feature
**Data:** 2026-08-06

## Descrição

A página `app/src/pages/owner/ProfessionalsManager.jsx` foi refatorada de um formulário inline sempre-visível (sem edição) para o padrão modal de `ServicesManager.jsx`:

- Botão "Novo Profissional" (`btn-primary clients-toolbar` + ícone `Plus`) abre um `modal-overlay`/`modal-card` de criar/editar.
- Lista abaixo com botões: editar (`Edit2`, reabre o modal já preenchido), toggle ativo/inativo e excluir.
- `handleSave` faz UPDATE quando `editId` existe, senão INSERT com `is_active: true`.
- Preservados: `useOutletContext` para obter o salon, `react-hot-toast`, `toggleActive`, e `handleDelete` com `confirm`.

## Nota de padrão reutilizável

Cadastros do owner (Serviços, Profissionais) seguem o mesmo padrão modal com classes CSS compartilhadas:
`modal-overlay`, `modal-card`, `modal-title`, `modal-cancel`, `btn-primary`, `clients-toolbar`.
Replicar esse padrão para novos cadastros do painel do dono.

## Testes

`app/src/__tests__/ProfessionalsManager.test.jsx` cobre: abrir modal, editar preenchido, INSERT na criação, UPDATE na edição. Suíte 124/124.
