---
**Agent:** session (orchestrator + general-purpose + code-reviewer)
**Tipo:** feature

# Restauração da cor verde no módulo cliente (substituindo o roxo)

## Contexto
O módulo cliente (`/s/:slug`) havia recebido um redesign pastel com cor primária roxa (`#8576EE`). O usuário pediu para restaurar a cor VERDE original da aplicação (`--primary-green: #3B823E`, `--light-green: #E8F5E9`, `--dark-green: #1B5E20`), mantendo TODO o restante do redesign pastel (fonte Poppins, sombras `none`, raio de borda maior). Pedido explícito: "Altere somente isso" — só valores de cor.

## Solução aplicada (4 arquivos, só troca de valor hex)
1. `app/src/index.css` (:root): `--primary-purple` #8576EE→#3B823E; `--primary-purple-hover` #7363E8→#1B5E20; `--light-purple` #EEECFF→#E8F5E9; `--pastel-bg-purple` #F0EEFF→#E8F5E9. Os NOMES das variáveis foram mantidos com "purple" de propósito (renomear ampliaria o escopo). Elas são consumidas via `var()` só em `BookingEngine.css` e na classe `.client-theme` do `App.css`, então trocar o valor aqui propaga verde para todo o módulo cliente sem editar mais nada.
2. `app/src/App.css` (classe `.client-theme`): `--dark-green` #2B2A4C→#1B5E20 (essa linha é hardcoded, não usa var()).
3. `app/src/components/ClientIdentityForm.jsx` (L79, L82): `color="#8576EE"`→`color="#3B823E"` nos ícones Calendar e Clock.
4. `app/src/components/BookingEngine.jsx` (L665, L679): `color="#8576EE"`→`color="#3B823E"` nos ícones Check e Sparkles.

## Verificação
- `npm run test:run`: 110 testes passando, 0 falhas.
- Code-reviewer: 0 bloqueantes, "Aprovado para deploy: SIM". Confirmado que as variáveis roxas não vazam para owner/admin (owner usa `--dark-green`/`.nav-item`; cliente usa `.c-nav-item`).
- Nota pré-existente (não introduzida): `.c-nav-item.active` em App.css consome `var(--primary-purple)` fora do bloco `.client-theme`, mas `.c-nav-item` só aparece no módulo cliente, então sem impacto visual em owner/admin.
- Commit local: `2fe02b1` (sem push).
