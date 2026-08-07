# PATCH 409 no OneSignal por OneSignal.login duplicado (fluxo do dono em App.jsx)

**Agent:** notifier
**Tipo:** bug

## Problema
No fluxo do dono, o `useEffect` de `app/src/App.jsx` chamava `OneSignal.login(external_id)` de forma repetida para o mesmo `external_id`, gerando **PATCH 409** na API do OneSignal. O disparo duplicado vinha de reexecuções do efeito sob **React StrictMode**, **HMR** em dev e possíveis **races** de re-render.

## Solução
- Adicionado guard de dedupe `lastLoggedInId` no `useEffect`: só chama `OneSignal.login` se o `external_id` for diferente do último já logado, evitando o login duplicado.
- No **logout**, o `lastLoggedInId` é resetado para permitir o próximo login legítimo.

## Diferença em relação ao ClientSessionContext
A recuperação/dedupe já existente em `app/src/contexts/ClientSessionContext.jsx` (fluxo do cliente / sessão leve) **não foi tocada** — é um mecanismo separado. Este fix é específico do login do dono em `App.jsx`.
