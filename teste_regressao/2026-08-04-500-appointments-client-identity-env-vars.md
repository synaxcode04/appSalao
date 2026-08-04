# 2026-08-04 — 500 em /api/appointments e /api/client-identity (cliente não consegue agendar)

## O que foi testado
Fluxo de agendamento do cliente pela página pública do salão (`/s/:slug`), que
depende das Vercel Functions `app/api/appointments.js` (ação `create`) e
`app/api/client-identity.js` (reconhecimento/cadastro por telefone).

## Sintoma
- Cliente não conseguia agendar: as chamadas a `/api/appointments` e
  `/api/client-identity` retornavam **HTTP 500** em produção.
- Erro genérico no corpo da resposta (funções `service_role` não vazam detalhes
  ao cliente), sem stack visível no frontend.

## Passos reproduzidos
1. Abrir a página pública de um salão (`/s/:slug`).
2. Iniciar identificação por telefone → POST `/api/client-identity` → 500.
3. (Quando a identidade já existia) tentar concluir agendamento → POST
   `/api/appointments` (action `create`) → 500.

## Investigação
- Hipótese inicial: regressão do bug `.eq('professional_id', professional_id || null)`
  de 2026-08-01 (PostgREST não trata `.eq()` com `null` como igualdade, gerando
  500 no server quando o agendamento não tem profissional específico).
- **Descartada:** o código de produção JÁ está correto — usa o padrão condicional
  `professional_id ? q.eq('professional_id', professional_id) : q.is('professional_id', null)`
  na ação `create` (`app/api/appointments.js` L462-464) e na ação `reschedule`
  (L816-818). A leitura do código confirmou que não houve reintrodução do bug.
- O 500 afetava **as duas** funções (`appointments` e `client-identity`)
  simultaneamente — sinal de causa comum de infraestrutura, não de lógica de uma
  ação específica. Ambas instanciam o client Supabase com `service_role` a partir
  de `process.env.SUPABASE_URL` / `process.env.SUPABASE_SERVICE_ROLE_KEY`.

## Causa raiz
**Variáveis de ambiente de produção ausentes/incorretas na Vercel:**
`SUPABASE_URL` e/ou `SUPABASE_SERVICE_ROLE_KEY` (sem prefixo `VITE_`, server-side).
Sem essas variáveis, `createClient(...)` nas funções serverless falha e toda
chamada estoura 500 — independentemente do payload. **NÃO foi a regressão
`.eq(null)`** — o código está correto.

## Correção / ação necessária do usuário
Verificar no **Vercel Dashboard → Project → Settings → Environment Variables**
(escopos Production **e** Preview) que existem e estão corretos:
- `SUPABASE_URL` — URL do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (secreta, server-side only).

Após ajustar, refazer o deploy para as funções recarregarem o ambiente e repetir
os passos acima (esperado: 200/201).

## Blindagem adicional (lacuna de teste encontrada)
Durante a investigação notou-se uma **lacuna de cobertura**: `appointments.test.js`
tinha teste do caminho COM profissional (`.eq('professional_id', 'prof-1')`), mas
NENHUM que assertasse o caminho SEM profissional (`.is('professional_id', null)`).
Ou seja, se alguém revertesse para o padrão bugado `.eq('professional_id', professional_id || null)`,
o CI ainda passaria e a regressão de 2026-08-01 escaparia.

Adicionados testes de regressão em `app/src/__tests__/appointments.test.js`:
- `create — sem profissional usa .is(professional_id, null), não .eq(professional_id, null)`
  (espelho COM profissional + caminho SEM profissional).
- `reschedule — sem profissional usa .is(professional_id, null), não .eq(professional_id, null)`.

Os testes asseguram `expect(chain.is).toHaveBeenCalledWith('professional_id', null)`
e `expect(chain.eq).not.toHaveBeenCalledWith('professional_id', null)`.

## Resultado
- **Causa do 500:** PENDENTE de verificação do usuário no Vercel Dashboard (env vars).
- **Teste de regressão (blindagem `.is(null)`):** PASS —
  `npm run test:run` → 10 arquivos, **117 testes passando** (appointments.test.js
  passou de 18 para 21 testes). Nenhum código de produção alterado.
