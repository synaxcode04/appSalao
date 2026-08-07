# AGENTS.md — App Salão

Instruções para agents e assistentes de IA. Complementa `CLAUDE.md` com regras por submódulo do SPEC.
Leia `CLAUDE.md` primeiro — este arquivo apenas adiciona, não repete.

---

## Módulo: Auth & Perfis
> `Login.jsx`, `Register.jsx`, `ProtectedRoute.jsx`, `supabase.js`

- Client Supabase é singleton — importe de `supabase.js`, nunca instancie `createClient` em outro arquivo.
- Roles: `owner`, `client`, `admin`. Controle de acesso exclusivamente via `ProtectedRoute` — nunca inlineie `if (role === 'owner')` em páginas.
- `auth.uid()` retorna NULL para não autenticados. Policy sem verificação de NULL = acesso anônimo silencioso.
- Subscriptions Realtime no `useEffect` devem retornar `subscription.unsubscribe` no cleanup — senão vaza listener.

---

## Módulo: Motor de Agendamento
> `BookingEngine.jsx`, `SalonDetails.jsx`

- Horários do banco chegam como string `"HH:MM:SS"` (PostgreSQL TIME). Compare como string ou converta para minutos.
- Apenas `status = 'scheduled'` bloqueia slot. `'canceled'` e `'completed'` não contam como conflito.
- Conflito por `professional_id` quando há profissional cadastrado; por `salon_id` quando não há.
- Slot válido somente se `start_time + duration_minutes <= salão.end_time`.
- Break: exclua slots que comecem **ou** terminem dentro do intervalo de almoço — não apenas os que começam nele.
- `BookingEngine` não faz fetch — recebe `workingHours`, `appointments`, `service` como props. O pai busca os dados.

---

## Módulo: Painel do Proprietário
> `pages/owner/*`, `OwnerLayout.jsx`

- `OwnerLayout` deve verificar `salon.status === 'expired'` antes de renderizar `<Outlet />`. Se suspenso, renderiza `<SuspendedScreen />`.
- Visual do `SuspendedScreen` é **decisão em aberto** — crie componente mínimo funcional, não defina o design final.
- Toda query de dados do dono deve filtrar por `salon_id` do usuário logado. Nunca busque sem escopo de salão.
- Queries sem `salon_id` em tabelas com multi-tenancy vão expor dados de outros salões.

---

## Módulo: Notificações
> `utils/notification.js`, `api/notify.js`

7 eventos obrigatórios e seus destinatários:

| Evento | Destinatário |
|--------|-------------|
| `new_appointment` | owner |
| `client_cancel` | owner |
| `owner_cancel` | client |
| `client_reschedule` | owner |
| `owner_reschedule` | client |
| `owner_complete` | client |
| `new_review` | owner |

- `recipientRole` errado = notificação para a pessoa errada. Verifique a tabela acima antes de implementar.
- API key do OneSignal é server-side only (`api/notify.js`) — sem prefixo `VITE_`, nunca exposta ao cliente.
- `notify.js` retorna HTTP 400 para evento desconhecido. Nunca retorna 200 silencioso.
- Em testes: `vi.fn()` para mockar `fetch` — nunca chame a API real.

---

## Módulo: Controle de Licenças
> `pages/admin/*`, `AdminLayout.jsx`, `salons.status`

- Admin é identificado por `profiles.role = 'admin'` — acesso via `/admin`, login com `israel.appc@gmail.com`.
- Suspender = `status = 'expired'` (com `subscription_expires_at`). Quando suspenso: `OwnerLayout` bloqueia filhos e `SalonLayout` bloqueia agendamento.
- Cobrança é externa (Mercado Pago ou manual) — sem integração de pagamento no app.

---

## Segurança — vale para todos os módulos

- `salon_id` sozinho não prova ownership. Sempre: `salons.owner_id = auth.uid()` via EXISTS subquery.
- `WITH CHECK (true)` em tabelas com `salon_id` permite que qualquer autenticado altere dados de qualquer salão.
- `app/.env` nunca commitado. Se `git ls-files app/.env` retornar o arquivo, pare e reporte.

---

## Decisões em aberto — não implemente sem aprovação explícita

- Visual e conteúdo do `SuspendedScreen`
- Quem marca atendimento como concluído (dono, cliente ou ambos)
- Reagendamento: editar registro ou cancelar + criar novo
