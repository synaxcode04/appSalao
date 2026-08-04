# PlansManager — form de plano em modal (paridade com Serviços)

**Agent:** session (orchestrator + claude)
**Tipo:** feature
**Data:** 2026-08-04

## O que mudou

O form de cadastro/edição de plano de assinatura no painel do dono (`app/src/pages/owner/PlansManager.jsx`) foi migrado de **sempre-visível** para um **modal aberto pelo botão "Novo Plano"**, seguindo o mesmo padrão já aplicado em `ClientsManager.jsx` e `ServicesManager.jsx` (commit `87e94c3`).

- Reusa as classes `modal-overlay` / `modal-card` / `modal-title` / `modal-cancel` — **sem CSS novo**.
- Edição reabre o mesmo modal já preenchido com os dados do plano.
- O estado do form é resetado ao fechar / salvar / cancelar / clicar fora do modal, respeitando o estado `saving` (não fecha nem reseta enquanto está salvando).
- A aba **"Assinantes"** e toda a **regra de negócio** permanecem 100% intactas: cotas, ciclo rolante de 30 dias, dias da semana, e o sync `delete + insert` de `subscription_plan_services` / days.

## Ajuste de UX correlato — `.modal-cancel` (App.css)

A classe compartilhada `.modal-cancel` no `app/src/App.css` estava com `border: none`, fazendo o botão "Cancelar" parecer texto flutuando sem contorno. Passou a ter:

- `border: 1px solid var(--border-color)`
- `border-radius: var(--radius-md)`

Como a classe é compartilhada, o ajuste afeta os modais de **Clientes, Serviços e Planos**.

## Validação

- 120/120 testes passando.
- Aprovado pelo code-reviewer.
