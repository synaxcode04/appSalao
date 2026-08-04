# App Salão — Contexto para Gemini CLI e Google Antigravity
> Sistema web PWA multi-tenant de agendamento para pequenos salões de beleza, eliminando conflitos de horário causados por agendamentos via WhatsApp ou papel.

> **Nota de paridade:** este arquivo é o equivalente do `CLAUDE.md` (que continua sendo a fonte de verdade para o Claude Code). Ele foi criado para ser lido pelo **Gemini CLI** (arquivo de contexto de projeto, carregado hierarquicamente) e pelo **Google Antigravity**. O mapeamento completo entre os dois harnesses está em `.claude/knowledge/gemini-antigravity-harness.md`. Não edite o `.claude/` a partir daqui — ele é a fonte de verdade.

---

## Ponto de entrada — leia antes de qualquer ação

**Toda solicitação do usuário deve ser roteada pelo agent `orchestrator`** antes de qualquer implementação direta.

Como o `orchestrator` é acionado depende da ferramenta:

| Ferramenta | Como o orchestrator existe | Como invocar |
|------------|----------------------------|--------------|
| **Google Antigravity** | Subagent nativo em `.agents/agents/orchestrator.md` | O agente principal delega via `invoke_subagent` para `orchestrator`, que por sua vez delega para os sub-agents especializados |
| **Gemini CLI** | Persona descrita neste arquivo (não há subagents nativos) + comandos `.gemini/commands/*.toml` | Rode `/implementar`, `/nova-feature`, `/deploy`, etc. — ou peça em linguagem natural; o modelo assume o papel de orchestrator descrito abaixo |

**Não implemente, edite ou execute nada diretamente** sem primeiro passar pelo protocolo do orchestrator — exceto leituras exploratórias simples (buscar/ler arquivos) que o próprio orchestrator faria ao avaliar o estado do projeto.

### Paridade entre harnesses (Claude / Gemini / Antigravity)

Este projeto é operado por mais de uma LLM/harness: **Claude Code** (`.claude/`, `CLAUDE.md`) e **Gemini CLI / Google Antigravity** (`.agents/`, `GEMINI.md`, este arquivo). Os dois lados devem sempre refletir o mesmo estado do projeto — usado como base do teste de regressão feito no Antigravity.

**Regra obrigatória:** toda mudança feita do lado do Claude Code em `CLAUDE.md` ou `.claude/rules/**` (novas decisões de arquitetura, itens em "Nunca fazer", decisões em aberto resolvidas, mudanças de stack/estrutura/padrões, testes críticos) deve ser replicada aqui em `GEMINI.md` e em `.agents/rules/**`. Mapeamento completo entre os harnesses em `.claude/knowledge/gemini-antigravity-harness.md`. Nunca considere uma mudança concluída "só porque o Claude Code está atualizado" — se este arquivo ficar defasado, o teste de regressão no Antigravity roda contra um contexto errado.

### Protocolo do orchestrator (resumo — versão completa em `.agents/agents/orchestrator.md`)
1. **Leia o contexto** (`CLAUDE.md`/`GEMINI.md`, `Documentos/SPEC.md`, `Documentos/PLAN.md`) antes de responder.
2. **Classifique o pedido**: Simples (delega direto) · Composto (cria plano, confirma, executa) · Ambíguo (máx. 3 perguntas) · Fora do escopo (informa e para).
3. **Delegue** para o sub-agent correto com um briefing claro (o que fazer, o que ler, critério de conclusão, restrições).
4. **Reporte** o resultado consolidado. TDD é obrigatório; ao concluir, aciona o `code-reviewer`.

---

## Catálogo de sub-agents

Definições completas em `.agents/agents/<nome>.md` (Antigravity). No Gemini CLI, use estes papéis como personas e acione pelos comandos em `.gemini/commands/`.

