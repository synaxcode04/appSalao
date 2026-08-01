/**
 * onesignal-mcp — MCP Server para o projeto App Salão
 * Permite que agents enviem notificações de teste, verifiquem entrega
 * e consultem estatísticas sem abrir o OneSignal Dashboard.
 *
 * Variáveis de ambiente obrigatórias:
 *   ONESIGNAL_APP_ID      — ID do app no OneSignal Dashboard → Settings → Keys & IDs
 *   ONESIGNAL_REST_API_KEY — REST API Key (nunca usar a User Auth Key aqui)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const APP_ID = process.env.ONESIGNAL_APP_ID ?? '';
const API_KEY = process.env.ONESIGNAL_REST_API_KEY ?? '';

if (!APP_ID || !API_KEY) {
  process.stderr.write('[onesignal-mcp] ONESIGNAL_APP_ID e ONESIGNAL_REST_API_KEY são obrigatórios\n');
  process.exit(1);
}

const BASE = 'https://onesignal.com/api/v1';

async function osFetch(path: string, opts?: RequestInit): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Basic ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

const server = new McpServer({
  name: 'onesignal-mcp',
  version: '1.0.0',
});

// ── tool: send_test_notification ─────────────────────────────────────────────
server.tool(
  'send_test_notification',
  {
    player_id: z.string().describe('ID do dispositivo destinatário (OneSignal player_id)'),
    title: z.string().describe('Título da notificação'),
    message: z.string().describe('Corpo da notificação'),
    event_type: z.string().optional().describe('Tipo de evento do SPEC (ex: new_appointment, owner_cancel)'),
  },
  async ({ player_id, title, message, event_type }) => {
    const payload = {
      app_id: APP_ID,
      include_player_ids: [player_id],
      headings: { pt: title, en: title },
      contents: { pt: message, en: message },
      data: event_type ? { event: event_type, source: 'mcp-test' } : { source: 'mcp-test' },
    };

    const { ok, data } = await osFetch('/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${data.errors ? JSON.stringify(data.errors) : JSON.stringify(data)}` }] };
    return { content: [{ type: 'text' as const, text: `✅ Notificação enviada!\nID: ${data.id}\nRecipients: ${data.recipients}\n\nUse check_delivery_status com id="${data.id}" para verificar a entrega.` }] };
  }
);

// ── tool: check_delivery_status ──────────────────────────────────────────────
server.tool(
  'check_delivery_status',
  {
    notification_id: z.string().describe('ID da notificação (retornado por send_test_notification ou list_recent_notifications)'),
  },
  async ({ notification_id }) => {
    const { ok, data } = await osFetch(`/notifications/${notification_id}?app_id=${APP_ID}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${JSON.stringify(data)}` }] };

    const status = {
      id: data.id,
      headings: data.headings?.pt ?? data.headings?.en,
      contents: data.contents?.pt ?? data.contents?.en,
      successful: data.successful,
      failed: data.failed,
      errored: data.errored,
      converted: data.converted,
      remaining: data.remaining,
      queued_at: data.queued_at ? new Date(data.queued_at * 1000).toISOString() : null,
      send_after: data.send_after ? new Date(data.send_after * 1000).toISOString() : null,
      completed_at: data.completed_at ? new Date(data.completed_at * 1000).toISOString() : null,
    };

    const delivery = status.successful > 0
      ? `✅ Entregue a ${status.successful} dispositivo(s)`
      : status.failed > 0
      ? `❌ Falha na entrega (${status.failed} falhas)`
      : `⏳ Pendente (${status.remaining} restantes)`;

    return { content: [{ type: 'text' as const, text: `${delivery}\n\n${JSON.stringify(status, null, 2)}` }] };
  }
);

// ── tool: list_recent_notifications ──────────────────────────────────────────
server.tool(
  'list_recent_notifications',
  {
    limit: z.number().int().min(1).max(50).optional().default(10).describe('Quantidade de notificações (máx 50)'),
    offset: z.number().int().min(0).optional().default(0).describe('Offset para paginação'),
  },
  async ({ limit, offset }) => {
    const { ok, data } = await osFetch(`/notifications?app_id=${APP_ID}&limit=${limit}&offset=${offset}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${JSON.stringify(data)}` }] };

    const notifications = (data.notifications ?? []).map((n: any) => ({
      id: n.id,
      heading: n.headings?.pt ?? n.headings?.en ?? '(sem título)',
      content: (n.contents?.pt ?? n.contents?.en ?? '').slice(0, 80),
      successful: n.successful,
      failed: n.failed,
      queued_at: n.queued_at ? new Date(n.queued_at * 1000).toISOString() : null,
    }));

    return { content: [{ type: 'text' as const, text: `Total: ${data.total_count ?? '?'}\n\n${JSON.stringify(notifications, null, 2)}` }] };
  }
);

// ── tool: get_app_stats ───────────────────────────────────────────────────────
server.tool(
  'get_app_stats',
  {},
  async () => {
    const { ok, data } = await osFetch(`/apps/${APP_ID}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${JSON.stringify(data)}` }] };

    const stats = {
      name: data.name,
      players: data.players,
      messageable_players: data.messageable_players,
      updated_at: data.updated_at,
      created_at: data.created_at,
      chrome_web_origin: data.chrome_web_origin,
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(stats, null, 2) }] };
  }
);

// ── tool: get_notification_detail ─────────────────────────────────────────────
server.tool(
  'get_notification_detail',
  {
    notification_id: z.string().describe('ID da notificação'),
  },
  async ({ notification_id }) => {
    const { ok, data } = await osFetch(`/notifications/${notification_id}?app_id=${APP_ID}`);
    if (!ok) return { content: [{ type: 'text' as const, text: `❌ Erro: ${JSON.stringify(data)}` }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
