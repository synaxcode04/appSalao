**Agent:** session (orchestrator + rls-security, booking-engine, general-purpose, code-reviewer)
**Tipo:** feature

# Inativação de cliente por salão (salon_clients.is_active)

## Necessidade
Dono inativa um cliente APENAS no salão dele; estado por vínculo em `public.salon_clients.is_active`; inativar bloqueia SOMENTE novos agendamentos naquele salão; histórico e presença na lista permanecem; não afeta identidade global nem outros salões.

## Solução SQL (Seção 9 de Documentos/client_identity.sql)
- Coluna `is_active BOOLEAN NOT NULL DEFAULT true`.
- Função SECURITY DEFINER `public.is_client_blocked_at_salon(p_salon_id, p_client_id)` que retorna `true` só se existir vínculo com `is_active=false` (ausência de vínculo NÃO bloqueia).
- Policy INSERT de appointments `'Clients can insert their own appointments'` reforçada com `AND NOT public.is_client_blocked_at_salon(salon_id, client_id)`, preservando `auth.uid() IS NOT NULL AND client_id = auth.uid()`.

## Fato arquitetural importante (evita reinvestigação)
O cliente logado TEM sessão Supabase Auth real; a "sessão leve" `ClientSessionContext` é só conveniência no frontend. O backfill preservou UUIDs (`clients.id = profiles.id = auth.uid()`), então `auth.uid() == client_id` no INSERT. A função é SECURITY DEFINER porque o CLIENTE não tem SELECT em `salon_clients` (policy Seção 8 é owner-only), não por ausência de `auth.uid()`.

## Serverless (app/api/client-identity.js)
Actions `toggle_active` (dono altera `is_active`, via service_role) e `check_active` (cliente consulta próprio bloqueio → `{ blocked }`). AMBAS exigem `Authorization: Bearer <access_token>`; `toggle_active` valida `owner_id` do salon = `user.id` (403 senão); `check_active` valida `user.id === client_id`. Isso corrigiu um IDOR (bloqueante) apontado na review — sem a verificação, qualquer um inativava clientes de qualquer salão. Escrita em `salon_clients` só via service_role.

## Frontend
- `BookingEngine.jsx` faz pré-check `check_active` antes do insert (mensagem amigável 'Não é possível agendar no momento. Entre em contato com o salão.') + backstop no erro de RLS (`error.message` 'row-level security' ou `code` '42501'); envia Bearer token; falha de rede no check NÃO bloqueia (banco é enforcement real).
- `ClientsManager.jsx`: toggle Inativar/Reativar por linha, badge 'Inativo', guard por linha, envia Bearer token.

## Pendências conhecidas (não resolvidas nesta feature)
1. Action `link_to_salon` compartilha a ausência de verificação de ownership — marcada com TODO, comportamento não alterado.
2. Re-vincular via `link_to_salon` não reativa vínculo previamente inativado (upsert preserva `is_active=false`).
3. Campo `birth_date` com required no ClientsManager é escopo de outro agent em paralelo — não tocado.

## Testes
`app/src/__tests__/BookingEngine.test.jsx` — 28 testes verdes, incluindo describe 'BookingEngine — handleConfirm bloqueio de cliente inativo' (blocked true não insere, blocked false insere, backstop RLS mostra mensagem amigável).

## Validação manual pendente antes do deploy
Rodar o checklist da Seção 9 no Supabase Dashboard (cliente inativo bloqueado, ativo permitido, sem vínculo permitido, isolamento entre salões).
