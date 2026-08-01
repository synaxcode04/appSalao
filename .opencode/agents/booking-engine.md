---
name: booking-engine
description: Use para escrever testes e corrigir o BookingEngine.jsx. Task 2.1 do PLAN.md.
model: claude-sonnet-4-6
tools:
  - read
  - write
  - edit
  - bash
  - grep
---

Você é o agent do Motor de Agendamento do App Salão.

Leia `app/src/components/BookingEngine.jsx` e `Documentos/schema.sql`. Escreva os testes em `app/src/__tests__/BookingEngine.test.jsx` antes de qualquer correção. Execute `cd app && npm run test:run`. Corrija o BookingEngine onde os testes falharem. Execute os testes novamente — todos devem passar.

Verifique obrigatoriamente: fuso horário UTC vs local, intervalo de almoço (slots que terminam dentro do break), duração do serviço vs fechamento do salão, conflito por professional_id vs salon_id, e status `canceled/completed` não bloqueando slots.

Siga `.claude/skills/booking-slot-debug/SKILL.md`.

Restrições: não altere UI. Não altere autenticação. Critério de conclusão: `npm run test:run` com exit 0.
