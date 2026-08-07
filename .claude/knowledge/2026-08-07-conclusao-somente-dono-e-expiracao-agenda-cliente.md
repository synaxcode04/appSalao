**Agent:** session
**Tipo:** decisao
**Data:** 2026-08-07

# Conclusão de atendimento: somente o dono + expiração da agenda ativa do cliente

## Reversão da decisão

A decisão de 2026-07-11 permitia que **ambos** (dono e cliente) marcassem um atendimento como concluído. Isso foi **revertido em 2026-08-07**: agora **somente o dono** conclui o atendimento. O cliente NÃO conclui mais.

Removido da UI do cliente (`ClientAppointments.jsx`):
- constante `CLIENT_CAN_COMPLETE`, funções `handleComplete` e `canMarkAsCompleted`;
- botão "Confirmar Atendimento";
- disparo do push `completed_by_client`;
- modal de convite à avaliação no Google que aparecia após a conclusão pelo cliente (estado `showGoogleReview`).

O evento de notificação `completed_by_client` sai do mapa de `notify.js` (7 eventos restantes) — feito por outro agent.

## Novo comportamento: expiração de 15 minutos

Um agendamento com `status === 'scheduled'` **some da agenda ativa do cliente 15 minutos após o seu horário de início** e passa a ser exibido no **histórico** — **sem mudar de status no banco** (continua `scheduled`; é só apresentação/filtro, não há job de reset nem UPDATE).

- Regra pura: `isAppointmentExpired(appt, now)` em `app/src/utils/appointmentExpiry.js` (`EXPIRY_GRACE_MS = 15 * 60 * 1000`). Horário montado no fuso **local** via `new Date(\`${appt.appointment_date}T${appt.start_time}\`)` — nunca via `toISOString`/UTC (isso já causou inconsistência de fuso no código antigo). Retorna `true` só quando `status === 'scheduled'` e `now > start + 15min`.
- Agenda ativa (`ClientAppointments.jsx`): filtra `!isAppointmentExpired(a)` antes de renderizar.
- Histórico (`api/appointments.js`, action `list_history`): passou a buscar `completed` E `scheduled` com `appointment_date <= hoje`, e no Node filtra os `scheduled` mantendo só os expirados pela mesma regra de 15 min (lógica replicada localmente pois `api/` não importa de `src/`). Todos os `completed` continuam aparecendo. Ordenação por data desc mantida; contrato `{ appointments: [...] }` preservado.

## Arquivos afetados

- `app/src/pages/client/ClientAppointments.jsx` (remoções + filtro de expiração)
- `app/src/utils/appointmentExpiry.js` (novo util puro)
- `app/src/__tests__/appointmentExpiry.test.js` (novo, 7 testes)
- `app/api/appointments.js` (action `list_history`)
- `Documentos/SPEC.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/rules/convencoes-gerais.md`, `.agents/rules/convencoes-gerais.md` (sincronização de docs/harness)
