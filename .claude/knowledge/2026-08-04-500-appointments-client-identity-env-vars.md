**Agent:** general-purpose (session)
**Tipo:** bug
**Data:** 2026-08-04

## Sintoma

Cliente não conseguia agendar pela página pública do salão (`/s/:slug`). As Vercel Functions `app/api/appointments.js` (action `create`) e `app/api/client-identity.js` retornavam **HTTP 500** em produção — as duas simultaneamente.

## Causa Raiz

**Variáveis de ambiente de produção ausentes/incorretas na Vercel:** `SUPABASE_URL` e/ou `SUPABASE_SERVICE_ROLE_KEY` (server-side, SEM prefixo `VITE_`). Ambas as funções instanciam o client Supabase com `service_role` a partir de `process.env.SUPABASE_URL` / `process.env.SUPABASE_SERVICE_ROLE_KEY`; sem esses valores, `createClient(...)` falha e toda invocação estoura 500 independentemente do payload.

O fato de as DUAS funções falharem ao mesmo tempo é o sinal diagnóstico: causa comum de infraestrutura (ambiente), não bug de lógica de uma ação específica.

### O que NÃO foi a causa

**NÃO foi a regressão `.eq('professional_id', professional_id || null)`** de 2026-08-01 (PostgREST não trata `.eq()` com `null` como igualdade → 500 quando o agendamento não tem profissional). O código de produção JÁ está correto, usando o padrão condicional:
- `create` — `app/api/appointments.js` L462-464: `professional_id ? q.eq('professional_id', professional_id) : q.is('professional_id', null)`
- `reschedule` — L816-818: mesmo padrão com `appt.professional_id`.

## Solução

1. **Verificar no Vercel Dashboard → Settings → Environment Variables** (Production e Preview) que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` existem e estão corretos; refazer o deploy para recarregar o ambiente.
2. **Blindagem de teste (lacuna encontrada):** `appointments.test.js` cobria o caminho COM profissional (`.eq('professional_id', 'prof-1')`) mas nenhum teste assertava o caminho SEM profissional. Reverter para o padrão bugado passaria no CI. Foram adicionados testes de regressão que asseguram `chain.is` chamado com `('professional_id', null)` e `chain.eq` NUNCA com `('professional_id', null)`, para `create` e `reschedule`. `npm run test:run` → 117 testes passando (appointments.test.js 18 → 21). Nenhum código de produção alterado.

## Registro de regressão

`teste_regressao/2026-08-04-500-appointments-client-identity-env-vars.md`.
