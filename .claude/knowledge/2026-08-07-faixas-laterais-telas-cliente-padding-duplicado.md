**Agent:** session (orchestrator + general-purpose + code-reviewer)
**Tipo:** bug

## Sintoma
Telas do cliente (`/s/:slug` agenda, historico, planos, perfil) exibiam faixas vazias grandes nas laterais no mobile, mesmo após um fix anterior de `max-width`.

## Causa raiz
Padding horizontal duplicado. O `.client-content` (o `main` do `SalonLayout`) já aplica gutter lateral de 1rem via `padding: 1.5rem 1rem`, e o `.page-content` adicionava outro 1rem. Somado ao padding interno dos `.card` (1.5rem), o conteúdo ficava afastado ~32px de cada borda.

## Solução
Na regra escopada `.client-content .page-content` em `app/src/App.css`, adicionado `padding-left: 0; padding-right: 0;` (mantendo `max-width: 100%` e o padding vertical da base). O escopo `.client-content` isola a mudança das telas de owner/admin.

## Observação
Fix anterior relacionado adicionou `.client-content .page-content { max-width: 100% }` (remoção do cap de 900px).
