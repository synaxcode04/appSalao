# Agenda/Histórico do cliente: card único listando todos os serviços do agendamento

**Agent:** session (orchestrator + claude implementação + code-reviewer)
**Tipo:** bug
**Data:** 2026-08-07

## Problema
Na Agenda (`ClientAppointments.jsx`) e no Histórico (`ClientHistory.jsx`) do cliente, um
agendamento com 2 ou mais serviços mostrava apenas o serviço primário
(`appt.services.name` / `appt.services.price`), perdendo os demais serviços do mesmo
agendamento. O cliente via um valor e um nome incompletos.

## Causa raiz
A API grava N linhas na tabela de junção `appointment_services` (uma por serviço) e
retorna o array aninhado `appointment_services(services(...))`. Porém a coluna legada
`appointments.service_id` (NOT NULL) guarda apenas o 1º serviço, e o front-end renderizava
somente o objeto singular `appt.services` (derivado desse `service_id`), ignorando o array
`appointment_services`. Ou seja: os dados chegavam corretos do banco/API; o defeito era
puramente de renderização no front.

## Solução aplicada
- Criado helper puro `app/src/utils/appointmentServices.js`:
  - `getAppointmentServices(appt)` — retorna todos os serviços a partir de
    `appointment_services`, com **fallback** para o objeto singular legado `appt.services`
    quando o array não existe (agendamentos antigos).
  - `getAppointmentTotal(appt)` — soma os preços de todos os serviços.
  - `formatBRL(value)` — formatação monetária.
- `ClientAppointments.jsx` e `ClientHistory.jsx` agora listam **todos** os serviços
  (nome + preço) e o total em um **ÚNICO card** (requisito explícito: não criar cards
  separados por serviço), com fallback para agendamentos legados sem `appointment_services`.
- As notificações push de cancelamento/conclusão em `ClientAppointments.jsx` também
  passaram a usar todos os serviços (antes usavam só o primário).
- `owner/DashboardHome.jsx` **NÃO** foi alterado — a query dele não seleciona
  `appointment_services`, então não é afetada.

## Testes
- `app/src/__tests__/appointmentServices.test.js` — helper puro.
- `app/src/__tests__/ClientHistory.test.jsx` — cenário multi-serviço + fallback legado.
- Suíte completa: 194/194 passando.

## Arquivos NÃO tocados
- `app/api/appointments.js` — os dados já vinham corretos da API.
- Schema do banco — nenhuma migration necessária.
