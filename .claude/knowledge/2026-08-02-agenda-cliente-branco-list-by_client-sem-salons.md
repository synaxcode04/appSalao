# Agenda do cliente em branco — list_by_client sem join salons

**Agent:** booking-engine (via orchestrator)
**Tipo:** bug
**Data:** 2026-08-02

## Contexto
A aba "Agenda" do cliente (`/s/:slug/agenda`, `app/src/pages/client/ClientAppointments.jsx`) ficava em branco (tela vazia, sem erro visível no console) logo após o cliente fazer um agendamento. Comportamento contraditório: se o cliente não tivesse agendamentos, a tela exibia corretamente a mensagem de estado vazio. Com >=1 agendamento, renderização quebrada.

## Causa raiz
A action `list_by_client` em `app/api/appointments.js` não incluía o join `salons(...)` no `.select()`, mas a UI renderizava `appt.salons.name` e `appt.salons.address`. Isso gerava um erro silencioso de render:

```jsx
// ClientAppointments.jsx, linha ~60
{appointments.map(appt => (
  <div key={appt.id}>
    {appt.salons.name}  // ← appt.salons === undefined → erro
    {appt.salons.address}
  </div>
))}
```

React desmontava a árvore ao encontrar o erro de render não tratado, resultando em tela branca. A inconsistência era evidente: a action `list_history` (mesma página) já incluía `salons(id, name, logo_url, address)` — apenas `list_by_client` estava faltando o join.

## Solução aplicada
Adicionado o join `salons(id, name, logo_url, address)` ao `.select()` da action `list_by_client` em `app/api/appointments.js` (~linha 332), espelhando o que já existia em `list_history`. A mudança garante que todo appointment retornado ao cliente inclui os dados do salão.

```javascript
// app/api/appointments.js, ação list_by_client (antes)
.select('id, created_at, start_time, end_time, status, service_id')

// (depois)
.select('id, created_at, start_time, end_time, status, service_id, salons(id, name, logo_url, address)')
```

Teste de regressão adicionado em `app/src/__tests__/appointments.test.js` para garantir que o payload de `list_by_client` inclua `salons`.

## Resultado
76 testes verdes em `app/src/__tests__/appointments.test.js`. Agenda do cliente renderiza corretamente após agendamento, exibindo nome e endereço do salão.

## Lições
- Sempre alinhar o `.select()` do endpoint com TODOS os campos de joins que a UI consome.
- Um join faltando vira crash de render silencioso (tela branca), não erro de API visível.
- Inconsistência entre endpoints de mesma tabela (list_by_client vs list_history) é sinal de que um foi esquecido em refatoração — usar linter/test para enforçar paridade.
