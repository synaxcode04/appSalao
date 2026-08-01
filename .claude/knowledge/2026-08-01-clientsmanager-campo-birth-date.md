---
**Agent:** general-purpose (via orchestrator)
**Tipo:** bug

# Campo Data de Nascimento faltando no cadastro presencial de cliente (ClientsManager)

## Problema
A tela `app/src/pages/owner/ClientsManager.jsx` (rota `/painel/clientes`, cadastro presencial de cliente pelo dono) só tinha os campos Telefone e Nome completo. Faltava o campo Data de Nascimento — um dos 3 campos obrigatórios do pedido original (nome, WhatsApp, data de nascimento).

## Causa raiz
Escopo incompleto na implementação da tela do dono. Além do frontend, a Vercel Function `app/api/client-identity.js` não aceitava nem gravava `birth_date` em nenhuma ação (`create_or_get`, `link_to_salon`) — o INSERT em `clients` só passava `phone` e `full_name`. O util `app/src/utils/clientIdentity.js` também não repassava o campo.

## Solução aplicada
- `ClientsManager.jsx`: estado `birthDate` + `<input type="date" required>` após o nome; `birth_date` incluído no body do fetch; reset após sucesso. Sem libs de UI (CSS próprio). `<input type="date">` emite ISO `YYYY-MM-DD`, aceito direto pela coluna DATE do Postgres, sem conversão.
- `client-identity.js`: `birth_date` extraído de `req.body` e incluído condicionalmente (`...(birth_date ? { birth_date } : {})`) no INSERT de `create_or_get` e `link_to_salon`. Opcional no backend para não quebrar Register.jsx/util; obrigatoriedade só na UI. Path de cliente existente não sobrescreve.
- `clientIdentity.js`: `createOrGetClient` e `linkClientToSalon` repassam `birth_date` opcional quando presente.
- Testes: `npm run test:run` (vitest) = 25/25 passando. Sem testes dedicados de client-identity/ClientsManager.

## PENDÊNCIA CRÍTICA (bloqueia end-to-end)
A coluna `birth_date` NÃO existe em `public.clients`. O `Documentos/client_identity.sql` define apenas `id`, `phone`, `full_name`, `created_at`. Grep no repo por `birth_date`/`birthDate` = zero matches antes desta correção. A premissa do pedido (coluna já existente) não se confirmou. É necessário rodar migração `ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birth_date DATE;` (domínio rls-security) antes do próximo deploy, senão o INSERT do ClientsManager falhará com erro de coluna desconhecida. A Function usa service_role (bypassa RLS), então nenhuma policy nova é necessária — apenas a coluna.

## Contexto
Faz parte do lote de correções pós-deploy sendo consolidado (erro 400 na agenda investigado em paralelo). Deploy adiado até consolidar.
---
