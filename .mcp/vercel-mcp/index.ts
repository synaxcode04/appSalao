/**
 * vercel-mcp — MCP Server para o projeto App Salão
 * Permite que agents monitorem deployments, verifiquem build logs e validem
 * variáveis de ambiente sem sair do Claude.
 *
 * Variáveis de ambiente obrigatórias:
 *   VERCEL_TOKEN      — token da conta em vercel.com/account/tokens
 *   VERCEL_PROJECT_ID — ID do projeto (vercel.com/[team]/[project]/settings)
 *
 * Opcional:
 *   VERCEL_TEAM_ID       — ID do time (se o projeto estiver num time)
 *   VERCEL_DEPLOY_HOOK   — URL do deploy hook para acionar deploys manuais
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TOKEN = process.env.VERCEL_TOKEN ?? '';
const PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? '';
const TEAM_ID = process.env.VERCEL_TEAM_ID ?? '';
const DEPLOY_HOOK = process.env.VERCEL_DEPLOY_HOOK ?? '';

if (!TOKEN || !PROJECT_ID) {
  process.stderr.write('[vercel-mcp] VERCEL_TOKEN e VERCEL_PROJECT_ID são obrigatórios\n');
  process.exit(1);
}

const BASE = 'https://api.vercel.com';

function teamParam(sep: '?' | '&' = '?') {
  return TEAM_ID ? `${sep}teamId=${TEAM_ID}` : '';
}

async function vFetch(path: string, opts?: RequestInit): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

const server = new McpServer({
  name: 'vercel-mcp',
  version: '1.0.0',
});

// ── tool: get_deployment_status ──────────────────────────────────────────────
server.tool(
  'get_deployment_status',
  {
    deployment_id: z.string().optional().describe('ID do deployment (omita para buscar o mais recente)'),
  },
  async ({ deployment_id }) => {
    if (deployment_id) {
      const { ok, data } = await vFetch(`/v13/deployments/${deployment_id}${teamParam()}`);
      if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${data.error?.message ?? JSON.stringify(data)}` }] };
      const d = data;
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        id: d.id,
        url: d.url,
        state: d.readyState ?? d.state,
        created: d.createdAt,
        ready: d.ready,
        meta: d.meta,
      }, null, 2) }] };
    }

    // Busca o mais recente
    const { ok, data } = await vFetch(`/v9/projects/${PROJECT_ID}/deployments?limit=1${teamParam('&')}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${data.error?.message ?? JSON.stringify(data)}` }] };
    const d = data.deployments?.[0];
    if (!d) return { content: [{ type: 'text' as const, text: 'Nenhum deployment encontrado.' }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify({
      id: d.uid,
      url: d.url,
      state: d.readyState ?? d.state,
      created: d.createdAt,
      target: d.target,
    }, null, 2) }] };
  }
);

// ── tool: list_deployments ───────────────────────────────────────────────────
server.tool(
  'list_deployments',
  {
    limit: z.number().int().min(1).max(20).optional().default(5).describe('Quantidade de deployments (máx 20)'),
    target: z.enum(['production', 'preview']).optional().describe('Filtrar por ambiente'),
  },
  async ({ limit, target }) => {
    let path = `/v9/projects/${PROJECT_ID}/deployments?limit=${limit}${teamParam('&')}`;
    if (target) path += `&target=${target}`;
    const { ok, data } = await vFetch(path);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${data.error?.message}` }] };
    const deployments = (data.deployments ?? []).map((d: any) => ({
      id: d.uid,
      url: d.url,
      state: d.readyState ?? d.state,
      target: d.target,
      created: d.createdAt,
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(deployments, null, 2) }] };
  }
);

// ── tool: get_deployment_logs ────────────────────────────────────────────────
server.tool(
  'get_deployment_logs',
  {
    deployment_id: z.string().describe('ID do deployment (obtido via get_deployment_status)'),
    limit: z.number().int().min(10).max(200).optional().default(50).describe('Número de linhas'),
  },
  async ({ deployment_id, limit }) => {
    const { ok, data } = await vFetch(`/v2/deployments/${deployment_id}/events?limit=${limit}${teamParam('&')}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${data.error?.message}` }] };
    const lines = (data ?? [])
      .filter((e: any) => e.type === 'stdout' || e.type === 'stderr' || e.type === 'command')
      .map((e: any) => `[${e.type}] ${e.payload?.text ?? e.text ?? ''}`)
      .join('\n');
    return { content: [{ type: 'text' as const, text: lines || '(sem logs)' }] };
  }
);

// ── tool: list_env_vars ──────────────────────────────────────────────────────
server.tool(
  'list_env_vars',
  {},
  async () => {
    const { ok, data } = await vFetch(`/v9/projects/${PROJECT_ID}/env${teamParam()}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${data.error?.message}` }] };
    const vars = (data.envs ?? []).map((e: any) => ({
      key: e.key,
      type: e.type,
      target: e.target,
      updatedAt: e.updatedAt,
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(vars, null, 2) }] };
  }
);

// ── tool: check_env_var ──────────────────────────────────────────────────────
server.tool(
  'check_env_var',
  {
    name: z.string().describe('Nome da variável (ex: VITE_SUPABASE_URL)'),
  },
  async ({ name }) => {
    const { ok, data } = await vFetch(`/v9/projects/${PROJECT_ID}/env${teamParam()}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${data.error?.message}` }] };
    const found = (data.envs ?? []).filter((e: any) => e.key === name);
    if (found.length === 0) {
      return { content: [{ type: 'text' as const, text: `❌ Variável "${name}" NÃO encontrada na Vercel.` }] };
    }
    const targets = found.map((e: any) => e.target).flat().join(', ');
    return { content: [{ type: 'text' as const, text: `✅ Variável "${name}" existe nos ambientes: ${targets}` }] };
  }
);

// ── tool: trigger_deploy ─────────────────────────────────────────────────────
server.tool(
  'trigger_deploy',
  {
    message: z.string().optional().describe('Mensagem para o deploy (opcional)'),
  },
  async ({ message }) => {
    if (!DEPLOY_HOOK) {
      return { content: [{ type: 'text' as const, text: '⚠️ VERCEL_DEPLOY_HOOK não configurado. Configure no Vercel Dashboard → Settings → Git → Deploy Hooks e defina a variável de ambiente.' }] };
    }
    const res = await fetch(DEPLOY_HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: message ? JSON.stringify({ message }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { content: [{ type: 'text' as const, text: `❌ Erro ao acionar deploy: ${JSON.stringify(data)}` }] };
    return { content: [{ type: 'text' as const, text: `✅ Deploy acionado! Use get_deployment_status para acompanhar.\n${JSON.stringify(data, null, 2)}` }] };
  }
);

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
