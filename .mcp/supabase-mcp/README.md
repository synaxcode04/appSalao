# supabase-mcp

MCP Server que permite aos agents do App Salão consultar o banco de dados, inspecionar políticas RLS e validar o schema sem abrir o Supabase Dashboard.

## Instalação

```bash
cd .mcp/supabase-mcp
npm install
```

## Variáveis de ambiente

| Variável | Onde encontrar | Obrigatória |
|----------|---------------|-------------|
| `SUPABASE_DB_URL` | Supabase Dashboard → Settings → Database → Connection string (URI) | ✅ |
| `SUPABASE_URL` | Dashboard → Settings → API → Project URL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Settings → API → service_role key | ✅ |

**Formato do `SUPABASE_DB_URL`:**
```
postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
```

> ⚠️ Nunca commitar essas variáveis. Adicione ao `.env` local e ao Vercel Dashboard.

## Tools disponíveis

| Tool | Parâmetros | O que faz |
|------|-----------|-----------|
| `query_sql` | `sql`, `params?` | Executa SELECT/WITH e retorna resultado como JSON |
| `check_rls_policies` | `table_name` | Lista todas as políticas RLS da tabela com alerta de WITH CHECK inseguro |
| `get_table_schema` | `table_name` | Retorna colunas, tipos, nullable, defaults e se RLS está ativo |
| `list_tables` | — | Lista tabelas do schema public com RLS status e row count estimado |
| `test_rls_policy` | `table_name`, `user_id`, `operation`, `test_row?` | Simula uma operação como um user_id específico e confirma se passa ou é bloqueada |

## Configuração no Claude Code

Já configurado em `.claude/settings.json`. Defina as variáveis de ambiente antes de iniciar.

## Exemplo de uso

**Verificar se RLS da tabela services está correta:**
```
use supabase-mcp check_rls_policies com table_name="services"
```

**Simular que um dono tenta acessar dados de outro salão:**
```
use supabase-mcp test_rls_policy com table_name="services", user_id="uuid-do-dono-A", operation="SELECT"
```
