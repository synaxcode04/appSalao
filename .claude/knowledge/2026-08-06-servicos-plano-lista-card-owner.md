# Serviços do plano em lista (um por linha) no card do dono

**Data:** 2026-08-06
**Agent:** session (orchestrator + claude + code-reviewer)
**Tipo:** feature

## Descrição

No card de plano do painel do dono (`app/src/pages/owner/PlansManager.jsx`), a lista de serviços do plano era renderizada como uma string única concatenada por vírgula (`.join(', ')`). No mobile, essa string quebrava no meio do nome do serviço (ex: "Barba" e "Terapia com Ozônio (4x)" ficavam partidos entre linhas), deixando a leitura confusa.

## Solução

Extraído um componente puro `PlanServicesList({ services })` (named export, ao lado de `PlanDescription`) que renderiza cada item de `subscription_plan_services` em um `<li>` próprio:

- Texto de cada item no formato "Nome (Nx)" (nome do serviço + cota mensal).
- `key` = `service_id`.
- Label "Serviços:" como cabeçalho.
- Renderiza "nenhum" quando a lista está vazia.

Classes CSS adicionadas em `app/src/index.css`:
- `.plan-services`
- `.plan-services-label`
- `.plan-services-empty`
- `.plan-services-list`
- `.plan-services-item` — com `word-break: break-word` + `overflow-wrap: anywhere` para não quebrar no meio do nome do serviço.

## Estrutura de dados

`plan.subscription_plan_services` = array de `{ service_id, monthly_quota, services: { id, name } }`.

## Testes

5 testes Vitest passando (2 de `PlanDescription` + 3 de `PlanServicesList`).

## Review

Aprovado pelo code-reviewer, sem bloqueantes. 1 sugestão opcional: cobrir o caso `services={undefined}`.

## Contexto

Mesma sessão da feature de line-clamp da descrição do plano (ver `2026-08-06-plandescription-line-clamp-planos-owner.md`).
