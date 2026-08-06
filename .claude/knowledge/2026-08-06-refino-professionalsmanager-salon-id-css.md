---
data: 2026-08-06
titulo: Refino pós-review em ProfessionalsManager (defesa em profundidade salon_id + CSS)
---

**Agent:** session (orchestrator + code-reviewer)
**Tipo:** decisao

## Contexto

Refino não-bloqueante aplicado na página de Profissionais do painel do dono
(`app/src/pages/owner/ProfessionalsManager.jsx`) após aprovação do code-reviewer
(Aprovado para deploy: SIM, 0 bloqueantes). São ajustes de qualidade/robustez, sem
mudança de comportamento funcional.

## Ajustes aplicados

1. **Defesa em profundidade com `.eq('salon_id')` nas mutações.** As queries UPDATE e
   DELETE de `professionals` passaram a filtrar explicitamente por `salon_id`, além da
   proteção já existente via RLS. É uma segunda barreira redundante (defense-in-depth):
   mesmo que uma policy RLS fosse afrouxada por engano, a query continuaria escopada ao
   salão correto. Não substitui a RLS — soma-se a ela.

2. **Estilos estáticos inline movidos para classes no `App.css`.** Estilos fixos que
   estavam em `style={{}}` inline foram extraídos para classes CSS, mantendo inline
   apenas os valores realmente dinâmicos calculados em JS (coerente com a convenção
   "`style={{}}` inline só para valores dinâmicos").

3. **Classe compartilhada `clients-toolbar` NÃO renomeada — criada `professionals-toolbar`
   própria.** A página reutilizava a classe `clients-toolbar`; para não acoplar o visual
   de Profissionais ao de outras páginas, foi criada uma classe `professionals-toolbar`
   dedicada. Decisão consciente de NÃO renomear/alterar `clients-toolbar` para evitar
   efeitos colaterais em `ClientsManager`, `ServicesManager` e `PlansManager`, que
   também dependem dela.

## Validação

- Testes: 124/124 passando.
- Code-reviewer: Aprovado para deploy SIM, 0 bloqueantes.
- Arquivos: `ProfessionalsManager.jsx`, `App.css`, `ProfessionalsManager.test.jsx`.
