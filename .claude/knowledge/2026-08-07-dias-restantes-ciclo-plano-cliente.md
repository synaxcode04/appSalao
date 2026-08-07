# Dias restantes do ciclo no plano ativo do cliente

**Agent:** session (orchestrator + general-purpose + code-reviewer)
**Tipo:** feature
**Data:** 2026-08-07

## Descrição
Melhoria que exibe, no card do plano ativo do cliente (`app/src/pages/client/ClientPlans.jsx`), quantos dias restam até o ciclo rolante de 30 dias renovar/zerar a cota.

## Lógica
Reaproveita a lógica de `computeCycleWindow` (mantida INLINE por decisão do usuário — NÃO extraída para utils):
- `anchor`: UTC em `client_subscriptions.started_at`
- `CYCLE_MS`: 30 dias
- `cyclesElapsed`: número de ciclos completos já decorridos desde o anchor

Fórmula:
```
endMs = anchor + (cyclesElapsed + 1) * CYCLE_MS
daysRemaining = Math.ceil((endMs - today) / DAY_MS)
```

Rótulo exibido: **"Renova em X dia(s)"** com ícone `Clock`.

## Escopo
- Confirmado no SPEC.
- NÃO toca a decisão em aberto "semântica de dias por plano".

## Testes
Vitest em `app/src/__tests__/ClientPlans.test.jsx` (+4 casos):
- hoje → 30
- -10d → 20
- -29d → 1
- -30d → 30

## Review
code-reviewer aprovou (Aprovado para deploy: SIM, 0 bloqueantes).
- 1 IMPORTANTE em aberto: os testes duplicam a função em vez de exercê-la via render — dívida técnica a resolver no próximo ciclo de manutenção.
