# BookingWizard — etapa 2 mostra só os primeiros horários até clicar

**Agent:** general-purpose (via orchestrator)
**Tipo:** bug
**Data:** 2026-08-07

## Problema

No fluxo de agendamento do cliente (`BookingWizard`), a etapa 2 "Data/Horário"
exibia inicialmente apenas as primeiras linhas de horários (ex: 1 linha de 3 slots).
Ao clicar em qualquer horário visível, a grade "expandia" (com animação) e revelava
todos os horários do dia. Não era bug de cálculo de slots — o array de slots estava
correto; era um bug de medição de altura assíncrona da viewport.

## Causa raiz

`app/src/components/BookingWizard.jsx`:

- `.plan-wizard-viewport` tem `overflow: hidden` e altura fixa em px controlada por JS
  (estado `wizardHeight`, aplicado inline no style; há `transition: height 0.3s`).
- A altura vinha de `activePanel.offsetHeight`, medida num `useEffect` cujas deps eram
  `[step, selectedServiceIds, selectedDate, selectedSlot, selectedProfessional, isOpen]`.
- Os slots (`availableSlots`) chegam ASSINCRONAMENTE dentro do filho `DateTimeStep.jsx`
  via `useAvailableSlots.js` (fetch a `/api/appointments` + supabase). O pai não tem
  acesso a esse array e `availableSlots` não estava nas deps do effect.

Sequência do bug: entra na etapa 2 → effect mede `offsetHeight` imediatamente (grade
quase vazia, fetch ainda não terminou) → viewport trava numa altura pequena com
`overflow:hidden` → slots chegam depois (setState no hook filho) → o painel cresce no
DOM, mas o wizard não re-mede → linhas extras ficam cortadas → o usuário clica num slot
→ `selectedSlot` muda → effect redispara → agora todos os slots estão no DOM → altura
completa é medida → a transição de height anima a expansão (o efeito visível reportado).

## Solução aplicada

`ResizeObserver` no painel ativo dentro de `BookingWizard.jsx`. O mesmo `useEffect` que
faz a medição imediata ao trocar de step agora também instancia um `ResizeObserver` que
observa `wizardPanelRefs.current[step - 1]` e reaplica `setWizardHeight(offsetHeight)`
sempre que a altura real do painel muda. Cleanup faz `observer.disconnect()`; ao trocar
de step o effect re-observa o novo painel. A medição imediata via `offsetHeight` foi
mantida para evitar flash na transição entre etapas. Isso cobre a chegada assíncrona
dos slots (e qualquer conteúdo async futuro) sem enumerar deps manualmente.

Nada foi alterado no cálculo de slots, em `useAvailableSlots`, RLS, notificações ou CSS
de layout global.

## Teste de regressão

`app/src/__tests__/BookingWizard.test.jsx`, describe
"BookingWizard — re-medição de altura na chegada assíncrona dos slots":
- `offsetHeight` é sempre 0 em jsdom → mockado via `Object.defineProperty` no
  `HTMLElement.prototype` com getter proporcional à quantidade de botões de horário
  presentes no painel.
- `ResizeObserver` global mockado com callback controlável (instâncias guardadas).
- Assert central: após os slots chegarem (async), sem clicar em nenhum slot, disparar o
  callback do observer atualiza o `height` inline de `.plan-wizard-viewport` para a
  altura completa do conteúdo (maior que a altura travada da medição inicial).
