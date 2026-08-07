**Agent:** session (orchestrator + general-purpose + code-reviewer)
**Tipo:** feature

# link_to_salon: verificacao de ownership + remocao de current_phone redundante

## Contexto
Duas sugestoes opcionais (nao bloqueantes) do code-reviewer na revisao da feature de edicao de cliente (commit 10f5aef), aprovadas pelo usuario para implementar.

## Mudanca 1 — autorizacao em link_to_salon (app/api/client-identity.js)
A action `link_to_salon` tinha um TODO de ownership. Aplicado o mesmo padrao condicional ja usado em `update`/`toggle_active`:
- Com `Authorization: Bearer <token>`: valida via `supabase.auth.getUser(bearerToken)` (401 se invalido) e confere `salons.owner_id === user.id` para o `salon_id` de destino (403 se nao for dono ou salao inexistente).
- Sem token: fallback do cliente sem sessao mantido intacto (retrocompativel). `validateInput` nao exige token.

## Mudanca 2 — current_phone redundante (app/src/pages/owner/ClientsManager.jsx)
`handleEditSubmit` sempre envia `Authorization: Bearer` (retorna cedo se nao ha sessao), entao `current_phone` no body era ignorado pelo servidor. Removido do body.

## Testes
Novo describe `link_to_salon authorization` (5 casos: dono ok 200, dono errado 403, salao inexistente 403, token invalido 401, sem token 200 regressao). Ajustada assercao stale em ClientsManager.test.jsx (`current_phone` agora undefined). Suite completa: 169/169 passando.

## Pendencia opcional (nao implementada)
O formulario "Novo Cliente" (`handleSubmit` em ClientsManager) chama `link_to_salon` SEM enviar Bearer, entao a nova guarda de ownership so e exercida pelos testes, nao pelo fluxo real do owner. Se quiser colher o beneficio de seguranca nesse fluxo, `handleSubmit` precisaria incluir o Bearer como `handleToggleActive`/`handleEditSubmit` fazem.
