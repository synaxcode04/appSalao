# Sessão Leve do Cliente — Opção 4 implementada

**Agent:** auth-guard
**Tipo:** feature
**Data:** 2026-08-01
**Fase:** 3 (mecanismo de sessão leve + guard ClientRoute)

## Descrição

Implementação do mecanismo de identidade leve do cliente para o modelo "cliente fora de auth.users" (Opção A). O cliente se identifica por telefone via a Vercel Function `/api/client-identity` e tem sua sessão persistida em localStorage escopada por slug de salão.

## Arquivos criados

- `app/src/contexts/ClientSessionContext.jsx` — Context + Provider + hook `useClientSession`
- `app/src/components/ClientRoute.jsx` — Guard de rota para rotas de cliente (substitui `ProtectedRoute requiredRole="client"`)

## Arquivos alterados

- `app/src/App.jsx` — rotas `/s/:slug/agenda`, `/s/:slug/historico`, `/s/:slug/perfil` migraram de `<ProtectedRoute requiredRole="client">` para `<ClientRoute>`
- `app/src/layouts/SalonLayout.jsx` — adicionado `ClientSessionProvider` wrapping o layout; `showNav` agora considera `profile?.role === 'client' || !!clientSession`

## Context/hook

**Nome exportado:** `useClientSession` (do arquivo `app/src/contexts/ClientSessionContext.jsx`)

**Shape do valor retornado:**

```js
{
  clientSession: {
    client_id: string,   // UUID do cliente na tabela clients
    phone: string,       // telefone normalizado (apenas dígitos)
    full_name: string,   // nome completo
  } | null,
  loginByPhone: async (phone, full_name, salon_id) => clientSession,
  logout: () => void,
}
```

## Chave de localStorage

```
client_session:<slug>
```

Onde `<slug>` é o parâmetro de rota (ex: `abc123-uuid-nome-do-salao`). Cada contexto de salão tem chave independente — dois salões no mesmo dispositivo não conflitam.

## Guard ClientRoute

`app/src/components/ClientRoute.jsx`:
- Lê `clientSession` via `useClientSession()` (não chama `supabase.auth.getSession`)
- Se não há sessão → `<Navigate to="/s/:slug" replace />` (redireciona para SalonDetails)
- Se há sessão → `<Outlet context={outletContext} />` repassando o contexto do pai

## API que o booking-engine deve consumir (Fase 4)

Para obter o `client_id` da sessão leve ao criar agendamentos, o `BookingEngine` deve:

```js
import { useClientSession } from '../contexts/ClientSessionContext'

// dentro do componente ou em SalonDetails ao passar props:
const { clientSession } = useClientSession()
const clientId = clientSession?.client_id  // usar no INSERT de appointments
```

O `clientId` prop que `BookingEngine` já recebe deve ser migrado para usar `clientSession.client_id` em vez de `profile?.id`. Esta é a tarefa da Fase 4.

## Exceção de arquitetura

A regra "sem Context/Zustand/Redux" do `react.md` e `convencoes-gerais.md` é dispensada exclusivamente para `ClientSessionContext`. Esta exceção foi aprovada em 2026-08-01 pelo usuário. Não introduzir Context para outros domínios.

## Estado dos testes

25 testes passando (exit 0) após a implementação.
