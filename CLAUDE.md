# App Salão
> Sistema web PWA multi-tenant de agendamento para pequenos salões de beleza, eliminando conflitos de horário causados por agendamentos via WhatsApp ou papel.

## Ponto de entrada — leia antes de qualquer ação

**Toda solicitação do usuário deve ser roteada pelo agent `orchestrator`** antes de qualquer implementação direta.

O orchestrator está em `.claude/agents/orchestrator.md`. Ele:
- Avalia o pedido e faz perguntas de clarificação quando necessário
- Cria um plano de execução com mapa de paralelismo entre sub-agents
- Delega para os sub-agents especializados na ordem correta
- Reporta os resultados consolidados

**Não implemente, edite ou execute nada diretamente** sem primeiro passar pelo orchestrator — exceto para leituras exploratórias simples (Glob, Grep, Read) que o próprio orchestrator faria ao avaliar o estado do projeto.

## Paridade entre harnesses (Claude / Gemini / Antigravity)

Este projeto é operado por mais de uma LLM/harness: **Claude Code** (`.claude/`, `CLAUDE.md`) e **Gemini CLI / Google Antigravity** (`.agents/`, `GEMINI.md`). Os dois lados devem sempre refletir o mesmo estado do projeto.

**Regra obrigatória:** toda mudança feita do lado do Claude Code que altere contexto, regras, decisões, schema, stack ou arquitetura do projeto — ou seja, qualquer edição em `CLAUDE.md` ou em `.claude/rules/**` — **deve ser replicada na mesma tarefa** para o equivalente em `GEMINI.md` e `.agents/rules/**`. Isso inclui, por exemplo:
- Novas decisões de arquitetura (ex: mudança de modelo de identidade/auth)
- Novos itens em "Nunca fazer"
- Decisões em aberto resolvidas
- Mudanças de stack, estrutura de pastas ou padrões de código
- Testes críticos novos ou alterados

O mapeamento entre os dois harnesses está documentado em `.claude/knowledge/gemini-antigravity-harness.md` — consulte antes de propagar uma mudança para saber onde ela corresponde do lado Gemini/Antigravity. Nunca deixe uma mudança "só no Claude" — isso quebra o teste de regressão feito no Antigravity, que depende do `GEMINI.md`/`.agents/` estarem atualizados.

## Stack
| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + React Router 7 + Vite 8 |
| Estilo | CSS próprio (mobile-first, sem framework externo) |
| Backend/DB | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Push | OneSignal (react-onesignal + SDK worker) |
| Serverless | Vercel Functions (`/api/notify.js`) |
| PWA | vite-plugin-pwa + Workbox |
| Deploy | Vercel |
| Gráficos | Recharts |

## Deploy — direto na Vercel, sem remote Git

Decidido em 2026-08-01. **Este projeto não usa `git push` para disparar deploy.** Não há remote Git configurado (`git remote -v` vazio) — o deploy é feito diretamente via Vercel CLI (`vercel --prod`) ou pelo Vercel Dashboard, a partir do build local em `app/`.

- Commits locais (`git commit`) são só controle de versão — não acionam nem são pré-requisito do deploy.
- `vercel deploy`/`vercel --prod` exige **confirmação explícita do usuário** antes de ser executado (já reforçado por hook em `.claude/hooks/devops/block-vercel-deploy.sh`, que bloqueia o comando via Bash sem essa confirmação).
- Se um agent (ex: `devops`) não souber o comando/ambiente exato de deploy deste projeto, ele deve parar e perguntar — nunca configurar remote Git novo ou inventar pipeline de CI/CD por conta própria (ver guardrail de estrutura nova).

## Estrutura de pastas
```
App_salão/
├── app/                          # Aplicação React principal
│   ├── api/                      # Vercel serverless functions
│   │   └── notify.js             # Disparo de push via OneSignal
│   ├── public/                   # Assets estáticos e manifesto PWA
│   ├── src/
│   │   ├── components/           # Componentes reutilizáveis
│   │   │   ├── BookingEngine.jsx # Motor de agendamento (cálculo de slots)
│   │   │   └── ProtectedRoute.jsx# Guard de rotas por role
│   │   ├── layouts/              # Wrappers de layout por perfil de usuário
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── ClientLayout.jsx
│   │   │   └── OwnerLayout.jsx
│   │   ├── pages/                # Páginas organizadas por perfil
│   │   │   ├── admin/            # Painel do super admin (controle de licenças)
│   │   │   ├── client/           # Área do cliente (agendamentos, histórico, perfil)
│   │   │   ├── owner/            # Painel do dono (serviços, profissionais, horários)
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── Welcome.jsx       # Landing page de captação de salões
│   │   ├── utils/
│   │   │   └── notification.js   # Helpers para disparo de notificações
│   │   ├── App.jsx               # Roteamento principal
│   │   ├── main.jsx              # Entry point React
│   │   └── supabase.js           # Client Supabase (singleton)
│   ├── .env                      # Credenciais Supabase (não commitar)
│   ├── vite.config.js            # Config Vite + PWA + SSL dev
│   └── package.json
├── Documentos/                   # Documentação do projeto
│   ├── SPEC.md                   # Especificação de requisitos
│   ├── PRD.md                    # Product Requirements Document
│   ├── schema.sql                # Schema completo do banco de dados
│   └── PLANO_MONETIZACAO.md
└── teste_regressao/              # Todo teste de regressão manual é registrado aqui (1 arquivo por rodada)
```

