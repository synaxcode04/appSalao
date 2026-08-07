# Authorization Bearer em handleSubmit de ClientsManager

**Agent:** auth-guard  
**Tipo:** bug  
**Data:** 2026-08-07

## Problema

Em `app/src/pages/owner/ClientsManager.jsx`, o handler `handleSubmit` (formulário "Novo Cliente") chamava a action `link_to_salon` de `app/api/client-identity.js` **sem enviar o header Authorization Bearer**, mesmo que a sessão estivesse disponível.

Isso causava que a guarda de ownership do backend (validação `salons.owner_id === user.id` quando há Bearer) **não fosse exercida no fluxo real do painel do dono** — a verificação de ownership só era testada em testes unitários que simulavam manualmente o header.

## Causa Raiz

O método `handleSubmit` obtinha a sessão do Supabase via `supabase.auth.getSession()` (linhas 107) mas **não passava o `access_token` no header Authorization** do fetch para `/api/client-identity` (linhas 117–130).

Diferença com outros handlers no mesmo arquivo:
- `handleToggleActive` (linhas 175–234): já enviava `Authorization: Bearer ${session.access_token}`
- `handleEditSubmit` (linhas 250–308): já enviava `Authorization: Bearer ${session.access_token}`
- `handleSubmit` (linhas 99–173): **NÃO enviava**

## Solução Aplicada

1. **Adicionado guard de sessão ausente** (linhas 107–115):
   ```javascript
   const { data: { session } } = await supabase.auth.getSession()
   if (!session?.access_token) {
     setFeedback({
       type: 'error',
       text: 'Sua sessão expirou. Faça login novamente para cadastrar o cliente.'
     })
     return
   }
   ```

2. **Adicionado header Authorization Bearer** (linhas 120–121):
   ```javascript
   headers: {
     'Content-Type': 'application/json',
     'Authorization': `Bearer ${session.access_token}`
   }
   ```

3. **Backend não foi alterado** — a função `link_to_salon` em `app/api/client-identity.js` (linhas 248–351) já possuía a guarda:
   ```javascript
   if (hasBearer) {
     // Valida JWT e exige ownership: salons.owner_id === user.id
   }
   ```

## Testes

Adicionados 2 testes em `app/src/__tests__/ClientsManager.test.jsx`:

1. **`submete link_to_salon com header Authorization Bearer ao abrir modal e confirmar`** (linhas 176–205):
   - Abre o modal "Novo Cliente"
   - Preenche formulário
   - Clica em "Cadastrar Cliente"
   - Valida que o fetch foi chamado **com** `headers.Authorization: 'Bearer token-123'`
   - Valida que o body contém `action: 'link_to_salon'`

2. **`não chama fetch de link_to_salon e exibe erro quando sessão está ausente`** (linhas 207–235):
   - Mock da sessão retorna `null` (sessão expirada)
   - Abre modal, preenche, clica em "Cadastrar Cliente"
   - Valida que fetch **não foi chamado** (`expect(global.fetch).not.toHaveBeenCalled()`)
   - Valida que mensagem de erro é exibida (`/sessão expirou/i`)

Suíte completa: **171/171 testes passando**.

## Referências de Arquivos

- `app/src/pages/owner/ClientsManager.jsx` — handlers handleSubmit, handleToggleActive, handleEditSubmit (lines 99–308)
- `app/api/client-identity.js` — função link_to_salon com guarda de ownership (lines 248–351)
- `app/src/__tests__/ClientsManager.test.jsx` — 2 novos testes (lines 176–235)

## Impacto

- A validação de ownership (`salons.owner_id === user.id`) agora é exercida **em tempo real** quando o dono cadastra um cliente via painel (não só em testes).
- Qualquer tentativa de contorno (ex: falsificar `salon_id` na requisição) será bloqueada pelo backend com `403 Forbidden`.
