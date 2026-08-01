# Fix: 406 working_hours e 500 create (client_id duplo)

**Agent:** booking-engine + session (orchestrator)
**Tipo:** bug
**Data:** 2026-08-01

## Sintoma (round 2, com evidência real do console)

Confirmar agendamento em produção (https://appsalao-psi.vercel.app) gerava: (1) GET working_hours?day_of_week=eq.0 → 406; (2) POST /api/appointments action=create → 500 com toast genérico. Telefone de teste 997452809 = cliente "João da Silva", um profiles com role='owner' que também tinha agendamentos como cliente e foi migrado para clients pelo backfill genérico (Seção 3 do client_identity.sql).

## Correções aplicadas (código)

- **406 (causa raiz confirmada):** BookingEngine.jsx usava `.single()` na query de working_hours; PostgREST retorna 406 quando 0 linhas (dia sem expediente, ex: domingo=0). Trocado por `.maybeSingle()` + captura de erro. Erro cosmético/console — NÃO era a causa do 500 (independentes; botão Confirmar fica desabilitado em dia sem slots). Edge case residual anotado: selectedSlot não é resetado quando availableSlots esvazia ao trocar a data.
- **500 (endurecimento, causa raiz ainda NÃO confirmada por log):** appointments.js create mapeava só 23P01→409. Adicionados mapeamentos: 23505→409, P0001 com "Conflito de agendamento"→409, 23503(FK)→400, 23502(not-null)→400, 23514(check)→400. console.error do createError completo mantido (é o que aparece no log da Vercel).

## Análise da hipótese client_id "duplo"

- appointments.client_id FK foi repontada para clients(id) (client_identity.sql Seção 6). Backfill preservou UUID (clients.id=profiles.id) mas atribuiu phone placeholder 'PENDING-<id>' se o profile.phone era nulo/duplicado.
- create NÃO faz upsert em salon_clients (só lê com maybeSingle) → conflito de UNIQUE em salon_clients NÃO é causa do create. Descartado como causa do 500 no create.
- Candidato client-specific mais provável: FK 23503 se o client_id enviado não existe em clients (cenário: João re-identifica pelo phone real 997452809 e resolve/cria um clients row diferente do UUID backfillado com phone PENDING; ClientSessionContext stale poderia enviar o UUID antigo só-em-profiles).

## Pendência para confirmar causa raiz do 500 (NÃO resolvido)

Requer evidência real (não disponível programaticamente — CLI Vercel não autenticada neste ambiente). Duas vias:

1. Vercel Dashboard → deployment appsalao → Functions/Logs → filtrar /api/appointments → capturar linha `Supabase create appointment error: {..., error: {...}}` e ler error.code/message/details/hint.
2. Diagnóstico SQL no Supabase para o client_id do João: verificar se existe em clients; se há linha PENDING duplicada; se há 2 identidades para o mesmo phone; e tentar INSERT equivalente em appointments via service_role para reproduzir e capturar a mensagem do Postgres.

## Status

406: corrigido. 500: mitigado/diagnóstico melhorado (códigos mapeados) mas causa raiz definitiva pendente de log/SQL. Não aprovar deploy como "bug resolvido" até confirmar o error.code real do 500.
