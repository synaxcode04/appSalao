# PLAN.md

## Sprint 1 — Sistema em produção com agendamento sem conflitos, notificações funcionando e controle de licenças ativo

---

### Fase 1 — Fundação
> Dependências: nenhuma
> Paralelismo: Task 1.1 e Task 1.2 rodam em paralelo

#### Task 1.1 — Configurar infraestrutura de testes
- Agent: developer
- Input: `app/package.json` e `app/vite.config.js` existentes
- Output:
  - `app/package.json` com `vitest`, `@testing-library/react` e `@testing-library/jest-dom` em `devDependencies`
  - `app/vite.config.js` com bloco `test: { environment: 'jsdom', setupFiles: ['./src/__tests__/setup.js'] }`
  - `app/src/__tests__/setup.js` com `import '@testing-library/jest-dom'`
  - Script `"test": "vitest"` em `package.json`
- Testes críticos:
  - [ ] `npm run test` no diretório `app/` executa e encerra sem erro (exit 0) mesmo sem arquivos de teste ainda
  - [ ] `npm run test -- --reporter=verbose` exibe o runner Vitest sem mensagem de "no test files found" tratar como falha

---

#### Task 1.2 — Corrigir políticas RLS do banco de dados
- Agent: developer
- Input: `Documentos/schema.sql` com políticas atuais permissivas (`WITH CHECK (true)`)
- Output:
  - `Documentos/rls_fix.sql` com políticas corrigidas para `services`, `working_hours`, `professionals` e `appointments`, vinculando ao `owner_id` via JOIN com `salons`
  - Coluna `is_active BOOLEAN DEFAULT true` adicionada à tabela `salons` (necessária para controle de licenças na Fase 3)
  - Exemplo de política corrigida para `services`:
    ```sql
    CREATE POLICY "Owners can manage their services"
    ON public.services FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.salons
        WHERE salons.id = services.salon_id
        AND salons.owner_id = auth.uid()
      )
    );
    ```
- Testes críticos:
  - [ ] Usuário autenticado como dono do salão A **não consegue** inserir serviço no salão B (retorna erro de política RLS)
  - [ ] Usuário autenticado como dono do salão A **consegue** inserir serviço no seu próprio salão A (insert retorna sucesso)

---

### Fase 2 — Motor de Agendamento e Autenticação
> Dependências: Fase 1 (Vitest configurado)
> Paralelismo: Task 2.1 e Task 2.2 rodam em paralelo

#### Task 2.1 — Testes e correção do BookingEngine
- Agent: developer
- Input: `app/src/components/BookingEngine.jsx` e infraestrutura de testes da Task 1.1
- Output:
  - `app/src/__tests__/BookingEngine.test.jsx` com ≥ 7 casos de teste cobrindo os critérios de aceitação do SPEC
  - `BookingEngine.jsx` corrigido onde os testes revelarem falhas
- Testes críticos:
  - [ ] Dado `start_time=08:00`, `end_time=18:00`, serviço de 60 min e nenhum agendamento → função retorna array com 10 slots
  - [ ] Dado slot 10:00–11:00 já ocupado → slot não aparece na lista de disponíveis retornada
  - [ ] Dado `break_start_time=12:00`, `break_end_time=13:00` → nenhum slot gerado dentro desse intervalo
  - [ ] Dado data no passado → função retorna array vazio ou lança erro tratado
  - [ ] Dado dois profissionais diferentes → slots são calculados por profissional de forma independente

---

#### Task 2.2 — Testes do ProtectedRoute e guards de role
- Agent: developer
- Input: `app/src/components/ProtectedRoute.jsx` e infraestrutura de testes da Task 1.1
- Output:
  - `app/src/__tests__/ProtectedRoute.test.jsx` com ≥ 4 casos de teste
  - `ProtectedRoute.jsx` inalterado se os testes passarem; corrigido onde revelarem falhas
- Testes críticos:
  - [ ] Usuário sem sessão ativa acessando `/painel` → componente redireciona para `/login`
  - [ ] Usuário autenticado com `role = 'client'` acessando `/painel` → componente nega acesso (não renderiza `OwnerLayout`)
  - [ ] Usuário autenticado com `role = 'owner'` acessando `/painel` → componente renderiza `OwnerLayout` normalmente
  - [ ] Usuário autenticado com `role = 'owner'` acessando `/cliente` → componente nega acesso

---

### Fase 3 — Notificações e Controle de Licenças
> Dependências: Fase 1 (Vitest) e Fase 2 (RLS corrigido com campo `is_active`)
> Paralelismo: Task 3.1 e Task 3.2 rodam em paralelo

