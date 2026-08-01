# BookingEngine — cálculo de slots

**Agent:** booking-engine
**Tipo:** regra-negocio

## Contexto / Problema
O `BookingEngine` calcula os horários disponíveis (slots) para agendamento. Precisa respeitar horários de trabalho, agendamentos existentes e a duração do serviço.

## Detalhe
O componente recebe `workingHours`, `appointments` e `service` como props — ele **não** faz fetch próprio; o componente pai busca os dados.

- Horários chegam como string `"HH:MM:SS"`. Compare como string (`"10:00" < "11:00"` funciona) ou converta para minutos totais.
- Apenas `status='scheduled'` bloqueia um slot. `canceled` e `completed` são ignorados na checagem de conflito.
- A duração do serviço é o passo (step) entre slots.

## Solução / Regra aplicada
Com janela 08:00–17:00 (início dos slots):
- Serviço de 60 min → 10 slots
- Serviço de 30 min → 20 slots
- Serviço de 15 min → 40 slots

O intervalo de almoço não gera slots dentro do seu período.