## Commit automático ao concluir tarefas

Decidido em 2026-08-01. Quando uma task passar pelo fluxo do `orchestrator` e o **@code-reviewer** retornar "Aprovado para deploy: SIM" (ou sem BLOQUEANTEs abertos), faça o **commit local automaticamente** — sem esperar o usuário pedir "pode commitar".

- **Gatilho:** somente após aprovação do code-reviewer. Trabalho ainda em andamento, com pendências ou sem passar pelo review não é commitado automaticamente.
- **Escopo do commit:** local apenas (`git commit`). **Nunca dar `git push` automaticamente** — o usuário revisa o histórico local antes de mandar pro remoto.
- **Deploy:** continua exigindo pedido explícito do usuário (ex: `/deploy`). Aprovar o code-reviewer e commitar **não** dispara deploy sozinho.

## Testes de regressão
Todo teste de regressão manual (feature nova ou correção de bug validada em produção/staging) é registrado em `teste_regressao/AAAA-MM-DD-assunto.md` — passos reproduzidos, resultado, evidência e, se FAIL, causa raiz e correção. Ver `teste_regressao/README.md`. Isso é diferente do smoke test de pré-deploy (`Documentos/smoke_test_result.md`) e da base RAG (`.claude/knowledge/`).

## Como rodar localmente
```bash
# Instalar dependências
cd app
npm install

# Rodar em desenvolvimento (com HTTPS local para PWA)
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

> Variáveis de ambiente necessárias no arquivo `app/.env`:
> ```
> VITE_SUPABASE_URL=...
> VITE_SUPABASE_ANON_KEY=...
> ```

## Padrões de código
- Nomenclatura de arquivos: PascalCase para componentes e páginas (`BookingEngine.jsx`), camelCase para utilitários (`notification.js`)
- Nomenclatura de variáveis e funções: camelCase (`fetchAppointments`, `isLoading`)
- Estrutura de endpoints: Vercel Functions em `app/api/[nome].js`, sem prefixo de versão
- Estrutura de componentes: um componente por arquivo, export default no final; sem prop-types — usar nomes descritivos
- Tipagem: sem TypeScript — JSX puro; não adicionar TS sem decisão explícita

## TDD
- Framework backend: a definir
- Framework frontend: a definir (Vitest recomendado — já no ecossistema Vite, custo zero de setup)
- Onde ficam os testes: `app/src/__tests__/` (a criar)
- Regra: a definir
- Testes críticos deste projeto:
  - [ ] Dado horário 08:00–18:00 e serviço de 60 min → BookingEngine retorna 10 slots disponíveis
  - [ ] Dado slot já ocupado às 10:00 → slot não aparece como disponível para o cliente
  - [ ] Dado intervalo de almoço 12:00–13:00 → nenhum slot é gerado nesse período
  - [ ] Dois agendamentos sobrepostos no mesmo profissional → segundo agendamento é rejeitado
  - [ ] Usuário sem sessão acessando `/painel` → redireciona para `/login`
  - [ ] Usuário com role `client` acessando `/painel` → acesso negado
  - [x] Salão com licença suspensa → painel do dono e link público retornam tela de aviso

## Nunca fazer
- Nunca commitar o arquivo `.env` com credenciais do Supabase
- Nunca usar políticas RLS com `WITH CHECK (true)` sem validar o `owner_id` — qualquer usuário autenticado conseguiria alterar dados de outro salão
- Nunca criar agendamento sem verificar conflito de horário no mesmo profissional antes de inserir no banco
- Nunca adicionar dependências de UI externas (Material UI, Tailwind, shadcn) sem decisão explícita — o projeto usa CSS próprio
- Nunca conceder escrita de assinatura ao cliente via RLS/`auth.uid()` — assinar e cancelar plano do lado do cliente vai por Vercel Function `service_role` (coerente com a sessão leve do cliente, que tem `auth.uid()` sempre NULL). Escrita do dono continua via Supabase client com sessão Auth real.

## Guardrail — não criar estrutura nova por conta própria
**Nunca crie pastas, arquivos de configuração (`vercel.json`, `.vercel/`, etc.) ou reestruture a árvore do projeto "para resolver" um problema, a menos que o usuário peça explicitamente.** Isso já causou um incidente real em 2026-08-01: uma tentativa de corrigir deploy criou um `vercel.json` + pasta `api/` duplicados na raiz do projeto (fora de `app/`), gerando dois projetos Vercel conflitantes e derrubando todas as rotas de API em produção (404 generalizado) até o rollback. Se a causa de um problema parecer estrutural, pare e pergunte antes de criar algo novo — proponha a mudança, não a execute direto.

## Ideias de features futuras (benchmarking concorrência)
> Registrado em 2026-07-11, a partir de comparação com Trinks/Belasis/Booksy. Não implementar sem passar pelo orchestrator e decisão explícita.
- Lembrete e confirmação automática de agendamento via WhatsApp (reduz no-show — dor nº1 do segmento)
- ~~Pacote de sessões / assinatura para cliente recorrente (ex: "4 cortes", debitado a cada agendamento)~~ → **EM DESENVOLVIMENTO** (2026-08-01, "Cadastro de planos de assinatura"). Saiu de ideia para desenvolvimento com 4 decisões resolvidas — ver seção "Feature em desenvolvimento — Planos de assinatura" abaixo.
- Cálculo automático de comissão por profissional (base para pagamento)
- Avaliação/nota do salão na página pública de captação (prova social)
- Bloqueio de horário avulso pelo profissional (folga pontual) sem editar o cadastro de working hours
- Lista de espera: oferece automaticamente o horário liberado ao próximo cliente na fila

## Feature em desenvolvimento — Planos de assinatura
> Decidido em 2026-08-01. Feature "Cadastro de planos de assinatura". Tabelas do modelo de dados (migration em paralelo): `subscription_plans`, `subscription_plan_services`, `client_subscriptions`.
1. **Sem integração de pagamento por ora** — "assinar" é registro administrativo. Integração com a API do Mercado Pago fica para uma feature futura SEPARADA. A tabela `client_subscriptions` foi desenhada própria justamente para acomodar um futuro `payment_status`/`gateway_ref` via `ADD COLUMN`, sem redesenho — mas esses campos NÃO existem agora.
2. **Ciclo de cota em janela rolante de 30 dias SEM acúmulo** — a cota de cada serviço vale por um ciclo de 30 dias contados a partir da DATA DE ASSINATURA (`client_subscriptions.started_at`), NÃO por mês-calendário. Ex: assinou dia 15 → cota vale até o dia 15 do mês seguinte; reinicia a cada 30 dias contados da data de assinatura. Não há saldo cumulativo entre ciclos (ex: plano de 4 barbas/ciclo, usou 1 → o restante zera ao virar o ciclo). Implementado por contagem derivada dos agendamentos dentro do ciclo corrente, sem job de reset.
3. **Plano é por salão** — cada salão define seus próprios planos, preços, serviços e cotas mensais. Não é entidade global entre salões.
4. **Cancelamento pelo cliente OU pelo dono** — o sistema não automatiza nada sobre agendamentos futuros já marcados com o plano no momento do cancelamento; fica para negociação humana fora do app. O dono gerencia manualmente esses agendamentos remanescentes no painel, e o sistema não o impede de agir sobre eles após o cancelamento.

## Decisões em aberto
- [x] Visual e conteúdo da tela exibida quando a licença do salão está suspensa — resolvido em 2026-08-01: extraído o texto/UI já existente inline em OwnerLayout e SalonLayout para o componente compartilhado `SuspendedScreen`, sem criar copy ou design novo (não é uma decisão de copy nova, apenas centralização do que já existia).
- [x] Quem pode marcar um atendimento como concluído — **ambos** (dono e cliente). Decidido em 2026-07-11.
- [ ] Reagendamento: edita o registro existente ou cancela e cria um novo
- [ ] Framework e cobertura mínima de testes (Vitest ainda não configurado)
- [x] Planos de assinatura (2026-08-01): sem integração de pagamento por ora (Mercado Pago como feature futura separada, com `client_subscriptions` extensível via `ADD COLUMN`); ciclo de cota em janela rolante de 30 dias sem acúmulo (contados da data de assinatura `client_subscriptions.started_at`, não mês-calendário; contagem derivada, sem job); plano por salão (não global); cancelamento por cliente ou dono, sem automação sobre agendamentos remanescentes (dono gerencia manualmente). Tabelas: `subscription_plans`, `subscription_plan_services`, `client_subscriptions`. Ver seção "Feature em desenvolvimento — Planos de assinatura".
- [ ] Semântica de "dias por plano" nos planos de assinatura — ainda não definida.
