**Agent:** booking-engine
**Tipo:** feature
**Data:** 2026-08-01

## O que foi coberto

Adicionados dois `it` no `describe` novo "BookingEngine — intervalo de almoço e conflito por profissional" em `app/src/__tests__/BookingEngine.test.jsx`:

1. **break 12:00–13:00 exclui slot 12:00 e mantém slots fora do intervalo**
   - `workingHours` com `break_start_time:'12:00:00'` / `break_end_time:'13:00:00'`, serviço 60 min.
   - Verifica: `times` não contém `'12:00'`; contém `'08:00'` e `'13:00'`.
   - A lógica existente (`slotStartMin < breakEnd && slotEndMin > breakStart`) já estava correta: slot 12:00 (720–780) overlapa 720–780 → bloqueado; slot 11:00 (660–720) tem `720 > 720 = false` → não bloqueado; slot 13:00 (780–840) tem `780 < 780 = false` → não bloqueado.

2. **agendamento scheduled de um profissional bloqueia slot sobreposto para aquele profissional**
   - `professionals=[{id:'p1',name:'Ana'}]`; appointments mock retorna `[{start_time:'10:00:00', end_time:'11:00:00'}]`.
   - Verifica: nenhum botão com texto `'10:00'` aparece na UI.
   - O `selectedProfessional` é inicializado como `professionals[0].id` no primeiro `useEffect`; a query inclui `.eq('professional_id', selectedProfessional)`; o mock chain retorna o agendamento existente para qualquer `eq`.

## Bugs encontrados

Nenhum. A lógica de `calculateAvailableSlots` em `BookingEngine.jsx` já implementava corretamente tanto o filtro de intervalo de almoço quanto o filtro de sobreposição por professional_id. Os testes confirmam o comportamento correto sem exigir qualquer alteração no componente.

## Resultado

`npm run test:run` — **20 testes passando, 0 falhas** (4 arquivos: BookingEngine, ProtectedRoute, notification, smoke).