#### Task 3.1 — Validar e completar os 7 eventos de notificação
- Agent: developer
- Input: `app/api/notify.js`, `app/src/utils/notification.js` e tabela de eventos do SPEC
- Output:
  - `app/api/notify.js` atualizado para cobrir os 7 eventos definidos no SPEC com payload tipado por evento
  - `app/src/utils/notification.js` com função `dispatchNotification(event, payload)` que chama `/api/notify`
  - `app/src/__tests__/notification.test.js` com mocks de fetch cobrindo cada evento
- Testes críticos:
  - [ ] `dispatchNotification('new_appointment', { salonId, clientId })` → chama `POST /api/notify` com `{ event: 'new_appointment', recipientRole: 'owner' }` e retorna status 200
  - [ ] `dispatchNotification('owner_cancel', { salonId, clientId })` → payload contém `recipientRole: 'client'` (não `'owner'`)
  - [ ] `dispatchNotification` com evento inválido → lança `Error('evento desconhecido')` sem chamar a API

---

#### Task 3.2 — Tela de licença suspensa e bloqueio de acesso
- Agent: developer
- Input: `app/src/pages/client/SalonDetails.jsx`, `app/src/layouts/OwnerLayout.jsx` e coluna `is_active` criada na Task 1.2
- Output:
  - `app/src/components/SuspendedScreen.jsx` — componente com mensagem de suspensão (visual a definir, ver decisões em aberto no SPEC)
  - `SalonDetails.jsx` atualizado: se `salon.is_active === false`, renderiza `<SuspendedScreen />` em vez do conteúdo normal
  - `OwnerLayout.jsx` atualizado: verifica `is_active` do salão do usuário logado; se `false`, renderiza `<SuspendedScreen />` e bloqueia todas as rotas filhas
  - `app/src/__tests__/SuspendedScreen.test.jsx` com 2 casos
- Testes críticos:
  - [ ] `SalonDetails` renderizado com `salon.is_active = false` → exibe `SuspendedScreen` e não exibe `BookingEngine`
  - [ ] `OwnerLayout` renderizado com `salon.is_active = false` → exibe `SuspendedScreen` e não renderiza rotas filhas (`DashboardHome`, `ServicesManager` etc.)

---

### Fase 4 — Publicação
> Dependências: Fases 1, 2 e 3 completas
> Paralelismo: Task 4.1 e Task 4.2 rodam em sequência (4.1 antes de 4.2)

#### Task 4.1 — Configurar ambiente de produção na Vercel
- Agent: developer
- Input: `app/.env` local com variáveis de ambiente; painel Vercel do projeto
- Output:
  - Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas em **Settings → Environment Variables** na Vercel (escopo: Production + Preview)
  - `app/.env` removido do repositório (confirmado via `git status`)
  - `app/vercel.json` revisado e válido
  - Deploy bem-sucedido em `https://appsalao-psi.vercel.app/`
- Testes críticos:
  - [ ] `vercel env pull app/.env.vercel` retorna as duas variáveis sem erro
  - [ ] `npm run build` no diretório `app/` encerra com exit 0 sem warnings de variáveis indefinidas

---

#### Task 4.2 — Smoke test em produção
- Agent: QA
- Input: URL de produção funcional da Task 4.1 e os 6 critérios de aceitação do SPEC
- Output:
  - `Documentos/smoke_test_result.md` com checklist dos 6 critérios de aceitação preenchido, data e resultado (pass/fail) por item
- Testes críticos:
  - [ ] Fluxo completo: cliente acessa `/:slug` → seleciona serviço → seleciona horário → confirma → agendamento aparece no painel do dono em menos de 5 segundos
  - [ ] Conflito de horário: tentativa de agendar slot já ocupado → sistema recusa e não cria o registro (confirmado via Supabase dashboard)
  - [ ] PWA: Chrome no Android exibe banner de instalação na primeira visita a `/:slug`

---

## Resumo de paralelismo

| Fase | Tasks em paralelo | Agents simultâneos |
|------|------------------|--------------------|
| Fase 1 | 1.1 ∥ 1.2 | 2 |
| Fase 2 | 2.1 ∥ 2.2 | 2 |
| Fase 3 | 3.1 ∥ 3.2 | 2 |
| Fase 4 | 4.1 → 4.2 (sequencial) | 1 |

**Total de tasks:** 8
**Máximo de agents simultâneos:** 2
**Critério de conclusão do Sprint:** `Documentos/smoke_test_result.md` com todos os 6 critérios de aceitação marcados como `pass`
