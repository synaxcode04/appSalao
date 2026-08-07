# Teste de Regressão — Remover indicador "Etapa X de Y" do modal de agendamento

**Data:** 2026-08-07
**Feature/correção:** Remoção do texto "Etapa X de Y" do header do `BookingWizard` (modal de agendamento do cliente). O total de etapas varia entre 3 e 4 (a etapa de identificação do cliente é condicional), então o "de 4" fixo estava incorreto.

## O que foi alterado
- `app/src/components/BookingWizard.jsx`: título do header mudou de `Agendar Horário — Etapa {step} de 4` para apenas `Agendar Horário`.
- `app/src/__tests__/BookingWizard.test.jsx`: +2 testes automatizados.

## Testes automatizados (Vitest)
- Header não contém mais o texto "Etapa" — PASS
- Título permanece `Agendar Horário` ao avançar/voltar entre as etapas (goNext/goBack) — PASS
- Suíte completa do projeto: 205/205 testes passando (`npm run test:run`) — PASS
- Build de produção: `npm run build` — exit 0

## Passos para reprodução manual em produção
1. Acessar o link público de um salão (`/s/:slug`).
2. Abrir o fluxo de agendamento ("Agendar Horário").
3. Verificar que o header do modal mostra apenas **"Agendar Horário"**, sem "— Etapa X de Y".
4. Navegar entre as etapas (avançar e voltar) em um fluxo com 3 etapas (sem identificação, cliente já reconhecido) e em um fluxo com 4 etapas (identificação exigida) — em ambos os casos o header deve permanecer só "Agendar Horário", sem número de etapas incorreto ou quebrado.

## Resultado
**PASS** nos testes automatizados e no build. Validação visual manual em produção (`appsalao-psi.vercel.app`) a cargo do usuário — sem causa raiz/correção pendente até o momento.

## Deploy
- Commits: `3d138e4` (fix) e `84436f0` (docs — comentário do wizard atualizado) em `origin/dev`.
- Deploy de produção: `vercel --prod` em 2026-08-07, alias `appsalao-psi.vercel.app` atualizado com sucesso.
