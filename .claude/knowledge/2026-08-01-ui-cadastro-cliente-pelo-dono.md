# UI — Cadastro de cliente pelo dono (identidade global por telefone)

**Agent:** general-purpose
**Tipo:** feature
**Data:** 2026-08-01

## Contexto
Fase 2 (parte B) do plano "cadastro de cliente global por telefone" (Opção A).
Schema (`clients` + `salon_clients`) e a Vercel Function `app/api/client-identity.js`
já estavam prontos. Esta entrega é apenas a UI na área do DONO.

## O que foi criado
- `app/src/pages/owner/ClientsManager.jsx` — tela do dono para cadastrar/vincular cliente.
  - Formulário: telefone (chave de identidade) + nome completo.
  - Submit chama `fetch('/api/client-identity', { action: 'link_to_salon', phone, full_name, salon_id })`.
  - `salon_id` vem do `useOutletContext()` (o `OwnerLayout` provê `{ salon }`).
  - Listagem dos clientes vinculados: SELECT direto via supabase singleton em
    `salon_clients` com join `clients ( id, phone, full_name )`, filtrado por `salon_id`.
    A RLS já permite esse SELECT ao dono (policy "Owners can view their salon_clients"
    e "Owners can view clients of their salons").

## Integração com `link_to_salon`
A Function internamente faz create_or_get + vínculo idempotente (upsert em
`salon_clients` com onConflict `salon_id,client_id`). O frontend nunca escreve
direto nessas tabelas — RLS bloqueia escrita do authenticated; só service_role grava.

## UX: cliente novo vs. reutilizado
A resposta HTTP 200 de `link_to_salon` retorna `salon_client` (com `created_at`) e
`client_id`, mas NÃO distingue explicitamente cliente global novo de reutilizado.
Heurística usada: se `salon_client.created_at` é recente (< 15s), o vínculo acabou
de ser criado → mensagem "cliente vinculado ao seu salão; se o telefone já existia
em outro salão, a mesma identidade foi reutilizada". Se o vínculo já existia (upsert
não criou linha nova / created_at antigo) → "este cliente já estava vinculado ao seu
salão". Erros mostram a mensagem `error` da Function.

Observação: a distinção fina "cliente global criado agora vs. reutilizado de outro
salão" não é possível com o payload atual da Function — a copy comunica a reutilização
de identidade de forma geral. Se no futuro a Function retornar um flag `client_created`,
a UX pode ser refinada.

## Rota e navegação
- Rota registrada em `App.jsx`: `/painel/clientes` dentro do bloco owner protegido por
  `<ProtectedRoute requiredRole="owner">` → `OwnerLayout`. Elemento `<ClientsManager />`.
- Item de menu "Clientes" (ícone `UserPlus`) adicionado ao submenu "Cadastros" do
  `OwnerLayout`, com detecção de open-state para `/clientes`.

## CSS
Adicionado `.clients-feedback` (+ variantes `linked` / `existing` / `error`) ao
`App.css` — CSS próprio, mobile-first, sem framework externo.

## Restrições respeitadas
- Controle de acesso só via `ProtectedRoute` (sem inline `if(role)`).
- Supabase singleton (`import { supabase } from '../../supabase'`).
- Cleanup/mounted flag no `useEffect` de listagem.
- Sem console.log, sem prop-types, export default no final.
- Não tocou em .sql, client-identity.js, Register.jsx nem pages/client/.

## Build
`npm run build` em `app/` passou (vite v8, built in ~2.3s).
