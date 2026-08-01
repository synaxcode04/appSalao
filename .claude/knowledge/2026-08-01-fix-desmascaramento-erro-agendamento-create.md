**Agent:** booking-engine
**Tipo:** bug
**Data:** 2026-08-01

## Sintoma

Cliente novo se identificava por telefone na página pública do salão e, ao confirmar horário, recebia o toast genérico "Não é possível agendar no momento. Entre em contato com o salão." — impossibilitando qualquer agendamento real.

## Causa Raiz: Duplo Mascaramento

### Camada 1 — Frontend (`BookingEngine.jsx`)

O ramo de novo agendamento (ação `create`) não lia o corpo da resposta quando `createRes.ok` era false. Qualquer status não-409 caía diretamente no fallback genérico, sem exibir o erro real retornado pela API. O ramo de reagendamento já fazia o correto (`const errData = await res.json().catch(() => ({}))`), mas o ramo de criação não espelhava essa lógica.

### Camada 2 — Backend (`appointments.js`)

O trigger de banco `check_appointment_conflict` lança `RAISE EXCEPTION ... USING ERRCODE = 'exclusion_violation'` (código Postgres `23P01`) em caso de double-booking. O handler capturava esse erro como `createError` genérico e retornava HTTP 500 "Erro ao criar agendamento" — em vez de 409 "Horário indisponível". Isso fazia o front cair no fallback genérico mesmo quando a causa era apenas conflito de horário.

O salão que está em produção provavelmente tem o trigger ativo; sem ele, a verificação server-side via `hasConflict()` já retornaria 409 antes do INSERT. A causa-raiz exata do caso do usuário (qual dos dois layers estava bloqueando) só será confirmada no próximo teste em produção, pois estava mascarada.

## Solução Aplicada

### `app/src/components/BookingEngine.jsx`

No bloco `else` após `createRes.ok === false`:
- Adicionado `const errData = await createRes.json().catch(() => ({}))`
- 409 → continua exibindo "Horário indisponível. Por favor, escolha outro horário."
- 4xx (exceto 409) com `errData.error` presente → exibe a mensagem real do servidor (ex: "Cliente bloqueado neste salão")
- 5xx ou sem `errData.error` → exibe o genérico "Não é possível agendar no momento. Entre em contato com o salão."

Erros 5xx continuam com mensagem genérica para não vazar detalhes internos ao cliente.

### `app/api/appointments.js`

No tratamento de `createError` da ação `create` (após o INSERT):
- Antes de retornar 500, verifica `createError.code === '23P01'`
- Se for o código de `exclusion_violation`, retorna 409 `{ error: 'Horário indisponível' }`
- `console.error` mantido em todos os casos para observabilidade

## Testes Adicionados (`BookingEngine.test.jsx`)

- `create retorna 403 com mensagem real` → exibe `errData.error` em vez do genérico
- `create retorna 409` → exibe "Horário indisponível. Por favor, escolha outro horário."

Resultado: 30 testes passando (5 arquivos).
