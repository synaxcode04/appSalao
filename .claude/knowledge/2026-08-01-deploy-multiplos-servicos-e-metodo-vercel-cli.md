# Deploy de Múltiplos Serviços e Método Vercel CLI

**Agent:** session (orchestrator + devops + qa + booking-engine + code-reviewer)

**Tipo:** decisão

**Data:** 2026-08-01

## Resumo

Deploy da feature "agendamento de múltiplos serviços" e documentação do método de deploy do projeto.

## Fatos Aprendidos

### 1. Método de Deploy — Vercel CLI, Sem Git Remote

O App Salão **NÃO usa git remote/push** para deploy. Não existe `origin` configurado e não se deve configurar. O deploy é feito **direto na Vercel via Vercel CLI** a partir da **RAIZ do projeto**:

```bash
vercel --prod
```

O projeto já está linkado localmente via:
- `.vercel/project.json`: `projectName` `appsalao`, `projectId` `prj_NftwDKcTjUKLt9an0GCI758cgs16`
- `vercel.json` na raiz com:
  - `buildCommand`: `cd app && npm install && npm run build`
  - `outputDirectory`: `app/dist`
  - `rewrites`: SPA (redireciona todas as rotas para `index.html`)

### 2. Arquivos Vercel Persistem Após Revert

Os arquivos `vercel.json` (raiz) e `.vercel/` permaneceram no working tree mesmo após o revert do commit `ad5e6c7` (que reverteu só do git, não removeu os arquivos físicos). Por isso o link Vercel continua válido localmente.

### 3. Vercel CLI — Instalação e Sessão

- Ferramenta: Vercel CLI
- Versão usada: `58.4.4`
- Instalação: `npm install -g vercel`
- Sessão autenticada: `israelappc-1175` (herdada)
- Nota: `vercel login` é interativo e não pode ser automatizado por agent

### 4. URL de Produção e Deployment

- URL de produção: https://appsalao-psi.vercel.app (alias)
- Deployment desta feature: `dpl_634unmHJk86vEL9ZF5FvMUcjXR6Q`

### 5. Feature de Múltiplos Serviços — Schema

- **Estrutura:** 1 appointment = bloco contínuo, N serviços em tabela `appointment_services`
- **Duração:** SOMA de todos os serviços
- **Retrocompatibilidade:** `appointments.service_id` mantido NOT NULL (1º serviço)
- **Escrita:** `appointment_services` só via Vercel Function com `service_role` (nunca via `anon key` direto do cliente)

### 6. Correções Aplicadas Antes do Deploy

Commit `9fec358` contém:
- **DashboardHome:** receita soma todos os serviços do `appointment_services`
- **Reagendamento:** `exclude_id` consumido corretamente no `list_scheduled` (agendamento não se autobloqueia ao reagendar)
- **Anti-double-booking:** `end_time` do `reschedule` recomputado server-side na Vercel Function

### 7. Validação — Smoke Test de Produção

Critérios em `Documentos/smoke_test_result.md`:
- Critério 1: PASS
- Critério 2: PASS
- Critério 3: PASS
- Critério 4 (licença suspensa): PARCIAL (exige credenciais admin/dono)
- Critério 5: PASS
- Critério 6 (RLS): PARCIAL (exige credenciais admin/dono)

**Observação:** critérios 4 e 6 exigem credenciais de admin/dono para validação completa, não verificáveis só remotamente via link público.

## Implicações Futuras

- Sempre usar `vercel --prod` a partir da raiz do projeto para deploy — nunca usar git push
- Arquivo `.vercel/` e `vercel.json` são parte do setup persistente — não remover do working tree
- Vercel CLI pode não estar disponível em todos os ambientes — documentar em setup de CI/CD futuro
