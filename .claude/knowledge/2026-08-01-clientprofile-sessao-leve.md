# ClientProfile migrado para sessão leve

**Agent:** auth-guard
**Tipo:** bug/feature
**Data:** 2026-08-01

## Problema

`ClientProfile.jsx` usava `profile` vindo de `supabase.auth.getSession()` via `useOutletContext`. Como o cliente leve não tem sessão Supabase Auth, `profile` era sempre `null`, prendendo a página no spinner `if (!profile) return <div>Carregando...</div>` (linha 114 original).

Além disso o componente fazia operações incompatíveis com o modelo leve:
- Escrevia na tabela `profiles` (não existe para cliente leve)
- Chamava `supabase.auth.updateUser()` para alterar e-mail
- Fazia upload de avatar vinculado a `profile.id`
- Logout via `supabase.auth.signOut()` em vez de limpar o localStorage

## O que mudou em `ClientProfile.jsx`

- Removida a dependência de `useOutletContext` / `profile`
- Fonte de identidade migrada para `useClientSession()` — exibe `clientSession.full_name` e `clientSession.phone`
- Guard substituído: `if (!clientSession) return null` (sem spinner infinito)
- Logout chama `logout()` do hook (remove `client_session:<slug>` do localStorage) e redireciona para `/s/:slug`
- Removidos: formulário de edição de `profiles`, campo de e-mail, `supabase.auth.updateUser`, upload de avatar (bucket `logos`/`profiles`)
- Mantida: seção de Notificações Push (OneSignal — independente de auth)

## Editar nome do cliente — pendente

A tabela `clients` é acessível apenas via `/api/client-identity`. O contrato atual expõe actions `lookup`, `create_or_get`, `link_to_salon`. **Não existe action `update`.**

Para habilitar edição do nome do cliente, o **devops** deve adicionar à Function:

```js
// action: 'update'
// body: { action: 'update', client_id, full_name }
// UPDATE clients SET full_name = $full_name WHERE id = $client_id
```

E então o `ClientProfile.jsx` pode ser atualizado para chamar essa action e atualizar `clientSession` via `setClientSession` (ou `loginByPhone` se o hook for estendido).

O comentário `// TODO (devops)` foi deixado inline no componente para rastreabilidade.

## Resultado dos testes

25 testes passando (exit 0). Nenhum teste novo adicionado — a migração é comportamental (remoção de código incompatível), não nova lógica testável de forma isolada.
