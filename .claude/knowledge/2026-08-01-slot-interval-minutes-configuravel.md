# Intervalo de Exibição de Slots Configurável por Salão

**Agent:** orchestrator (rls-security + booking-engine + UI + code-reviewer)
**Tipo:** feature
**Data:** 2026-08-01
**Status:** Aprovado para deploy (pendência: aplicar migração no Supabase de produção)

## Problema/Pedido

O dono do salão poder definir de quantos em quantos minutos os horários da agenda aparecem para o cliente (múltiplos de 15).

## Solução Aplicada

### Banco de dados
- Nova coluna `salons.slot_interval_minutes INTEGER DEFAULT NULL`.
  - `NULL` = fallback para a duração do serviço (preserva o comportamento atual e o teste crítico dos 10 slots).
  - CHECK: `NULL OR (>=15 AND <=120 AND %15=0)`.
- Migração idempotente em `Documentos/add_slot_interval_minutes.sql` (`ADD COLUMN IF NOT EXISTS` + bloco `DO`/`pg_constraint`).
- A policy de UPDATE existente (`auth.uid() = owner_id`) já cobre a escrita — **nenhuma policy nova**.

### BookingEngine.jsx
- Nova prop `slotIntervalMinutes` (default `null`).
- O PASSO de `generateTimeSlots` passou a ser `step = slotIntervalMinutes >= 15 ? slotIntervalMinutes : serviceDuration`.
- **IMPORTANTE:** `step != duração`. `slotEndMin` e o `endTime` do agendamento continuam usando `serviceDuration`; um `step` menor que a duração gera slots com início sobreposto (esperado), e a filtragem de conflito/fim-de-expediente continua correta.

### UI
- Card novo em `pages/owner/Settings.jsx` (select "Automático" + 15..120).
- Handler próprio `handleUpdateSlotInterval` que salva `int` ou `null` (nunca string vazia) + `refreshSalon()`.

### Wiring
- Prop `slotIntervalMinutes={salon?.slot_interval_minutes ?? null}` nos 3 render sites do BookingEngine: `SalonDetails.jsx`, `ClientAppointments.jsx`, `DashboardHome.jsx`.
- Os layouts pais já fazem `.select('*')`, então a coluna flui sem novo fetch.

### TDD
- 5 testes novos em `BookingEngine.test.jsx`:
  - fallback = 10 slots
  - interval = 30 = 19 slots
  - interval = 15 = 37 slots
  - slot ocupado bloqueado
  - break respeitado
- Suite total: **39 testes verdes**.

## Armadilha Registrada

Não confundir **passo** (intervalo de exibição de slots) com **duração** do serviço. O passo controla de quantos em quantos minutos os inícios de slot aparecem; a duração continua determinando o fim do agendamento e a checagem de conflito.

## Pendência Operacional

Aplicar `Documentos/add_slot_interval_minutes.sql` no Supabase de produção **antes** de usar em produção.

## Status

code-reviewer aprovou para deploy (0 bloqueantes, 0 importantes, 4 sugestões opcionais).
