# Ambientes — Pessoal (produção atual) vs Empresa (staging de migração)

> Criado em 2026-08-10. Contexto: o projeto está hoje em produção na conta pessoal. Uma conta de empresa (Vercel + Supabase) foi criada para testar melhorias antes de migrar produção pra lá. **Enquanto a migração não é decidida e executada, os dois ambientes coexistem e NUNCA devem ser confundidos.**

## Regra de ouro

**Antes de qualquer `vercel` (deploy, env, link), rode primeiro:**
```bash
vercel whoami
cat .vercel/project.json
```
Confirme que a conta e o `projectName`/`projectId` batem com o ambiente pretendido **antes** de rodar `vercel --prod` ou alterar env vars. Isso vale tanto pra mim (Claude) quanto pra você — é o checkpoint obrigatório contra deploy no ambiente errado.

## Pasta local de cada ambiente

| Ambiente | Pasta local | Motivo |
|---|---|---|
| Pessoal (produção) | `Projetos Israel\Sistemas\App_salão` | pasta original, é onde o dia a dia de desenvolvimento acontece |
| Empresa (staging) | `Projetos Israel\Sistemas\App_salão-empresa` | clone git separado (não copy-paste) — `.vercel/project.json` fica fixo na conta da empresa, sem risco de misturar com o pessoal |

Os dois são clones do mesmo repo (`github.com/synaxcode04/appSalao`), branch `dev` como padrão de trabalho. Sincronize com `git pull` na pasta que estiver desatualizada — nunca copie arquivos manualmente entre as duas pastas.

## Vercel

| | Pessoal (produção) | Empresa (staging) |
|---|---|---|
| Conta CLI | `israelappc-1175` | `synaxcode04` (time/org `syntax-code`) |
| Projeto | `appsalao` (org `israel-araujo-s-projects`, projectId `prj_NftwDKcTjUKLt9an0GCI758cgs16`) | `appsalao` (org `syntax-code`, projectId `prj_AQKfUo8eJmv8b14Jcu9GDeN2Szo8`) |
| Domínio | `appsalao-psi.vercel.app` (domínio fixo — ver [[deploy_dominio_fixo]]) — **produção real** | `appsalao-iota.vercel.app` / `appsalao-syntax-code.vercel.app` — **ambiente de teste**, não é produção |
| Deploy | `vercel --prod` **de dentro de `App_salão/app/`** (Root Directory não configurado nesse projeto — CLI já roda de dentro da pasta certa) | `vercel --prod` **da raiz do clone `App_salão-empresa/`** (não de dentro de `app/`!) — Root Directory está setado como `app` nas Project Settings da Vercel, então rodar de dentro de `app/` duplica o caminho (`app/app`) e falha |

**Resolvido em 2026-08-10 (empresa):**
1. Git desconectado (Settings → Git → Disconnect) — era o que causava "commit author sem acesso" (Hobby não aceita colaboradores em repo privado).
2. Root Directory setado para `app` (estava vazio/raiz, causava `No Output Directory named "dist"`).
3. Output Directory tinha um **override manual para `app/dist`** (herdado de quando Root Directory estava vazio) — com Root Directory = `app` isso duplicava pra `app/app/dist`. Desativado o toggle "Override" do Output Directory pra voltar a detectar `dist` automaticamente.

**Reset do schema Supabase da empresa (2026-08-10) — se precisar refazer:**
Se o `schema.sql` travar com "relation already exists" (schema parcialmente aplicado antes), resetar do zero com:
```sql
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
```
⚠️ **Depois de rodar o `schema.sql` inteiro, é OBRIGATÓRIO rodar os grants abaixo também** — sem eles dá `permission denied for table X` mesmo com RLS correto, porque `drop schema/create schema` apaga os grants padrão que o Supabase configura automaticamente pros roles `anon`/`authenticated` (RLS só é avaliado depois que o grant de tabela existe):
```sql
grant all on all tables in schema public to postgres, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
```

⚠️ **Login CLI é exclusivo por sessão** — logar com `synaxcode04` na Vercel CLI desloga a sessão de `israelappc-1175` (e vice-versa). Sempre rodar `vercel login` de novo ao trocar de ambiente, e confirmar com `vercel whoami` antes de qualquer comando.

## Supabase

| | Pessoal (produção) | Empresa (staging) |
|---|---|---|
| Project URL | `auvjlrjbqxtrtxrlqkil.supabase.co` (ver `Documentos/Conexoes.md` — **arquivo com chave exposta em git, em correção manual pelo usuário**) | `zlbvcorjxjmxrydhjgnv.supabase.co` |
| Schema | schema de produção, já com todas as migrations aplicadas | `Documentos/schema.sql` aplicado em 2026-08-10 (reset completo do schema `public` antes, porque uma tentativa parcial anterior deixou `profiles` já criada e travava com "already exists") |
| Dados | dados reais de produção | ambiente de teste, dados próprios |

## OneSignal — compartilhado entre os dois ambientes (decisão do usuário, 2026-08-10)

Não há OneSignal separado por ambiente — é o mesmo app (`appSalao`, App ID `793a85ec-7c26-4be2-8e54-c1c94dfb4c8d`) atendendo produção pessoal e staging da empresa.

- `ONESIGNAL_REST_API_KEY` foi **rotacionada em 2026-08-10** (a antiga foi invalidada). O valor novo já foi propagado nos dois projetos Vercel (pessoal: Production via CLI, confirmar Preview; empresa: Production e Preview via dashboard).
- Cuidado: rotacionar de novo invalida a chave nos dois ambientes ao mesmo tempo — sempre atualizar os dois projetos Vercel juntos se isso acontecer de novo.

## Variáveis de ambiente — checklist de paridade

Setadas nos dois projetos Vercel (Production + Preview):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (sem prefixo `VITE_` — usada server-side em `app/api/manifest.js` e `app/api/icon.js`; **conferir que existe no projeto da empresa**, faltava em 2026-08-10)
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_REST_API_KEY`
- `MERCADO_PAGO_ACCESS_TOKEN` — **só no projeto pessoal por enquanto**, não configurado na empresa (feature de pagamento não faz parte do escopo de teste atual)

## Fluxo de trabalho combinado com o usuário

1. Melhorias são testadas primeiro no ambiente da **empresa** (staging).
2. Se algo quebrar/precisar de correção na produção **pessoal** atual, corrige-se lá separadamente.
3. Deploy de cada ambiente é pedido **separadamente** pelo usuário — nunca assumir que "deploy" sem especificar qual ambiente.
4. Quando o ambiente da empresa estiver validado, migração de produção é uma decisão explícita futura (ainda não tomada) — não implementar/migrar sem esse pedido explícito.
