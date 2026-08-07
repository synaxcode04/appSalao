# Teste de Regressão — Agenda/Histórico do cliente exibindo todos os serviços do agendamento

**Data:** 2026-08-07
**Commit:** `6ff9458` — fix(client): exibe todos os servicos e total por card na agenda e historico
**Ambiente:** Produção (`https://appsalao-psi.vercel.app`)

---

## O que foi testado

Agendamento com 2 ou mais serviços (ex: Barba + Corte de Cabelo) exibido na Agenda
(`ClientAppointments.jsx`) e no Histórico (`ClientHistory.jsx`) do cliente.

**Comportamento esperado:** um único card por agendamento (nunca cards separados por
serviço), listando todos os serviços com nome + preço, e o total somado quando há 2+
serviços. Agendamentos legados com um único serviço (sem linhas em
`appointment_services`) continuam exibindo normalmente via fallback.

---

## Passos reproduzidos

### Problema original

1. Criado agendamento via wizard de 4 etapas selecionando 2 serviços (Barba R$ 40,00 +
   Corte de Cabelo R$ 50,00), total R$ 90,00 confirmado na etapa 4/4.
2. Card exibido na Agenda mostrava **somente** "Barba (R$ 40,00)" — o segundo serviço
   desaparecia da exibição, apesar de o total ter sido confirmado corretamente na etapa
   de agendamento.

### Teste após correção

1. Mesmo cenário: agendamento com 2 serviços.
2. **Resultado:** card único na Agenda lista "Barba — R$ 40,00" e "Corte de Cabelo —
   R$ 50,00", com total "R$ 90,00" exibido no card.
3. Mesmo comportamento replicado no Histórico para agendamento concluído com múltiplos
   serviços.
4. Agendamento legado (1 serviço, sem `appointment_services`) testado em paralelo —
   continua exibindo nome + preço do serviço único, sem regressão.
5. Notificações push de cancelamento/conclusão passaram a citar todos os serviços do
   agendamento (antes citavam só o primário).

---

## Causa raiz

A API já gravava corretamente N linhas em `appointment_services` (uma por serviço) e
retornava o array aninhado via `list_by_client`/`list_history`. O defeito era
exclusivamente de renderização no front: `ClientAppointments.jsx` e
`ClientHistory.jsx` liam apenas o objeto singular `appt.services` (derivado da coluna
legada `appointments.service_id`, que guarda só o 1º serviço por compatibilidade),
ignorando o array completo.

---

## Correção aplicada

- Novo helper puro `app/src/utils/appointmentServices.js`
  (`getAppointmentServices`, `getAppointmentTotal`, `formatBRL`) com fallback para o
  singular legado.
- `ClientAppointments.jsx` e `ClientHistory.jsx` passaram a listar todos os serviços +
  total dentro do mesmo card.
- Nenhuma mudança em `app/api/appointments.js` nem no schema — os dados já estavam
  corretos.

Ver `.claude/knowledge/2026-08-07-agenda-cliente-lista-multiplos-servicos-por-card.md`.

---

## Testes automatizados

- `app/src/__tests__/appointmentServices.test.js` (helper puro)
- `app/src/__tests__/ClientHistory.test.jsx` (multi-serviço + fallback legado)
- Suíte completa: 194/194 passando.

---

## Resultado

**PASS — Card único exibe todos os serviços + total corretamente em produção. Fallback
legado sem regressão.**

---

**Testador:** Claude Code (via orchestrator + code-reviewer)
**Data:** 2026-08-07
