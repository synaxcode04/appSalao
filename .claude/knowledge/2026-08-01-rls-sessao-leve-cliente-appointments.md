**Agent:** session (orchestrator + rls-security + devops + booking-engine + code-reviewer)
**Tipo:** bug

# RLS bloqueava operações do cliente por causa da sessão leve (auth.uid() NULL)

## Problema
O cliente do App Salão usa "sessão leve" (ClientSessionContext em app/src/contexts/): guarda {client_id, phone, full_name} em localStorage e NUNCA cria sessão Supabase Auth. Logo `auth.uid()` é sempre NULL no contexto do cliente. Todas as policies RLS de cliente em appointments/reviews/notifications dependiam de `auth.uid() = client_id`, então rejeitavam TODA operação do cliente em produção: agendar (INSERT), ver agendamentos/histórico (SELECT), cancelar/concluir (UPDATE) e avaliar (INSERT reviews). A leitura de slots do BookingEngine (SELECT appointments) e o INSERT de notifications também quebravam.

## Causa raiz
Premissa incorreta no comentário da Seção 9.3 de Documentos/client_identity.sql afirmando que "o cliente possui sessão Supabase Auth real (clients.id = profiles.id)". Isso nunca foi verdade no modelo de sessão leve (Opção 4 aprovada). O dono do salão, sim, tem sessão Auth real — policies do dono (salons.owner_id = auth.uid()) permanecem corretas.

## Solução aplicada
- Documentos/client_identity.sql "Seção 10": DROP das policies de cliente quebradas (appointments SELECT/INSERT/UPDATE, reviews INSERT, notifications SELECT/UPDATE/INSERT). Nenhuma policy substituta para anon/authenticated — toda operação de cliente passa a ser feita por Vercel Function com service_role (que bypassa RLS). Policies do dono e "Reviews are publicly viewable" intocadas.
- Nova Vercel Function app/api/appointments.js (service_role, env SUPABASE_SERVICE_ROLE_KEY, sem VITE_) com actions: list_scheduled, list_by_client, list_history, create, reschedule, cancel, complete, create_review, mark_notifications_read, list_notifications, get_salon_contact. Valida vínculo salon_clients + is_active, recheca conflito de horário server-side antes do INSERT, retorna owner_id para o push e phone do salão para o WhatsApp.
- Frontend migrado de supabase.from(...) direto para a Function: BookingEngine.jsx, ClientAppointments.jsx, ClientHistory.jsx, SalonDetails.jsx. Removidos inserts de notification duplicados e queries diretas a salons/profiles que quebravam por RLS.
- 28 testes Vitest verdes (mocks de BookingEngine migrados de supabase.insert para fetch).

## Padrão a reusar
Qualquer operação de dados do CLIENTE deve passar por Function service_role (padrão de app/api/client-identity.js), nunca por supabase.from direto no frontend, porque a sessão leve não tem auth.uid(). RLS de cliente = DENY para anon; service_role é o único caminho de escrita/leitura de cliente.
