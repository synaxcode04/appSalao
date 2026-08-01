# vercel-mcp

MCP Server que permite aos agents do App Salão monitorar deployments, verificar logs de build e validar variáveis de ambiente sem sair do Claude.

## Instalação

```bash
cd .mcp/vercel-mcp
npm install
```

## Variáveis de ambiente

| Variável | Onde encontrar | Obrigatória |
|----------|---------------|-------------|
| `VERCEL_TOKEN` | vercel.com/account/tokens → Create Token | ✅ |
| `VERCEL_PROJECT_ID` | Vercel Dashboard → Projeto → Settings → General → Project ID | ✅ |
| `VERCEL_TEAM_ID` | Dashboard → Team Settings → General → Team ID | ❌ (só se tiver time) |
| `VERCEL_DEPLOY_HOOK` | Dashboard → Projeto → Settings → Git → Deploy Hooks | ❌ (para acionar deploy) |

**Como criar o Deploy Hook:**
1. Vercel Dashboard → Projeto → Settings → Git → Deploy Hooks
2. Crie um hook com nome "mcp-deploy" e branch "main"
3. Copie a URL gerada para `VERCEL_DEPLOY_HOOK`

## Tools disponíveis

| Tool | Parâmetros | O que faz |
|------|-----------|-----------|
| `get_deployment_status` | `deployment_id?` | Retorna estado do deployment (omita ID para o mais recente) |
| `list_deployments` | `limit?`, `target?` | Lista últimos N deployments (production ou preview) |
| `get_deployment_logs` | `deployment_id`, `limit?` | Retorna log de build do deployment |
| `list_env_vars` | — | Lista variáveis configuradas (nomes apenas, sem valores) |
| `check_env_var` | `name` | Confirma se uma variável existe em production e preview |
| `trigger_deploy` | `message?` | Aciona deploy via deploy hook |

## Configuração no Claude Code

Já configurado em `.claude/settings.json`. Defina as variáveis de ambiente antes de iniciar.

## Exemplo de uso

**Verificar se as variáveis do Supabase estão na Vercel:**
```
use vercel-mcp check_env_var com name="VITE_SUPABASE_URL"
use vercel-mcp check_env_var com name="VITE_SUPABASE_ANON_KEY"
```

**Ver log do último build com erro:**
```
use vercel-mcp get_deployment_status (pega o id)
use vercel-mcp get_deployment_logs com deployment_id="dpl_..." limit=100
```
