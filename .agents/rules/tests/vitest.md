## Testes Vitest — App Salão

> Espelho de `.claude/rules/tests/vitest.md` (fonte de verdade). Não editar aqui isoladamente.

Contexto que não emerge da leitura dos arquivos de teste.

**Mocks obrigatórios**
- Supabase SEMPRE mockado via `vi.mock('../supabase', () => ({ supabase: { auth: { ... }, from: vi.fn() } }))`. Nunca toque o banco real em testes unitários.
- `window.OneSignalDeferred = []` no `beforeAll` de qualquer teste que importe `App.jsx` ou `main.jsx` diretamente.
- `window.matchMedia` já está mockado globalmente em `setup.js` — não re-mock por arquivo, não sobrescreva.

**Convenções de nomenclatura e estrutura**
- Nome do arquivo espelha o source: `BookingEngine.jsx` → `BookingEngine.test.jsx`.
- Use `describe/it` (não `test`) para consistência com os smoke tests existentes.
- Um `describe` por arquivo de source; um `it` por comportamento esperado.

**BookingEngine**
- Teste a lógica de cálculo com dados puros (objetos JS simples) — não renderize o componente para testar slots.
- Se a lógica estiver embutida no JSX sem função exportada, extraia a função antes de escrever o teste.

**ProtectedRoute**
- Envolva em `<MemoryRouter initialEntries={['/painel']}>` para simular rota.
- Mock de sessão: `getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'x', role: 'owner' } } }, error: null })`.

**Notificações**
- Mock de `fetch` com `vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })`.
- Verifique apenas que `fetch` foi chamado com o payload correto — não teste a API do OneSignal.

**Limites de escopo**
- Testes de RLS não vivem aqui — são validados manualmente no Supabase Dashboard após aplicar `rls_fix.sql`.
- Smoke tests de produção vão em `Documentos/smoke_test_result.md`, não aqui.
