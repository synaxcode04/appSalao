**Agent:** session (orchestrator + booking-engine + code-reviewer)
**Tipo:** bug
**Data:** 2026-08-10

## Problema

A agenda do dono (DashboardHome → DayTimeline) exibia apenas o serviço primário de cada agendamento, mesmo quando o cliente havia agendado múltiplos serviços. O nome exibido no card era somente o campo `services.name` do join direto, e o modal de ações (AppointmentActionsModal) também mostrava apenas esse serviço singular no resumo, na mensagem de WhatsApp gerada e no payload de reagendamento/notificação.

## Causa raiz

As duas queries de `DashboardHome.jsx` (uma para `appointments` do dia e outra para o Realtime) selecionavam:

```js
services ( name, duration_minutes, price )
```

Esse join retorna apenas **um** serviço — o vinculado diretamente pela FK `service_id` da tabela `appointments`. A tabela de relacionamento `appointment_services` (que armazena todos os serviços de um agendamento multi-serviço) não era incluída no `select`, de modo que os serviços adicionais eram silenciosamente ignorados.

O mesmo problema existia no lado do cliente (`BookingWizard` / agenda do cliente), mas havia sido corrigido no commit de **2026-08-07** (registro `2026-08-07-agenda-cliente-lista-multiplos-servicos-por-card.md`), que explicitamente deixou o lado do dono como débito em aberto.

## Solução aplicada

1. **`DashboardHome.jsx`** — Ambas as queries (fetch inicial e subscription Realtime) passaram a incluir `appointment_services` no `select`:
   ```js
   appointment_services ( service_id, services ( name, duration_minutes, price ) )
   ```
   O estado local `appointments` agora carrega a lista completa de serviços por card.

2. **`DayTimeline.jsx`** — O componente passou a usar os helpers `getAppointmentServices` e `getAppointmentTotal` (criados em 2026-08-07 em `appointmentServices.js`) para derivar nome(s) e total do card, com fallback para o campo legado `services` quando `appointment_services` está vazio (compatibilidade com registros antigos sem a tabela).

3. **`AppointmentActionsModal.jsx`** — Os mesmos helpers são usados para montar o resumo exibido no modal, a mensagem de WhatsApp gerada pelo botão "Confirmar via WhatsApp" e o payload enviado ao webhook de reagendamento/notificação. Sem os helpers, o modal continuaria mostrando apenas o serviço primário mesmo após a correção na query.

## Débito fechado

Este registro fecha explicitamente o débito deixado em aberto em `.claude/knowledge/2026-08-07-agenda-cliente-lista-multiplos-servicos-por-card.md`, que documentou: *"lado owner da agenda não corrigido nesta rodada — fica como débito explícito"*.

## Arquivos alterados

- `app/src/pages/owner/DashboardHome.jsx` — queries atualizadas para incluir `appointment_services`
- `app/src/components/DayTimeline.jsx` — usa `getAppointmentServices`/`getAppointmentTotal`; fallback legado preservado
- `app/src/components/AppointmentActionsModal.jsx` — usa os mesmos helpers para resumo, WhatsApp e notificação

## Testes

- `app/src/__tests__/DayTimeline.test.jsx` — adicionados/atualizados
- `app/src/__tests__/AppointmentActionsModal.test.jsx` — adicionados/atualizados
- Suite completa: **219/219 passing**
