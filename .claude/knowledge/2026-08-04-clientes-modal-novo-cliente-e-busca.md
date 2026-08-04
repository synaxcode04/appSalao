# Clientes — botão "Novo Cliente" em modal e busca por nome/telefone

**Agent:** session (orchestrator + general-purpose)
**Tipo:** feature

## Descrição

Na tela de Clientes do painel do dono (`app/src/pages/owner/ClientsManager.jsx`), o formulário de cadastro inline foi convertido em um **modal** disparado por um botão verde "Novo Cliente" (`btn-primary`) posicionado no topo.

Abaixo do botão, a lista de clientes do salão ganhou um **campo de busca** que filtra:
- por **nome** — case-insensitive e acento-insensível;
- por **telefone** — comparação por dígitos (ignora máscara/formatação).

A filtragem é feita por uma função pura exportada `filterClients(clients, query)`, com teste unitário em `app/src/__tests__/ClientsManager.test.jsx`.

## Decisão de padrão

O projeto **não** tinha componente `Modal` reutilizável nem classes `.modal` no CSS. Seguiu-se o padrão de modal inline já existente em `ClientPlans.jsx`, porém foram criadas **classes CSS reutilizáveis** no final de `app/src/App.css`:

- `.modal-overlay`
- `.modal-card`
- `.modal-cancel`
- `.modal-title`
- `.clients-toolbar`
- `.clients-search`
- `.clients-list`
- `.client-row`
- `.client-row-name`
- `.client-badge-inactive`
- `.client-row-phone`
- `.client-row-note`
- `.clients-empty`

Motivo: a convenção do projeto exige que layout/visual fique em CSS — `style={{}}` inline apenas para valores dinâmicos calculados em JS (ex.: `opacity` condicional).

## Nota

Aprovado pelo code-reviewer (**0 bloqueantes / 0 importantes**) após 2 rodadas de correção, que moveram os inline styles estáticos para classes em `App.css`.
