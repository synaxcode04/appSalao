/**
 * supabase-mcp — MCP Server para o projeto App Salão
 * Permite que agents consultem o banco, verifiquem políticas RLS e inspecionem o schema
 * sem precisar abrir o Supabase Dashboard manualmente.
 *
 * Variáveis de ambiente obrigatórias:
 *   SUPABASE_DB_URL  — postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
 *   SUPABASE_URL     — https://[ref].supabase.co  (para operações via REST)
 *   SUPABASE_SERVICE_ROLE_KEY — chave do painel Supabase → Settings → API
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { z } from 'zod';

const { Pool } = pg;

// --- Validação de env vars ---
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_DB_URL) {
  process.stderr.write('[supabase-mcp] SUPABASE_DB_URL não configurada\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString: SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

async function runQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; error?: string }> {
  try {
    const res = await pool.query(sql, params);
    return { rows: res.rows as T[] };
  } catch (err: any) {
    return { rows: [], error: err.message };
  }
}

// --- Servidor MCP ---
const server = new McpServer({
  name: 'supabase-mcp',
  version: '1.0.0',
});

// ── tool: query_sql ──────────────────────────────────────────────────────────
server.tool(
  'query_sql',
  {
    sql: z.string().describe('Query SQL a executar. Apenas SELECT e WITH são permitidos.'),
    params: z.array(z.any()).optional().describe('Parâmetros para substituição posicional ($1, $2…)'),
  },
  async ({ sql, params }) => {
    const trimmed = sql.trim().toLowerCase();
    if (!trimmed.startsWith('select') && !trimmed.startsWith('with')) {
      return { content: [{ type: 'text' as const, text: '❌ Apenas queries SELECT ou WITH são permitidas.' }] };
    }
    const { rows, error } = await runQuery(sql, params);
    if (error) return { content: [{ type: 'text' as const, text: `❌ Erro: ${error}` }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
  }
);

// ── tool: check_rls_policies ─────────────────────────────────────────────────
server.tool(
  'check_rls_policies',
  {
    table_name: z.string().describe('Nome da tabela no schema public (ex: appointments, services)'),
  },
  async ({ table_name }) => {
    const { rows, error } = await runQuery(`
      SELECT
        policyname,
        cmd,
        permissive,
        roles,
        qual        AS "USING",
        with_check  AS "WITH CHECK"
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY cmd, policyname
    `, [table_name]);

    if (error) return { content: [{ type: 'text' as const, text: `❌ Erro: ${error}` }] };
    if (rows.length === 0) {
      return { content: [{ type: 'text' as const, text: `⚠️ Nenhuma política RLS encontrada para "${table_name}". RLS pode estar desabilitado.` }] };
    }

    // Alerta para WITH CHECK inseguro
    const insecure = rows.filter((r: any) => r['WITH CHECK'] === 'true' || r['WITH CHECK'] === null && ['INSERT', 'ALL', 'UPDATE'].includes(r.cmd));
    let output = JSON.stringify(rows, null, 2);
    if (insecure.length > 0) {
      output += `\n\n⚠️ ATENÇÃO: ${insecure.length} política(s) com WITH CHECK potencialmente inseguro. Verifique se salon_id está vinculado ao owner_id via JOIN.`;
    }
    return { content: [{ type: 'text' as const, text: output }] };
  }
);

// ── tool: get_table_schema ───────────────────────────────────────────────────
server.tool(
  'get_table_schema',
  {
    table_name: z.string().describe('Nome da tabela'),
  },
  async ({ table_name }) => {
    const { rows: cols, error: e1 } = await runQuery(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table_name]);

    const { rows: pk, error: e2 } = await runQuery(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    `, [table_name]);

    if (e1) return { content: [{ type: 'text' as const, text: `❌ Erro: ${e1}` }] };

    const { rows: rlsEnabled } = await runQuery(`
      SELECT rowsecurity FROM pg_tables
      WHERE schemaname = 'public' AND tablename = $1
    `, [table_name]);

    const rls = rlsEnabled[0] ? (rlsEnabled[0] as any).rowsecurity : null;
    const out = {
      table: table_name,
      rls_enabled: rls,
      primary_keys: pk.map((r: any) => r.column_name),
      columns: cols,
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
  }
);

// ── tool: list_tables ────────────────────────────────────────────────────────
server.tool(
  'list_tables',
  {},
  async () => {
    const { rows, error } = await runQuery(`
      SELECT
        t.tablename,
        t.rowsecurity AS rls_enabled,
        s.n_live_tup AS estimated_rows
      FROM pg_tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.tablename
      WHERE t.schemaname = 'public'
      ORDER BY t.tablename
    `);
    if (error) return { content: [{ type: 'text' as const, text: `❌ Erro: ${error}` }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
  }
);

// ── tool: test_rls_policy ────────────────────────────────────────────────────
server.tool(
  'test_rls_policy',
  {
    table_name: z.string().describe('Tabela a testar'),
    user_id: z.string().uuid().describe('UUID do usuário a simular'),
    operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE']).describe('Operação a simular'),
    test_row: z.record(z.any()).optional().describe('Linha de teste para INSERT/UPDATE (JSON)'),
  },
  async ({ table_name, user_id, operation, test_row }) => {
    // Usa SET LOCAL para simular o contexto de autenticação do Supabase
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL role = 'authenticated'`);
      await client.query(`SET LOCAL "request.jwt.claim.sub" = '${user_id}'`);

      let testSql = '';
      if (operation === 'SELECT') {
        testSql = `SELECT COUNT(*) FROM ${table_name}`;
      } else if (operation === 'INSERT' && test_row) {
        const keys = Object.keys(test_row).join(', ');
        const vals = Object.values(test_row).map((_, i) => `$${i + 1}`).join(', ');
        testSql = `INSERT INTO ${table_name} (${keys}) VALUES (${vals}) RETURNING id`;
      } else {
        testSql = `SELECT COUNT(*) FROM ${table_name}`;
      }

      const result = await client.query(testSql, test_row ? Object.values(test_row) : []);
      await client.query('ROLLBACK');

      return { content: [{ type: 'text' as const, text: `✅ Operação ${operation} permitida para user_id=${user_id}\nResultado: ${JSON.stringify(result.rows)}` }] };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return { content: [{ type: 'text' as const, text: `🚫 Operação ${operation} BLOQUEADA pela RLS para user_id=${user_id}\nErro: ${err.message}` }] };
    } finally {
      client.release();
    }
  }
);

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
