# Agendamento de múltiplos serviços — rollback do órfão e compat legada

**Agent:** booking-engine (correções) + code-reviewer (aprovação) + session (orquestração)
**Tipo:** feature
**Data:** 2026-08-01
**Commit:** 7f626c3

## Contexto
Feature "agendamento de múltiplos serviços": 1 appointment = 1 bloco contínuo de tempo com N serviços vinculados (mesmo profissional em sequência, duração = soma). Cliente seleciona via checkbox no BookingEngine; end_time é recomputado server-side pela soma das durações. Tabela de junção appointment_services (migration Documentos/add_appointment_services.sql, RLS espelhando appointments, escrita via service_role). Compat retroativa: appointments.service_id continua NOT NULL, populado com o 1º serviço do bloco.

## Dois itens IMPORTANTES corrigidos nesta sessão
1. **Rollback do appointment órfão** (app/api/appointments.js, ação 'create'): quando o insert em appointment_services falha após o appointment pai já ter sido inserido, o código deleta o pai. O delete de rollback antes era `await ...delete()` sem capturar o retorno — falha silenciosa deixava appointment órfão (pai sem filhos). Correção: capturar `{ error: rollbackError }` e, se presente, `console.error` com o appointment_id órfão para auditoria/limpeza manual. Resposta ao cliente segue 500 genérico. `console.error` em Vercel Function é permitido (a regra "sem console.log em produção" é para frontend) — ver .claude/rules/backend/serverless.md.
2. **Teste de compat legada** (app/src/__tests__/BookingEngine.test.jsx): novo describe garantindo que passar só a prop `service` (singular), sem o array `services`, envia service_ids=[service.id] e service_id=service.id no payload de create.

## Resultado
31/31 testes passando em BookingEngine.test.jsx. Code-reviewer: "Aprovado para deploy: SIM", 0 BLOQUEANTES. Commit local 7f626c3 (sem push). Deploy pendente de pedido explícito do usuário.
