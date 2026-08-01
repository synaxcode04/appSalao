## Segurança — App Salão

Restrições que não emergem da leitura do código mas que quebram o sistema se violadas.

**RLS — a única barreira real de dados**
- O `anon key` do Supabase é público por design. RLS é a única proteção — nunca assuma que "a chave não está exposta" é suficiente.
- `salon_id` sozinho **não** prova ownership. Sempre faça o JOIN: `salons.owner_id = auth.uid()`.
- Toda policy INSERT/UPDATE/DELETE em tabela com `salon_id` precisa de `WITH CHECK (EXISTS ...)` — `USING` sozinho não protege escritas.
- `auth.uid()` retorna NULL para não autenticados. Policy sem verificação de NULL concede acesso anônimo silenciosamente.

**Isolamento multi-tenant**
- Toda query que toca dados de salão deve incluir filtro explícito por `salon_id`. Nunca busque "todos os serviços" sem escopo de salão.
- Agendamento sem verificação de conflito no banco pode criar double-booking — a verificação deve ser feita antes do INSERT, não só na UI.

**Serverless**
- A REST API key do OneSignal é server-side only. Nunca inclua em código enviado ao cliente (sem `VITE_` prefix).
- `notify.js` deve retornar 400 para eventos desconhecidos — nunca retorne 200 silencioso para evento inválido.

**Git**
- Se `git ls-files app/.env` retornar o arquivo, pare imediatamente. Não continue sem removê-lo do index.
- Variáveis de ambiente vão em Vercel Dashboard → Settings → Environment Variables (Production + Preview).

**Cliente sem Supabase Auth (sessão leve) — decisão de 2026-08-01**
- O papel `client` NÃO tem sessão Supabase Auth. Ele se identifica por telefone (WhatsApp), sem senha e sem OTP — decisão de produto aceita explicitamente pelo usuário (fricção zero > verificação de posse do número). `auth.uid()` é **sempre NULL** no contexto do cliente.
- Por isso, **nenhuma policy RLS pode depender de `auth.uid() = client_id`** para o papel cliente — isso já causou um bug crítico em produção (agendamento bloqueado). Tabelas `clients`, `salon_clients` e toda escrita de `appointments`/`reviews` feita pelo cliente são acessadas **exclusivamente via Vercel Function com `service_role`** (`app/api/client-identity.js`, `app/api/appointments.js`), nunca via `anon key` direto do frontend.
- A identidade do cliente (`client_id`, telefone, nome) vive em `ClientSessionContext` (localStorage, escopada por slug do salão) — é uma exceção documentada e aprovada à regra de "sem Context" (ver `frontend/react.md`).
- Policies do `owner`/`admin` continuam normalmente baseadas em `auth.uid()` — eles têm sessão Supabase Auth real. Não confundir os dois modelos.
- Inativação de cliente por salão (`salon_clients.is_active`): bloqueia só novos agendamentos naquele salão específico; nunca afeta a identidade global nem o status em outros salões; histórico permanece intacto. Validado via função `SECURITY DEFINER public.is_client_blocked_at_salon`.
