---
name: new-owner-page
description: Cria o scaffold de uma nova página no painel do proprietário, registrando a rota em App.jsx e o item de menu em OwnerLayout.jsx automaticamente.
---

## O que esta skill faz

Dado o nome da nova página, cria o arquivo em `pages/owner/`, registra a rota em `App.jsx` dentro do bloco `/painel` e adiciona o link de navegação em `OwnerLayout.jsx`. Nenhuma lógica de negócio — só estrutura.

## Convenções obrigatórias (do CLAUDE.md)

- Arquivo: PascalCase em `app/src/pages/owner/NomeDaPagina.jsx`
- Rota: kebab-case, aninhada em `/painel/nome-da-rota`
- Export: `export default function NomeDaPagina()`
- Sem prop-types, sem TypeScript, sem comentários óbvios

## Instruções

1. Leia `app/src/App.jsx` para entender o bloco de rotas do `/painel`.
2. Leia `app/src/layouts/OwnerLayout.jsx` para entender como o menu de navegação é montado.
3. Crie `app/src/pages/owner/NomeDaPagina.jsx` com estrutura mínima:

```jsx
export default function NomeDaPagina() {
  return (
    <div>
      <h1>Nome da Página</h1>
    </div>
  )
}
```

4. Adicione a importação e rota em `App.jsx`:
```jsx
import NomeDaPagina from './pages/owner/NomeDaPagina'
// dentro do bloco <Route path="/painel">:
<Route path="nome-da-rota" element={<NomeDaPagina />} />
```

5. Adicione o link no menu de `OwnerLayout.jsx` seguindo o mesmo padrão visual dos itens existentes (ícone Lucide + label + `NavLink`).

## Exemplo

**Input:** "Crie a página de Clientes no painel do proprietário"

**Output:**
- `app/src/pages/owner/ClientesManager.jsx` criado com estrutura mínima
- `App.jsx` com `<Route path="clientes" element={<ClientesManager />} />`
- `OwnerLayout.jsx` com `<NavLink to="/painel/clientes">Clientes</NavLink>` no menu

## Quando NÃO usar

- Não use para páginas do cliente (`/cliente`) ou do admin (`/admin`) — cada área tem seu próprio layout.
- Não use se a página já existe — edite o arquivo existente diretamente.
- Não implemente a lógica da página nesta skill — o objetivo é só criar o scaffold navegável.