| Agent | Domínio | Quando invocar |
|-------|---------|----------------|
| `orchestrator` | Ponto de entrada único | QUALQUER pedido — avalia, planeja, delega. Nunca escreve código. |
| `rls-security` | Banco, políticas RLS, schema SQL | Mudança em segurança, permissões ou estrutura do banco. Só SQL. |
| `booking-engine` | `BookingEngine.jsx`, cálculo de slots, conflitos | Bug em agendamento, slots errados, testes do motor. |
| `auth-guard` | `ProtectedRoute`, `SuspendedScreen`, `status` | Controle de acesso, licença suspensa, roles. |
| `notifier` | 8 eventos push, `notification.js`, `notify.js` | Notificações, novo evento, testes de push. |
| `devops` | Build Vercel, `.env`, `vercel.json` | Deploy, variáveis de ambiente, build falhando. Nunca edita JSX. |
| `qa` | Pre-deploy check, smoke test, relatório | Antes de qualquer deploy; após todas as tasks. |
| `code-reviewer` | Revisão contra SPEC, classificação de problemas | Antes de merge; auditoria de qualidade. Somente leitura. |

**Regras de paralelismo** (do orchestrator): `booking-engine` + `auth-guard` podem rodar em paralelo (domínios independentes); `rls-security` roda antes de tasks que dependem de `status`; `devops` → depois → `qa`; qualquer implementação → depois → `code-reviewer`.

---

## Regras do projeto (rules)

As regras detalhadas ficam em `.agents/rules/` (workspace rules do Antigravity). Elas são importadas abaixo para que o **Gemini CLI** também as carregue no contexto:

@.agents/rules/convencoes-gerais.md
@.agents/rules/seguranca.md
@.agents/rules/frontend/react.md
@.agents/rules/backend/serverless.md
@.agents/rules/tests/vitest.md

---

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
- `vercel deploy`/`vercel --prod` exige **confirmação explícita do usuário** antes de ser executado (no Claude Code isso é reforçado por hook em `.claude/hooks/devops/block-vercel-deploy.sh`; aqui a restrição é soft — nível de prompt, ver GAPS conhecidos no final deste arquivo).
- Se um agent/persona `devops` não souber o comando/ambiente exato de deploy deste projeto, deve parar e perguntar — nunca configurar remote Git novo ou inventar pipeline de CI/CD por conta própria (ver guardrail de estrutura nova).

## GitHub — espelho de código (decidido em 2026-08-04)

Além do commit local, **todo trabalho concluído também deve ser enviado (`git push`) para o repositório remoto `origin` (`github.com/synaxcode04/appSalao`), na branch `dev`.** Isso é só compartilhamento de código com um colaborador externo — não aciona deploy nenhum (a Vercel não está conectada a este remote).

