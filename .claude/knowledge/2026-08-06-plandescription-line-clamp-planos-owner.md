# PlanDescription — line-clamp com "ver mais/ver menos" na descrição dos planos (owner)

**Data:** 2026-08-06
**Agent:** session (orchestrator + claude + code-reviewer)
**Tipo:** feature

## Contexto / problema

No painel do dono (`app/src/pages/owner/PlansManager.jsx`, aba Planos), a descrição livre do
plano — texto com emojis e quebras de linha digitado pelo próprio dono — era renderizada num
`<p>` sem tratamento algum. Resultado: virava um bloco alto e mal legível no mobile, empurrando
o restante do card para baixo.

## Solução aplicada (Opção A, aprovada pelo usuário)

- Componente interno `PlanDescription({ text })` dentro de `PlansManager.jsx`.
- Line-clamp CSS de 2 linhas via `-webkit-line-clamp`.
- Botão "ver mais/ver menos" que só aparece quando o texto realmente excede o clamp.
- Detecção do overflow via `useRef` + `useEffect` comparando `scrollHeight > clientHeight`.
- `white-space: normal` — Opção A **não** preserva as quebras de linha digitadas pelo dono.
- Classes CSS em `app/src/index.css` (mesmo arquivo de `.card`):
  - `.plan-description`
  - `.plan-description--clamped`
  - `.plan-description-toggle`

## Testes

- Teste Vitest em `app/src/__tests__/PlansManager.test.jsx`.
- jsdom não faz layout, então o teste mocka `scrollHeight`/`clientHeight` via
  `Object.defineProperty` para simular texto que excede (ou não) o clamp.
- 2 testes passando; build OK.

## Sugestões abertas do code-reviewer (não bloqueantes)

- Incluir o estado `expanded` na medição do clamp, para robustez futura.
- `cleanup()` redundante no teste.
- Comentar o mock global de protótipo (`Object.defineProperty` em prototype) para clareza.
