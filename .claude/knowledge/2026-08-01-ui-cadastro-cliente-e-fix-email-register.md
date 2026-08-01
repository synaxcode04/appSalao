# UI de cadastro de cliente por identidade global + fix do email em profiles

**Data:** 2026-08-01
**Agent:** general-purpose
**Tipo:** feature+bug

## Contexto
Fase 2 (parte A) do plano "cadastro de cliente global por telefone" (Opção A).
As Fases 1 (schema: tabelas globais `clients` + `salon_clients`) e 1b (Vercel
Function `app/api/client-identity.js`) já estavam prontas. Esta entrega cobre a
UI de cadastro do cliente, consumindo a Function server-side.

## Arquitetura consumida (não reaberta)
- Cliente NÃO fica em `auth.users`. Identidade global vive na tabela `clients`
  (telefone é a chave única) + `salon_clients` (N:N). Ambas com RLS que bloqueia
  acesso direto do frontend.
- O frontend NUNCA toca `clients`/`salon_clients` pelo supabase client. Todo
  acesso é via a Function `POST /api/client-identity` com actions `lookup`,
  `create_or_get`, `link_to_salon`. A Function usa `service_role` (bypassa RLS).
  A normalização do telefone (`replace(/\D/g,'')`) é feita no servidor.

## Feature — rework da UI de cadastro do cliente
- Novo helper `app/src/utils/clientIdentity.js` seguindo o padrão de
  `notification.js` (fetch + checagem de `response.ok`, lança `Error` com a
  mensagem da Function). Exporta `createOrGetClient({ phone, full_name })` e
  `linkClientToSalon({ phone, full_name, salon_id })`.
- `app/src/pages/Register.jsx`: o `handleRegister` agora ramifica por `role`.
  - `role === 'client'` → `handleClientRegister`: valida nome/telefone não-vazios
    no cliente, e chama a Function. Se o `redirect` aponta para `/s/<slug>`,
    extrai o `salon_id` (primeiros 36 chars do slug, mesmo formato de
    `SalonLayout`) e chama `link_to_salon`; caso contrário chama `create_or_get`.
    Trata loading / erro (resposta não-ok) / sucesso (navega para o redirect).
    O cliente NÃO passa por `supabase.auth.signUp` nem grava em `profiles`.
  - `role === 'owner'` → fluxo antigo mantido (auth + profiles + salão + checkout).
- Campos `E-mail` e `Senha` do formulário passaram a ser renderizados apenas
  para `owner` (o cliente não tem credenciais de auth).

## Bug corrigido — coluna `email` inexistente em `profiles`
- Causa raiz: `Register.jsx` inseria `email` no `insert` de `profiles`, mas a
  tabela `profiles` (ver `Documentos/schema.sql`) só tem `id, role, full_name,
  phone, gender, search_radius, created_at` — não existe coluna `email`. Isso
  fazia o insert falhar / gravar campo fantasma no cadastro de owner.
- Correção: removido o campo `email` do objeto do `insert` em `profiles`. O
  email do owner continua sendo usado apenas no `supabase.auth.signUp` (auth) e
  no payload do checkout (`contactEmail`), onde de fato pertence.

## Verificação
- `npm run build` em `app/` — sucesso (built, PWA gerado).

## Restrições respeitadas
- Sem edição de `.sql`, da Function, nem de arquivos de `pages/owner/` /
  `OwnerLayout`. Sem Context/Redux/Zustand, sem novas dependências, CSS próprio
  (classes existentes `auth-screen`/`auth-form`/`btn-primary`), sem `console.log`
  novo, export default no final.
