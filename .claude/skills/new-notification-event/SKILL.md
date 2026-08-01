---
name: new-notification-event
description: Adiciona um novo evento de notificação push ao sistema, atualizando notify.js, notification.js e gerando o teste correspondente em uma única operação.
---

## O que esta skill faz

Dado o nome de um novo evento de notificação, atualiza os três arquivos envolvidos no fluxo de push (serverless, utilitário e testes) seguindo o padrão dos 8 eventos já definidos no SPEC.

## Arquivos envolvidos

- `app/api/notify.js` — serverless function na Vercel que recebe o evento e chama a API do OneSignal
- `app/src/utils/notification.js` — helper `dispatchNotification(event, payload)` chamado pelos componentes
- `app/src/__tests__/notification.test.js` — testes unitários com mock de fetch

## Instruções

1. Leia `Documentos/SPEC.md` seção de Notificações para entender os 8 eventos existentes e o padrão de `recipientRole`.
2. Leia `app/api/notify.js` e `app/src/utils/notification.js` para entender a estrutura atual.
3. Adicione o novo evento seguindo este contrato:

**Em `notification.js`:**
```js
// Adicionar ao objeto de mapeamento de eventos
[NOME_DO_EVENTO]: {
  recipientRole: 'owner' | 'client', // quem recebe
  title: 'Título da notificação',
  body: (payload) => `Mensagem dinâmica com ${payload.campo}`,
},
```

**Em `notify.js`:**
- Valide que o `event` recebido está na lista de eventos conhecidos
- Se não estiver, retorne `400 { error: 'evento desconhecido' }`

4. Adicione o teste no arquivo de testes seguindo o padrão existente.
5. Execute `npm run test:run` e confirme que todos os testes passam antes de encerrar.

## Exemplo

**Input:** "Adicione notificação de nova avaliação para o dono"

**Output:**
- `notification.js` com entrada `new_review: { recipientRole: 'owner', ... }`
- `notify.js` com `new_review` na lista de eventos válidos
- `notification.test.js` com teste: `dispatchNotification('new_review', {...})` → `recipientRole: 'owner'`

## Quando NÃO usar

- Não use se o evento já existe nos 8 do SPEC — apenas corrija o existente.
- Não use para notificações in-app (toast via `react-hot-toast`) — essa skill é exclusiva para push via OneSignal.
- Não crie eventos que não tenham sido validados no SPEC ou aprovados como requisito — evita lógica órfã.
