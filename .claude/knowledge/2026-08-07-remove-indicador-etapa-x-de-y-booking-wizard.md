# Remoção do indicador "Etapa X de 4" do título do modal de agendamento (BookingWizard)

- **Data:** 2026-08-07
- **Agent:** session (orchestrator + general-purpose)
- **Tipo:** feature

## Descrição da melhoria
O título do modal de agendamento do cliente foi simplificado de
`"Agendar Horário — Etapa {step} de 4"` para apenas `"Agendar Horário"`.

## Motivo
O `BookingWizard` tem **3 ou 4 etapas dependendo do fluxo**: a etapa de
identificação do cliente é **condicional** (só aparece quando o cliente ainda
não está identificado na sessão leve). Com o total de etapas variável, o
indicador fixo `"Etapa X de 4"` era **incorreto** — mostrava "de 4" mesmo em
fluxos de 3 etapas, confundindo o usuário sobre onde estava no processo.

## Arquivos alterados
- `app/src/components/BookingWizard.jsx` — removido o sufixo `— Etapa {step} de 4`
  do header do modal; título passa a ser apenas `"Agendar Horário"`.
- `app/src/components/BookingWizard.test.jsx` — adicionados 2 testes:
  1. garante que a string `"Etapa"` **não** aparece no header do modal;
  2. garante que a **navegação entre etapas continua funcionando** normalmente.
  Suíte total: **7 testes passando**.

## Solução
Remoção do sufixo dinâmico do título (não há mais dependência de `step`/total no
header) + cobertura de teste contra regressão do texto e da navegação.

## Aprovação
Code-reviewer: Aprovado para deploy SIM, 0 bloqueantes.
