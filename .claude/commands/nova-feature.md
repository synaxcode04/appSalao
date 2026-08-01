Você vai criar uma nova feature. Siga a sequência obrigatória abaixo.

Feature proposta: $ARGUMENTS

---

### Etapa 1 — Clarificação (faça no máximo 3 perguntas em uma única mensagem)

Antes de qualquer implementação, pergunte ao usuário:
- Qual é o comportamento esperado do ponto de vista do usuário final?
- Qual perfil usa esta feature: dono do salão, cliente ou admin (Israel)?
- Há dados novos que precisam ser salvos no banco, ou usa dados que já existem?

Aguarde as respostas antes de continuar.

---

### Etapa 2 — Plano (após receber respostas)

Monte um plano com:
- **Fases e tasks**: cada task com agent responsável, arquivos envolvidos e output esperado
- **Mapa de paralelismo**: quais tasks podem rodar simultâneas
- **Critérios de aceite**: condições objetivas e mensuráveis que provam que está pronto
- **Testes obrigatórios**: lista dos testes que o agent deve escrever

Apresente o plano e aguarde confirmação do usuário antes de executar.

---

### Etapa 3 — Execução

Delegue ao orchestrator para executar o plano aprovado com TDD obrigatório.

---

### Etapa 4 — Documentação (gerada ao concluir)

Crie dois arquivos em `Documentos/`:
- `feature-[slug]-tecnico.md` — spec técnica: arquivos criados/modificados, schema de banco (se houver), decisões de arquitetura
- `feature-[slug]-uso.md` — guia de uso: passo a passo para o perfil de usuário que usa a feature

Invoque **@code-reviewer** antes de marcar como concluído.
