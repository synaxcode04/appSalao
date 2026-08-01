---
name: booking-slot-debug
description: Diagnostica conflitos e erros no cálculo de slots disponíveis do BookingEngine, apontando a linha exata do problema sem alterar código.
---

## O que esta skill faz

Lê o `BookingEngine.jsx`, reconstrói mentalmente o algoritmo de geração de slots e identifica onde ocorre o bug relatado (slot ocupado aparecendo, slot livre não aparecendo, conflito entre profissionais, fuso horário errado, intervalo de almoço ignorado).

## Fontes de verdade a ler

1. `app/src/components/BookingEngine.jsx` — algoritmo de slots
2. `Documentos/schema.sql` — estrutura das tabelas `appointments` e `working_hours`
3. `Documentos/SPEC.md` — critérios de aceitação do Motor de Agendamento

## Instruções

1. Leia o `BookingEngine.jsx` completo — não pule nenhuma função.
2. Mapeie o fluxo: como os `working_hours` são lidos → como os `appointments` existentes são consultados → como os slots são calculados → como os slots ocupados são filtrados.
3. Verifique os 5 pontos de falha mais comuns neste projeto:

   **a) Fuso horário:** Supabase retorna timestamps em UTC. Se o código comparar `start_time` (TIME local) com um timestamp UTC sem converter, haverá deslocamento.

   **b) Intervalo de almoço:** Os campos `break_start_time` e `break_end_time` em `working_hours` devem ser verificados — slots que começam ou terminam dentro do intervalo devem ser excluídos.

   **c) Duração do serviço:** O slot às 17:30 com serviço de 60 min em salão que fecha às 18:00 não deve aparecer — o fim do serviço ultrapassa o horário de fechamento.

   **d) Múltiplos profissionais:** Se `professional_id` for nulo, o filtro de conflitos deve ser por `salon_id`. Se não for nulo, o filtro deve ser apenas por `professional_id`.

   **e) Status do agendamento:** Apenas agendamentos com `status = 'scheduled'` devem bloquear slots — `'canceled'` e `'completed'` devem ser ignorados no filtro.

4. Aponte: qual linha do código causa o bug, por que está errada e como corrigir.
5. Não altere nenhum arquivo — apenas diagnostique e explique.

## Exemplo

**Input:** "O horário das 12:00 está aparecendo como disponível mesmo com intervalo de almoço 12:00–13:00 configurado"

**Output esperado:**
```
Linha 47 de BookingEngine.jsx: o filtro de break exclui apenas slots que COMEÇAM
dentro do intervalo, mas não slots que TERMINAM dentro. Um serviço de 30min às
11:45 termina às 12:15 (dentro do break) e deveria ser excluído.
Correção: mudar a condição de `slotStart >= breakStart` para
`slotStart < breakEnd && slotEnd > breakStart`.
```

## Quando NÃO usar

- Não use para bugs de UI (loading, layout quebrado) — esses não são do BookingEngine.
- Não use se o problema for de permissão RLS (agendamento rejeitado pelo banco) — use `fix-rls`.
- Não altere o código durante o diagnóstico — esta skill é só de leitura e análise.
