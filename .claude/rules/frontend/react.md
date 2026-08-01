---
globs: app/src/**
---

## Frontend React — App Salão

Contexto que não emerge da leitura dos componentes.

**Acesso ao Supabase**
- Sempre importe de `../supabase` (ou caminho relativo equivalente ao singleton). Nunca instancie `createClient` diretamente em componentes.
- Queries em `useEffect` precisam de flag `mounted` ou cleanup para evitar `setState` após unmount — especialmente em páginas com navegação rápida.

**Motor de agendamento**
- `BookingEngine` recebe `workingHours`, `appointments` e `service` como props — ele não faz fetch próprio. O pai busca os dados.
- Horários chegam como string `"HH:MM:SS"`. Compare como string (`"10:00" < "11:00"` funciona) ou converta para minutos totais.
- Apenas `status = 'scheduled'` bloqueia slot. `'canceled'` e `'completed'` são ignorados na checagem de conflito.
- Escrita de agendamento do cliente (INSERT/UPDATE) NÃO vai mais direto pro Supabase (`supabase.from('appointments')`) — vai para a Vercel Function `app/api/appointments.js` (`service_role`), porque o cliente não tem `auth.uid()` (ver `seguranca.md`, sessão leve). Escrita do dono continua via Supabase client normal (ele tem sessão Auth real).

**Identidade do cliente — sessão leve (decisão de 2026-08-01)**
- O cliente NÃO usa Supabase Auth. Identidade (`client_id`, telefone, nome) vem de `ClientSessionContext` (`app/src/contexts/ClientSessionContext.jsx`), persistida em localStorage, escopada por slug do salão (`ClientSessionProvider slug={slug}` em `SalonLayout.jsx`).
- **Exceção aprovada e escopada** à regra "sem Context/Zustand/Redux" — vale só para `ClientSessionContext`, não abre precedente para introduzir gerenciamento de estado global em outras áreas.
- Rotas do cliente (`agenda`, `historico`, `perfil` dentro de `/s/:slug`) usam `ClientRoute` (`app/src/components/ClientRoute.jsx`), NÃO `ProtectedRoute` — `ProtectedRoute` continua exclusivo para `owner`/`admin` (que têm sessão Auth real).
- `Login.jsx` (email/senha) é **só para dono/admin**. Cliente nunca deve ser redirecionado para lá — o reconhecimento/cadastro por telefone acontece inline via `ClientIdentityForm.jsx` (usado dentro do `BookingEngine` e em `Register.jsx`).

**PWA**
- `window.matchMedia('(display-mode: standalone)')` existe em `Welcome.jsx` para detectar instalação. Em jsdom (testes) isso lança — já está mockado globalmente em `setup.js`, não re-mock por arquivo.
- O service worker só registra em HTTPS ou localhost. O `basicSsl()` do Vite provê isso em dev — não remova.

**Separação de roles**
- `owner` → `OwnerLayout` → `pages/owner/*`
- `client` → `SalonLayout` (árvore `/s/:slug`) → `pages/client/*` — não existe mais `ClientLayout` separado; o cliente sempre acessa por link de salão, nunca por rota solta.
- `admin` → `AdminLayout` → `pages/admin/*`
- Nunca importe um componente de `pages/owner/` dentro do fluxo de `client` — a separação é intencional e reflete a separação de contexto de dados.

**Restrições**
- Sem `console.log` em código de produção.
- Sem prop-types — nomes descritivos são o contrato do componente.
- Export default no final do arquivo, nunca inline na declaração.
