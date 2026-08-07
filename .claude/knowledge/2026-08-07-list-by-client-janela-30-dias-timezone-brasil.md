**Agent:** session (orchestrator → claude + code-reviewer)
**Tipo:** bug

# list_by_client encurtava janela de 30 dias à noite no horário BR

## Problema
Na action `list_by_client` de `app/api/appointments.js`, a data-base da janela de 30 dias era calculada com `new Date()` + `setDate(getDate()-30)` + `toISOString().split('T')[0]`. `toISOString()` opera em UTC e a Vercel roda o Node em UTC, mas `appointment_date` (coluna DATE "YYYY-MM-DD") e o negócio são em horário local do Brasil (America/Sao_Paulo, UTC-3). À noite no BR (ex: 22:00 local = 01:00 UTC do dia seguinte), a data UTC já virou o dia seguinte, deslocando `limitDateStr` em ~1 dia e encurtando a janela retornada. Comportamento cosmético mas incorreto. Apontado como pendência não bloqueante pelo code-reviewer no commit 94bf5c4.

## Causa raiz
Uso de `toISOString()` (UTC) para derivar uma data-calendário que semanticamente é local BR.

## Solução
Novo helper `saoPauloDateMinusDays(days, now = new Date())` em `appointments.js`: deriva a data local BR via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })` (formato YYYY-MM-DD), subtrai N dias com `Date.UTC(y, m-1, d-days)` (normaliza virada de mês/ano automaticamente) e reformata para "YYYY-MM-DD". A action `list_by_client` passou a usar `saoPauloDateMinusDays(30)`.

## Escopo / não confundir
`list_history` e `computeCycleWindow` continuam usando UTC (`toISOString()`) DE PROPÓSITO — é decisão documentada (fonte única de verdade da expiração é o browser, mesmo fuso). NÃO "corrigir" esses para timezone BR.

## Teste
`app/src/__tests__/appointments.test.js`: `vi.setSystemTime(new Date('2026-08-08T02:00:00Z'))` (23:00 BR de 07/08) e assert de que `_gte.val` é `2026-07-08` (local BR), não `2026-07-09` (UTC). Falha-antes/passa-depois comprovado; 22/22 testes de appointments passam.
