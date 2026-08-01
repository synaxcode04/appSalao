# Correções da sessão 2026-07-11

**Agent:** session
**Tipo:** correcao

## Contexto / Problema
Sessão de trabalho de 2026-07-11 com um conjunto de correções aplicadas e validadas via smoke test (18 testes passando).

## Detalhe / Correções aplicadas
- **Slots por duração**: o cálculo de slots passou a respeitar a duração do serviço como step entre horários.
- **Fuso horário**: datas e horas chegam em UTC do banco; agora são convertidas para o timezone local antes de exibir ou comparar.
- **Notificações in-app**: adicionadas notificações in-app.
- **RLS multi-tenant**: isolamento multi-tenant corrigido via `rls_fix.sql`.

## Solução / Regra aplicada
Todas as correções foram validadas no smoke test da sessão, com 18 testes passando.
