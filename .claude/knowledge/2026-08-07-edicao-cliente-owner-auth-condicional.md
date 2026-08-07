**Agent:** session (orchestrator → general-purpose + code-reviewer)
**Tipo:** feature

# Edição de cliente no painel do dono + autorização condicional na action `update`

## O que foi feito
- Página `app/src/pages/owner/ClientsManager.jsx`: subtítulo trocado para "Cadastre e gerencie seus clientes"; adicionado fluxo de EDIÇÃO de cliente (botão "Editar" por linha + modal pré-preenchido com nome/telefone/data de nascimento), reusando `BirthdateInput` e classes de modal existentes.
- `handleEditSubmit` chama `POST /api/client-identity` com `action:'update'`, envia `Authorization: Bearer <session.access_token>` (padrão de `handleToggleActive`) e trata sessão expirada.

## Decisão de arquitetura — autorização condicional na action `update` de `app/api/client-identity.js`
A action `update` já existia (usada pelo cliente em `ClientProfile.jsx` via prova de posse `current_phone`, pois o cliente NÃO tem sessão Supabase Auth — `auth.uid()` sempre NULL). Não era possível simplesmente exigir Bearer em `update` sem quebrar o cliente. Solução aprovada pelo usuário (opção B):
- SE vier `Authorization: Bearer <token>`: valida via `supabase.auth.getUser(token)` (401 se inválido) e exige vínculo em `salon_clients` cujo `salons.owner_id = authUser.id` para o `client_id` editado (query com `salons!inner`), 403 'Sem permissão' se não houver. Com token válido + vínculo, PULA a guarda de posse `current_phone`. Fecha bypass cross-salão (dono do salão A não edita cliente exclusivo do salão B).
- SE NÃO vier token: mantém guarda por posse `current_phone` (fluxo do cliente intacto).
- `validateInput('update')` só exige `current_phone` quando não há Bearer; `client_id` sempre obrigatório.

## Causa da segunda rodada de review
Primeira rodada apontou (IMPORTANTE) ausência de header Authorization no `handleEditSubmit` — a edição do dono autorizava só por posse. Corrigido com a autorização condicional acima. Segunda rodada: aprovado, 0 bloqueantes/0 importantes.

## Testes
- `app/src/__tests__/client-identity.test.js`: dono com vínculo edita sem current_phone (200); dono sem vínculo (403); token inválido (401); regressões sem token (posse correta 200 / posse errada 403). Helpers `makeChain` (add `limit`), `makeFrom` (filas por tabela), `makeReq` (headers).
- `app/src/__tests__/ClientsManager.test.jsx`: testes de componente para o modal de edição + asserção do header Authorization no fetch.
- Suíte completa: 164 passing / 0 failing (14 arquivos).

## Sugestões pendentes (não bloqueantes)
- `link_to_salon` ainda tem TODO de ownership (lacuna pré-existente análoga).
- `handleEditSubmit` envia `current_phone` mesmo com Bearer (server ignora; opcional remover para clareza).
