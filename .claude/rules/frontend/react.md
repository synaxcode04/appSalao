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

**PWA**
- `window.matchMedia('(display-mode: standalone)')` existe em `Welcome.jsx` para detectar instalação. Em jsdom (testes) isso lança — já está mockado globalmente em `setup.js`, não re-mock por arquivo.
- O service worker só registra em HTTPS ou localhost. O `basicSsl()` do Vite provê isso em dev — não remova.

**Separação de roles**
- `owner` → `OwnerLayout` → `pages/owner/*`
- `client` → `ClientLayout` → `pages/client/*`
- `admin` → `AdminLayout` → `pages/admin/*`
- Nunca importe um componente de `pages/owner/` dentro de um layout de `client` — a separação é intencional e reflete a separação de contexto de dados.

**Restrições**
- Sem `console.log` em código de produção.
- Sem prop-types — nomes descritivos são o contrato do componente.
- Export default no final do arquivo, nunca inline na declaração.
