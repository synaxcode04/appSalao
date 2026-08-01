---
name: suspend-salon
description: Implementa ou testa o fluxo de suspensão e reativação de licença de salão, cobrindo o campo is_active no banco, o guard no OwnerLayout e o bloqueio na página pública do cliente.
---

## O que esta skill faz

Verifica se o controle de licenças está implementado corretamente nos três pontos onde `is_active` deve ser verificado, e gera o código ou SQL faltante.

## Os três pontos de verificação

1. **Banco de dados** — coluna `is_active BOOLEAN DEFAULT true` na tabela `salons`
2. **Painel do proprietário** — `OwnerLayout.jsx` bloqueia acesso se `salon.is_active === false`
3. **Página pública do cliente** — `SalonDetails.jsx` exibe `<SuspendedScreen />` se `salon.is_active === false`

## Instruções

### Passo 1 — Verificar o banco
Leia `Documentos/schema.sql`. Se `is_active` não existir na tabela `salons`, gere:
```sql
ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;
```
Salve em `Documentos/rls_fix.sql` (ou appende se já existir).

### Passo 2 — Verificar o OwnerLayout
Leia `app/src/layouts/OwnerLayout.jsx`. O layout deve:
- Buscar o salão do usuário logado via Supabase logo após autenticação
- Se `salon.is_active === false`, renderizar `<SuspendedScreen />` e não renderizar `<Outlet />`

Se não estiver implementado, crie o código necessário.

### Passo 3 — Verificar o SalonDetails
Leia `app/src/pages/client/SalonDetails.jsx`. A página deve:
- Após buscar o salão pelo slug, checar `salon.is_active`
- Se `false`, renderizar `<SuspendedScreen />` e não renderizar `<BookingEngine />`

### Passo 4 — Verificar o SuspendedScreen
Se `app/src/components/SuspendedScreen.jsx` não existir, crie com estrutura mínima:
```jsx
export default function SuspendedScreen() {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h2>Salão indisponível</h2>
      <p>Este salão está temporariamente suspenso. Entre em contato com o responsável.</p>
    </div>
  )
}
```
> Visual final está em aberto no SPEC — implemente apenas o mínimo funcional.

### Passo 5 — Executar os testes
Rode `npm run test:run` e confirme que os testes de `SuspendedScreen` passam.

## Exemplo

**Input:** "Implemente o bloqueio de salão suspenso"

**Output:**
- SQL gerado para `is_active`
- `SuspendedScreen.jsx` criado
- `OwnerLayout.jsx` com verificação de `is_active`
- `SalonDetails.jsx` com verificação de `is_active`
- Testes passando

## Quando NÃO usar

- Não use para desativar um profissional específico — o campo `is_active` em `professionals` é independente e já existe.
- Não use para implementar a cobrança do plano — o pagamento é externo ao sistema (ver SPEC).
- Não decida o visual final do `SuspendedScreen` — isso está marcado como decisão em aberto no SPEC.