- **Branch de trabalho:** sempre `dev`. Nunca dar push na branch `main` (produção) até o usuário pedir explicitamente para promover/mergear.
- **Gatilho do push:** o mesmo do commit automático — após aprovação do revisor de código, faça `git commit` local e em seguida `git push origin dev`, sem esperar o usuário pedir.
- **Nunca** dar push em `main` ou abrir PR de `dev` para `main` sozinho — só quando o usuário disser algo como "muda pra produção" ou equivalente.
- Autenticação com o GitHub é feita via token pessoal fornecido pelo usuário quando necessário (não fica salvo em nenhum arquivo do projeto nem no remote URL entre sessões).

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
│   │   ├── pages/                # Páginas organizadas por perfil (admin/client/owner)
│   │   ├── utils/notification.js # Helpers para disparo de notificações
│   │   ├── App.jsx               # Roteamento principal
│   │   └── supabase.js           # Client Supabase (singleton)
│   ├── .env                      # Credenciais Supabase (não commitar)
│   ├── vite.config.js            # Config Vite + PWA + SSL dev
│   └── package.json
├── Documentos/                   # SPEC.md, PRD.md, schema.sql, PLAN.md, etc.
└── teste_regressao/              # Todo teste de regressão manual é registrado aqui (1 arquivo por rodada)
```

## Commit automático ao concluir tarefas

Decidido em 2026-08-01. Quando uma task passar pelo fluxo do orchestrator e o **code-reviewer** retornar "Aprovado para deploy: SIM" (ou sem BLOQUEANTEs abertos), faça o **commit local automaticamente** — sem esperar o usuário pedir "pode commitar".

- **Gatilho:** somente após aprovação do code-reviewer. Trabalho ainda em andamento, com pendências ou sem passar pelo review não é commitado automaticamente.
- **Escopo do commit:** local apenas (`git commit`). **Nunca dar `git push` automaticamente** — o usuário revisa o histórico local antes de mandar pro remoto.
- **Deploy:** continua exigindo pedido explícito do usuário. Aprovar o code-reviewer e commitar **não** dispara deploy sozinho.

## Testes de regressão
Todo teste de regressão manual (feature nova ou correção de bug validada em produção/staging) é registrado em `teste_regressao/AAAA-MM-DD-assunto.md` — passos reproduzidos, resultado, evidência e, se FAIL, causa raiz e correção. Ver `teste_regressao/README.md`. Isso é diferente do smoke test de pré-deploy (`Documentos/smoke_test_result.md`) e da base RAG (`.claude/knowledge/`).

## Como rodar localmente
```bash
cd app
npm install
npm run dev       # dev com HTTPS local para PWA
npm run build     # build de produção
npm run preview   # preview do build
npm run test:run  # testes (Vitest) — exit 0 é critério de conclusão
```

> Variáveis de ambiente necessárias em `app/.env`:
> ```
> VITE_SUPABASE_URL=...
> VITE_SUPABASE_ANON_KEY=...
> ```

## Padrões de código
- Arquivos: PascalCase para componentes/páginas (`BookingEngine.jsx`), camelCase para utilitários (`notification.js`).
- Variáveis e funções: camelCase (`fetchAppointments`, `isLoading`).
- Endpoints: Vercel Functions em `app/api/[nome].js`, sem prefixo de versão; `export default function handler(req, res)`.
- Componentes: um por arquivo, `export default` no final (nunca inline); sem prop-types — nomes descritivos são o contrato.
- Tipagem: sem TypeScript — JSX puro. Não adicionar TS sem decisão explícita.

## TDD
- Framework frontend: Vitest (já no ecossistema Vite).
- Testes em `app/src/__tests__/`, espelhando a estrutura de `src/` (`BookingEngine.jsx` → `BookingEngine.test.jsx`).
- Supabase SEMPRE mockado nos testes; `fetch` mockado com `vi.fn()`. Use `describe/it`.
- Critério de conclusão de qualquer task de código: `cd app && npm run test:run` com exit 0.
- Testes críticos deste projeto:
  - [ ] Horário 08:00–18:00 + serviço 60 min → 10 slots disponíveis
  - [ ] Slot ocupado às 10:00 → não aparece como disponível
  - [ ] Intervalo de almoço 12:00–13:00 → nenhum slot nesse período
  - [ ] Dois agendamentos sobrepostos no mesmo profissional → segundo é rejeitado
  - [ ] Usuário sem sessão em `/painel` → redireciona para `/login`
  - [ ] Role `client` em `/painel` → acesso negado
  - [ ] Salão com licença suspensa → painel do dono e link público mostram tela de aviso

## Guardrail — não criar estrutura nova por conta própria
**Nunca crie pastas, arquivos de configuração (`vercel.json`, `.vercel/`, etc.) ou reestruture a árvore do projeto "para resolver" um problema, a menos que o usuário peça explicitamente.** Isso já causou um incidente real em 2026-08-01: uma tentativa de corrigir deploy criou um `vercel.json` + pasta `api/` duplicados na raiz do projeto (fora de `app/`), gerando dois projetos Vercel conflitantes e derrubando todas as rotas de API em produção (404 generalizado) até o rollback. Se a causa de um problema parecer estrutural, pare e pergunte antes de criar algo novo — proponha a mudança, não a execute direto.

## Nunca fazer
- Nunca commitar `app/.env` com credenciais do Supabase.
- Nunca usar RLS com `WITH CHECK (true)` sem validar `owner_id` via JOIN com `salons` — vazaria dados entre salões.
- Nunca criar agendamento sem verificar conflito de horário no mesmo profissional antes do INSERT.
- Nunca adicionar dependências de UI externas (Material UI, Tailwind, shadcn) sem decisão explícita — o projeto usa CSS próprio.
- Nunca instanciar um segundo client Supabase — use o singleton em `app/src/supabase.js`.
- Nunca usar `console.log` em código de produção.
- Nunca conceder escrita de assinatura ao cliente via RLS/`auth.uid()` — assinar e cancelar plano do lado do cliente vai por Vercel Function `service_role` (coerente com a sessão leve do cliente, que tem `auth.uid()` sempre NULL). Escrita do dono continua via Supabase client com sessão Auth real.

## Feature em desenvolvimento — Planos de assinatura
> Decidido em 2026-08-01. Feature "Cadastro de planos de assinatura". Saiu de ideia futura para desenvolvimento. Tabelas do modelo de dados (migration em paralelo): `subscription_plans`, `subscription_plan_services`, `client_subscriptions`.
1. **Sem integração de pagamento por ora** — "assinar" é registro administrativo. Integração com a API do Mercado Pago fica para uma feature futura SEPARADA. A tabela `client_subscriptions` foi desenhada própria justamente para acomodar um futuro `payment_status`/`gateway_ref` via `ADD COLUMN`, sem redesenho — mas esses campos NÃO existem agora.
2. **Ciclo de cota em janela rolante de 30 dias SEM acúmulo** — a cota de cada serviço vale por um ciclo de 30 dias contados a partir da DATA DE ASSINATURA (`client_subscriptions.started_at`), NÃO por mês-calendário. Ex: assinou dia 15 → cota vale até o dia 15 do mês seguinte; reinicia a cada 30 dias contados da data de assinatura. Não há saldo cumulativo entre ciclos (ex: plano de 4 barbas/ciclo, usou 1 → o restante zera ao virar o ciclo). Implementado por contagem derivada dos agendamentos dentro do ciclo corrente, sem job de reset.
3. **Plano é por salão** — cada salão define seus próprios planos, preços, serviços e cotas mensais. Não é entidade global entre salões.
4. **Cancelamento pelo cliente OU pelo dono** — o sistema não automatiza nada sobre agendamentos futuros já marcados com o plano no momento do cancelamento; fica para negociação humana fora do app. O dono gerencia manualmente esses agendamentos remanescentes no painel, e o sistema não o impede de agir sobre eles após o cancelamento.

## Decisões em aberto — não implemente sem aprovação explícita
- [ ] Visual e conteúdo da tela exibida quando a licença do salão está suspensa (`SuspendedScreen`)
- [x] Quem pode marcar um atendimento como concluído — **ambos** (dono e cliente). Decidido em 2026-07-11.
- [ ] Reagendamento: edita o registro existente ou cancela e cria um novo
- [ ] Framework e cobertura mínima de testes além do Vitest já configurado
- [x] Planos de assinatura (2026-08-01): sem integração de pagamento por ora (Mercado Pago como feature futura separada, com `client_subscriptions` extensível via `ADD COLUMN`); ciclo de cota em janela rolante de 30 dias sem acúmulo (contados da data de assinatura `client_subscriptions.started_at`, não mês-calendário; contagem derivada, sem job); plano por salão (não global); cancelamento por cliente ou dono, sem automação sobre agendamentos remanescentes (dono gerencia manualmente). Tabelas: `subscription_plans`, `subscription_plan_services`, `client_subscriptions`. Ver seção "Feature em desenvolvimento — Planos de assinatura".
- [ ] Semântica de "dias por plano" nos planos de assinatura — ainda não definida.

---

## GAPS conhecidos vs. Claude Code
Estes recursos do harness `.claude/` **não têm equivalente 1:1** aqui — ver `.claude/knowledge/gemini-antigravity-harness.md`:
- **Hooks de bloqueio** (`.claude/hooks/**`, ex.: `block-dangerous-bash.sh`, `PostToolUse`/`Stop`): o Claude Code executa scripts shell que **impedem** ações fora de escopo de forma determinística. Nem o Gemini CLI nem o Antigravity têm hooks de bloqueio equivalentes. Aqui as restrições são **soft** (nível de prompt/tools), não barreiras rígidas.
- **Registro RAG automático** (`.claude/scripts/embed.ts` + `.claude/rag.db`): consulta e indexação semântica local são específicas do fluxo Claude. Não replicadas.
