# Fix: DashboardHome embed profiles → clients

**Agent:** booking-engine
**Tipo:** bug
**Data:** 2026-08-01

## Causa raiz

Após a migração de `appointments.client_id` de `profiles` para a tabela global `clients`, o componente `DashboardHome.jsx` continuou fazendo um embed PostgREST via `profiles ( full_name, phone )` na query de agendamentos. Como a FK já não aponta para `profiles`, o PostgREST retornava erro, fazendo a seção "Sua Agenda" exibir a mensagem de erro.

## Solução

Em `app/src/pages/owner/DashboardHome.jsx`, linha 103 (select embed) e todas as referências de acesso ao objeto resultado (`appt.profiles.*`):

- **Antes:** `profiles ( full_name, phone )` / `appt.profiles.full_name` / `appt.profiles.phone`
- **Depois:** `clients ( full_name, phone )` / `appt.clients.full_name` / `appt.clients.phone`

Total de 5 ocorrências alteradas em um único arquivo.

## Padrão de referência

Ver `SalonDetails.jsx` (reviews) e `ClientsManager.jsx` (salon_clients) para o padrão de embed com `clients(...)`.

## Arquivos alterados

- `app/src/pages/owner/DashboardHome.jsx` — linhas 103, 219, 223, 224, 459, 462
