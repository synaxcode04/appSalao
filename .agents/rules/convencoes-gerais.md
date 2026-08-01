## Convenções Gerais — App Salão

> Espelho de `.claude/rules/convencoes-gerais.md` (fonte de verdade). Não editar aqui isoladamente.

Padrões que não emergem da leitura do código.

**Supabase**
- O client é singleton em `app/src/supabase.js`. Nunca crie uma segunda instância em outro arquivo.
- Subscriptions Realtime em `useEffect` devem sempre retornar `subscription.unsubscribe` no cleanup — senão vaza listener.
- Datas e horários chegam do banco em UTC (string `"HH:MM:SS"` para TIME, ISO para TIMESTAMP). Converta para timezone local antes de exibir ou comparar.

**React / Roteamento**
- Rotas são definidas centralmente em `App.jsx` — não há auto-descoberta de arquivos de rota.
- Verificações de acesso por role são feitas exclusivamente via `ProtectedRoute`. Nunca inlineie `if (role === 'owner')` em páginas para controle de acesso.
- Sem gerenciador de estado global — `useState`/`useEffect` + props diretos. Não introduza Context, Zustand ou Redux.

**CSS e UI**
- Mobile-first. Estilos de breakpoint só para tablet/desktop quando necessário.
- Sem frameworks de UI externos (Tailwind, shadcn, MUI) — qualquer adição requer decisão explícita.
- `style={{}}` inline só para valores dinâmicos calculados em JS. Layout e visual vão em `.css`.

**Decisões em aberto — não implemente sem aprovação**
- ~~Visual e conteúdo do `SuspendedScreen`~~ — Resolvido 2026-08-01 — extração do texto inline existente para componente compartilhado, sem novo design.
- Quem marca atendimento como concluído (dono, cliente ou ambos)
- Reagendamento: editar registro existente ou cancelar + criar novo
