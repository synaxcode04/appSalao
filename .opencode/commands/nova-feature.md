Você vai criar uma nova feature. Siga a sequência obrigatória abaixo.

Feature proposta: $ARGUMENTS

### Etapa 1 — Clarificação (máximo 3 perguntas em uma única mensagem)

Antes de qualquer implementação, pergunte ao usuário:
- Qual é o comportamento esperado do ponto de vista do usuário final?
- Qual perfil usa esta feature: dono do salão, cliente ou admin?
- Há dados novos que precisam ser salvos no banco, ou usa dados que já existem?

Aguarde as respostas antes de continuar.

### Etapa 2 — Plano (após receber respostas)

Monte um plano com fases, tasks, agent responsável por cada uma, mapa de paralelismo e critérios de aceite objetivos.
Apresente o plano e aguarde confirmação do usuário antes de executar.

### Etapa 3 — Execução

Delegue ao orchestrator para executar o plano aprovado com TDD obrigatório.

### Etapa 4 — Documentação (ao concluir)

Crie dois arquivos em `Documentos/`:
- `feature-[slug]-tecnico.md` — spec técnica, arquivos criados/modificados, decisões de arquitetura
- `feature-[slug]-uso.md` — guia de uso para o perfil de usuário que usa a feature

Invoque **@code-reviewer** antes de marcar como concluído.
