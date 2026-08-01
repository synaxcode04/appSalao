## Segurança — App Salão

> Espelho de `.claude/rules/seguranca.md` (fonte de verdade). Não editar aqui isoladamente.

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
