# Fluxo de identificação do cliente no agendamento (página pública)

**Agent:** general-purpose
**Tipo:** bug
**Data:** 2026-08-01

## Problema
Na página pública do salão (`/s/:slug`), um visitante sem sessão de cliente que
clicava em "Agendar" e confirmava um horário era redirecionado para
`/login?role=client&redirect=...`, caindo na tela antiga de login por
email/senha (`Login.jsx`), que existe apenas para dono/admin. O modelo atual
identifica cliente por TELEFONE (sem senha), então esse caminho era um beco sem
saída — o cliente não tinha como concluir o agendamento.

## Causa raiz
Resquício do modelo pré-identidade-global-por-telefone. Em
`BookingEngine.jsx` (handleConfirm, linhas ~138-141) o branch `clientId == null`
nunca foi atualizado após a migração para identidade por telefone
(`ClientSessionContext` + `/api/client-identity`). O fluxo por telefone existia
(`loginByPhone`, `createOrGetClient`, `linkClientToSalon`) mas nunca foi
conectado ao ponto de entrada real (página pública). O link "Já tem uma conta?"
em `Register.jsx` também apontava para `Login.jsx` mesmo com `role=client`.

## Solução aplicada
- Novo componente compartilhado `app/src/components/ClientIdentityForm.jsx`:
  fluxo inline por telefone em duas etapas — pede o WhatsApp, faz `lookup`; se o
  cliente já existe globalmente, vincula ao salão (`loginByPhone` →
  `link_to_salon`) e prossegue; se não existe, pede nome + data de nascimento,
  cria+vincula (`linkClientToSalon`) e persiste a sessão.
- `BookingEngine.jsx`: removido o redirect para `/login`. Quando `clientId` é
  nulo e há `loginByPhone` (prop), abre o `ClientIdentityForm` DENTRO do modal.
  Após identificar, um `useEffect([pendingConfirm, clientId])` reexecuta
  `handleConfirm` automaticamente assim que o novo `clientId` chega via prop —
  o agendamento conclui sem o usuário reclicar.
- `SalonDetails.jsx`: passa `loginByPhone` do `useClientSession()` ao
  `BookingEngine`.
- Reuso sem duplicação: máscara de telefone extraída para `formatPhone` em
  `utils/clientIdentity.js` (usada por `Register.jsx` e `ClientIdentityForm`);
  novo helper `lookupClient` (retorna null em 404). Extração completa do form
  para dentro de `Register.jsx` foi deixada de fora para não alterar sua UX de
  etapa única (owner usa email/senha) — só a máscara e as chamadas à Function
  são compartilhadas, conforme o fallback "no mínimo compartilhe helpers".
- `Register.jsx`: link "Já tem uma conta? Entre aqui" ocultado quando
  `role === 'client'` (fluxo owner intacto).

## Escopo NÃO tocado
RLS, `schema.sql`, policies/Function de appointments, `Login.jsx`.

## Testes
`npm run test:run` — 31 testes passando (BookingEngine 13, incluindo 3 novos do
fluxo de identificação: abre form inline sem redirecionar; telefone existente
chama `loginByPhone` com o nome; telefone novo/404 mostra etapa de nome+nascimento).

## Arquivos
- `app/src/components/ClientIdentityForm.jsx` (novo)
- `app/src/components/BookingEngine.jsx`
- `app/src/pages/client/SalonDetails.jsx`
- `app/src/pages/Register.jsx`
- `app/src/utils/clientIdentity.js`
- `app/src/__tests__/BookingEngine.test.jsx`
