# Time Blocks — bloqueio pontual de horário por data

**Agent:** orchestrator (session) — rls-security, booking-engine, claude (UI), code-reviewer
**Tipo:** feature
**Data:** 2026-08-01

## Descrição

Feature de bloqueio pontual de horário / folga avulsa por data. Permite ao dono do salão bloquear
um intervalo de horário em uma data específica sem editar o cadastro fixo de `working_hours`.

O campo `professional_id` é nullable:
- `NULL` → bloqueio vale para o **salão inteiro** (todos os profissionais).
- `UUID` → bloqueio vale apenas para o **profissional específico**.

## Decisões

1. **Leitura de `time_blocks` no `BookingEngine`** é feita via **supabase anon direto**, seguindo o
   mesmo caminho de `working_hours` — NÃO foi centralizado em `/api/appointments`. A leitura é
   pública (RLS SELECT `USING true`) porque o cliente usa sessão leve (sem `auth.uid()`).
2. **UI da tela "Bloqueios"** no painel do dono foi feita pelo agent catch-all `claude`. A escrita
   (INSERT/UPDATE/DELETE de bloqueios) usa o **supabase client do dono** (que tem sessão Auth real),
   NÃO via serverless — diferente da escrita de agendamentos do cliente.

## Pontos de atenção técnicos

- **RLS SELECT público** (`USING true`) é justificado pela sessão leve do cliente — o cliente precisa
  ler os bloqueios para calcular slots, mas não tem `auth.uid()`.
- **Escrita** com `WITH CHECK` + JOIN em `salons.owner_id = auth.uid()` + `auth.uid() IS NOT NULL` —
  garante que só o dono do salão dono do bloqueio pode escrever.
- **Regra `.eq(coluna, null)` proibida** (PostgREST falha silenciosamente) — o filtro de
  `professional_id` (NULL = salão inteiro vs. UUID específico) é feito em **JS**, não na query.
- **Lógica de sobreposição de slots** reaproveitada da checagem de conflito de `appointments`.

## Arquivos

- `Documentos/time_blocks.sql` — schema + RLS
- `app/src/components/BookingEngine.jsx` — leitura e aplicação dos bloqueios no cálculo de slots
- `app/src/pages/owner/TimeBlocksManager.jsx` — tela do dono (CRUD de bloqueios)
- `app/src/App.jsx` — rota
- `app/src/layouts/OwnerLayout.jsx` — item de menu
- `app/src/__tests__/BookingEngine.test.jsx` — teste

## Pendência do code-reviewer — investigada e não confirmada

O code-reviewer reportou um `NavLink` pré-existente em `OwnerLayout.jsx` com barras invertidas
(`\painel\clientes` em vez de `/painel/clientes`). Investigação posterior (leitura completa do
arquivo + busca por `to="\` em toda `app/src`) não encontrou nenhuma ocorrência — todos os 9
`NavLink` já usavam `/` corretamente. Apontamento tratado como desatualizado/falso positivo;
nenhuma correção foi necessária.

## Deploy de produção

Deployado junto do commit `42e6e93` (docs) em cima do commit da feature `90d26be`.
- Pre-deploy check: 63/63 testes, 0 bloqueantes.
- Deploy via `vercel --prod` a partir de `app/`, sem git push — deployment `dpl_EWfBb4b8LggLuwJ8US23GgZv3qaz`, status READY.
- URL: https://appsalao-psi.vercel.app
- Smoke test pós-deploy: 10/10 (ver `Documentos/smoke_test_result.md` e `teste_regressao/2026-08-01-deploy-time-blocks.md`).
- Verificação manual end-to-end do bloqueio de horário (criar bloqueio → slot some para o cliente)
  ainda pendente — não coberta por smoke test HTTP, requer teste manual no ambiente real.
