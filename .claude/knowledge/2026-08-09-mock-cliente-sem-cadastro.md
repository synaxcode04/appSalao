---
**Agent:** general-purpose (via orchestrator)
**Tipo:** feature

# Mock dev-only: cenário de cliente SEM cadastro (fluxo de cliente novo)

## Contexto / objetivo
Extensão do mock dev-only descartável da casca do módulo cliente (`app/src/dev/clientMock.js`, ver `2026-08-09-mock-dev-only-modulo-cliente.md`). Antes, o mock reconhecia QUALQUER telefone no lookup e semeava automaticamente uma sessão leve logada — ou seja, só exercitava o fluxo de cliente JÁ cadastrado. Foi adicionado o cenário oposto: cliente que ainda não tem cadastro no salão, para testar o wizard de cliente novo (`ClientIdentityForm` dentro do `BookingEngine`, rota `/s/:slug`): pede telefone → não encontra → pede nome + data de nascimento opcional.

## O que mudou (só o mock dev-only; nenhum código de produção)
1. **Lookup por lista explícita de telefones.** Helper `digitsOnly()` + constante `REGISTERED_PHONES` (mapa dígitos-normalizados → cliente). A action `lookup` de `/api/client-identity` normaliza `body.phone` e: se estiver no mapa → `{ client }` (reconhecido, entra direto); senão → HTTP 404 → `lookupClient()` retorna `null` → wizard vai ao step `details` (cliente novo). As actions `link_to_salon`/`create_or_get`/`check_active`/`update` seguem devolvendo sucesso (concluem o cadastro do cliente novo).
2. **Seed de sessão virou opt-in, desligado por padrão.** `seedClientSession()` retorna cedo se `import.meta.env.VITE_CLIENT_MOCK_SEED_SESSION !== '1'`. Por padrão a casca abre DESLOGADA e o wizard começa pedindo telefone. Para reabrir a casca "já logada" (comportamento antigo), setar `VITE_CLIENT_MOCK_SEED_SESSION=1` no `app/.env.development.local`.

## Como testar (npm run dev + rota /s/:slug)
Slug do salão mockado: `11111111-1111-4111-8111-111111111111-salao-teste`.
- Cliente NOVO (não reconhecido → pede nome + nascimento): digite qualquer telefone válido diferente, ex. `(11) 97777-1234`.
- Cliente JÁ CADASTRADO (reconhecido, entra direto): digite `(11) 98888-0001`.

## Regra de produto reforçada
`ClientIdentityForm` SEMPRE faz o lookup do telefone ANTES de decidir pedir nome/nascimento — nunca mostra os 3 campos de uma vez; cliente reconhecido não vê tela de confirmação extra. O mock respeita isso: o cenário é controlado só pelo telefone digitado.

## Verificação
`npm run build` passou (mode=production). Grep no `dist/` por `installClientMock`, `REGISTERED_PHONES`, `salao-teste`, `mock.supabase.co`, `mock-anon-key` → 0 ocorrências (tree-shaken, import gated por `import.meta.env.DEV`). Nada do mock vaza pro bundle de produção.
