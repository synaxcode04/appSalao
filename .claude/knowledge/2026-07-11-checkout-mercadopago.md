# Checkout Mercado Pago

**Agent:** devops
**Tipo:** feature

## Contexto / Problema
Fluxo de assinatura paga do salão via Mercado Pago, exposto por uma Vercel Function.

## Detalhe
Endpoint `POST /api/criar-preferencia` monta a preferência de pagamento no Mercado Pago e retorna `{ initPoint: <url> }` para redirecionar o usuário ao checkout.

Planos válidos: `mensal`, `semestral`, `anual`. Plano inválido retorna HTTP 400 `{ error: 'Plano inválido' }`.

Campos faltantes atualmente usam defaults implícitos — aceitável para o MVP.

## Solução / Regra aplicada
No smoke test não houve erros 5xx no endpoint. Comportamento validado para o MVP.
