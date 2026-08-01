# Menu e rota de Clientes no painel do owner

- **Data:** 2026-08-01
- **Agent:** general-purpose
- **Tipo:** bug/feature (verificação)

## Contexto
Usuário reportou não encontrar onde cadastrar cliente: o menu lateral do
`OwnerLayout` supostamente não teria item para a tela `ClientsManager`
(`/painel/clientes`).

## O que faltava
Nada. Na verificação, tanto a rota quanto o item de menu **já estavam
registrados** corretamente:

- `app/src/App.jsx`
  - import: `import ClientsManager from './pages/owner/ClientsManager'` (linha 14)
  - rota filha aninhada em `/painel` (dentro do `ProtectedRoute requiredRole="owner"` + `OwnerLayout`):
    `<Route path="clientes" element={<ClientsManager />} />` (linha 93) → path efetivo `/painel/clientes`
- `app/src/layouts/OwnerLayout.jsx`
  - item dentro do submenu "Cadastros" (linhas 154-157), com ícone `UserPlus`,
    espelhando Serviços/Profissionais/Horários
  - o estado `isCadastrosOpen` já considera `/clientes` no cálculo inicial (linha 18)

## Markup do item de menu (já presente)
```jsx
<NavLink to="/painel/clientes" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} onClick={handleNavClick}>
  <UserPlus size={18} />
  <span>Clientes</span>
</NavLink>
```

## Conclusão
Código já correto — nenhuma alteração necessária. Se o usuário ainda não vê o
item, a causa provável é cache do bundle/PWA (service worker) servindo build
antigo. Recomendação: hard refresh / rebuild, não alteração de código.
