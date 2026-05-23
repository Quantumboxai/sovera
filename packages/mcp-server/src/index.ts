#!/usr/bin/env node
/**
 * Sovera MCP Server
 *
 * Exposes a Sovera project to any MCP-capable agent (Claude Desktop, Cursor,
 * VS Code Copilot, Lovable, Windsurf, Continue.dev, Cline, …) via stdio.
 *
 * Usage:
 *   SOVERA_URL=https://<your-fn>.azurewebsites.net \
 *   SOVERA_KEY=sov_live_... \
 *   [SOVERA_TENANT=acme] \
 *   [SOVERA_READ_ONLY=1] \
 *   npx -y @sovera/mcp
 *
 * Add to Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "sovera": {
 *         "command": "npx",
 *         "args": ["-y", "@sovera/mcp"],
 *         "env": {
 *           "SOVERA_URL": "https://your-fn.azurewebsites.net",
 *           "SOVERA_KEY": "sov_live_xxx",
 *           "SOVERA_READ_ONLY": "1"
 *         }
 *       }
 *     }
 *   }
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const SOVERA_URL = (process.env.SOVERA_URL ?? '').replace(/\/+$/, '');
const SOVERA_KEY = process.env.SOVERA_KEY ?? '';
const SOVERA_TENANT = process.env.SOVERA_TENANT?.trim() || undefined;
const READ_ONLY = /^(1|true|yes)$/i.test(process.env.SOVERA_READ_ONLY ?? '');

if (!SOVERA_URL || !SOVERA_KEY) {
  process.stderr.write(
    '[sovera-mcp] SOVERA_URL and SOVERA_KEY are required.\n' +
    'Get a key at https://<your-studio>.azurecontainerapps.io/api-keys\n'
  );
  process.exit(1);
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────
type FetchInit = { method?: string; query?: Record<string, string | number | undefined>; body?: unknown };
async function api<T = unknown>(path: string, init: FetchInit = {}): Promise<T> {
  const url = new URL(SOVERA_URL + (path.startsWith('/') ? path : '/' + path));
  if (init.query) for (const [k, v] of Object.entries(init.query)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const r = await fetch(url.toString(), {
    method: init.method ?? 'GET',
    headers: {
      'authorization': `Bearer ${SOVERA_KEY}`,
      'x-api-key': SOVERA_KEY,
      'content-type': init.body ? 'application/json' : 'text/plain',
      'user-agent': 'sovera-mcp/0.1.0',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!r.ok) {
    const msg = typeof json === 'object' && json && 'error' in json ? (json as { error: string }).error : `HTTP ${r.status}`;
    throw new Error(`${path} → ${msg}`);
  }
  return json as T;
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

// ─── Tool definitions ────────────────────────────────────────────────────────
const tools = [
  {
    name: 'sovera_sql',
    description:
      'Run a SQL query against the Sovera Postgres database. Read-only by default (SELECT only). ' +
      'Use this to inspect schema, fetch rows, count records, or join tables. ' +
      'If SOVERA_READ_ONLY=1 is set in env, DDL/DML statements are rejected.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A single SQL statement to execute.' },
        tenant: { type: 'string', description: 'Optional tenant id (RLS scope). Falls back to SOVERA_TENANT env.' },
      },
      required: ['sql'],
    },
    zod: z.object({ sql: z.string().min(1), tenant: z.string().optional() }),
    handler: async (input: { sql: string; tenant?: string }) => {
      if (READ_ONLY && !/^\s*(select|with|explain|show)\b/i.test(input.sql)) {
        return err('SOVERA_READ_ONLY is enabled — only SELECT/WITH/EXPLAIN/SHOW are permitted.');
      }
      const body: Record<string, unknown> = { sql: input.sql };
      const t = input.tenant ?? SOVERA_TENANT;
      if (t) body.tenant = t;
      const res = await api('/api/sql', { method: 'POST', body });
      return ok(res);
    },
  },
  {
    name: 'sovera_tables_list',
    description: 'List all tables in the public/app schemas of the Sovera database, including row estimates and column counts.',
    inputSchema: { type: 'object', properties: {} },
    zod: z.object({}),
    handler: async () => ok(await api('/api/tables')),
  },
  {
    name: 'sovera_tenants_list',
    description: 'List all tenants in this Sovera project.',
    inputSchema: { type: 'object', properties: {} },
    zod: z.object({}),
    handler: async () => ok(await api('/api/tenants')),
  },
  {
    name: 'sovera_vector_search',
    description:
      'Semantic search over vector embeddings stored in Sovera. ' +
      'Returns the top-k most similar text chunks with cosine similarity scores. ' +
      'Use this for RAG, finding similar documents, or grounding agent answers in your data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language query text.' },
        k: { type: 'number', description: 'Number of results to return (default 5, max 50).', minimum: 1, maximum: 50 },
        tenant: { type: 'string', description: 'Optional tenant filter. API keys are auto-locked to their tenant.' },
        source: { type: 'string', description: 'Optional source filter (e.g. "docs", "support-tickets").' },
      },
      required: ['query'],
    },
    zod: z.object({ query: z.string().min(1), k: z.number().int().min(1).max(50).optional(), tenant: z.string().optional(), source: z.string().optional() }),
    handler: async (input: { query: string; k?: number; tenant?: string; source?: string }) => {
      const body: Record<string, unknown> = { query: input.query, k: input.k ?? 5 };
      const t = input.tenant ?? SOVERA_TENANT;
      if (t) body.tenant = t;
      if (input.source) body.source = input.source;
      return ok(await api('/api/search', { method: 'POST', body }));
    },
  },
  {
    name: 'sovera_vector_embed',
    description:
      'Embed one or more text chunks into Sovera\'s vector store. ' +
      'Use this to index documentation, support tickets, or knowledge-base entries for later semantic retrieval. ' +
      'Disabled when SOVERA_READ_ONLY=1.',
    inputSchema: {
      type: 'object',
      properties: {
        texts: { type: 'array', items: { type: 'string' }, description: 'Text chunks to embed (max 64 per call).', minItems: 1, maxItems: 64 },
        source: { type: 'string', description: 'A tag identifying where these came from (e.g. "docs", "kb").' },
        tenant: { type: 'string', description: 'Optional tenant scope.' },
      },
      required: ['texts', 'source'],
    },
    zod: z.object({ texts: z.array(z.string().min(1)).min(1).max(64), source: z.string().min(1), tenant: z.string().optional() }),
    handler: async (input: { texts: string[]; source: string; tenant?: string }) => {
      if (READ_ONLY) return err('SOVERA_READ_ONLY is enabled — write operations are disabled.');
      const body: Record<string, unknown> = { texts: input.texts, source: input.source };
      const t = input.tenant ?? SOVERA_TENANT;
      if (t) body.tenant = t;
      return ok(await api('/api/embed', { method: 'POST', body }));
    },
  },
  {
    name: 'sovera_realtime_publish',
    description: 'Publish a message to a Sovera realtime channel (Azure Web PubSub). Subscribers will receive it instantly. Disabled when SOVERA_READ_ONLY=1.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name to publish to.' },
        payload: { type: 'object', description: 'JSON payload to send.', additionalProperties: true },
      },
      required: ['channel', 'payload'],
    },
    zod: z.object({ channel: z.string().min(1), payload: z.record(z.unknown()) }),
    handler: async (input: { channel: string; payload: Record<string, unknown> }) => {
      if (READ_ONLY) return err('SOVERA_READ_ONLY is enabled — write operations are disabled.');
      return ok(await api('/api/realtime/publish', { method: 'POST', body: { channel: input.channel, payload: input.payload } }));
    },
  },
  {
    name: 'sovera_blob_list',
    description: 'List blobs in a Sovera storage container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Container name.' },
        prefix: { type: 'string', description: 'Optional path prefix filter.' },
      },
      required: ['container'],
    },
    zod: z.object({ container: z.string().min(1), prefix: z.string().optional() }),
    handler: async (input: { container: string; prefix?: string }) =>
      ok(await api(`/api/blob/${encodeURIComponent(input.container)}`, { query: { prefix: input.prefix } })),
  },
  {
    name: 'sovera_logs',
    description: 'Query recent application logs from the Sovera Functions backend (App Insights). Useful for debugging.',
    inputSchema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: 'Look-back window in hours (default 1, max 168).', minimum: 1, maximum: 168 },
        grep: { type: 'string', description: 'Optional substring filter on the message field.' },
        level: { type: 'string', enum: ['Error', 'Warning', 'Information'], description: 'Optional severity filter.' },
      },
    },
    zod: z.object({ hours: z.number().int().min(1).max(168).optional(), grep: z.string().optional(), level: z.enum(['Error', 'Warning', 'Information']).optional() }),
    handler: async (input: { hours?: number; grep?: string; level?: string }) =>
      ok(await api('/api/logs', { query: { hours: input.hours ?? 1, grep: input.grep, level: input.level } })),
  },
  {
    name: 'sovera_compliance_status',
    description: 'Return the current compliance posture of this Sovera project (HDS, GDPR, EU data residency, encryption, RBAC).',
    inputSchema: { type: 'object', properties: {} },
    zod: z.object({}),
    handler: async () => ok(await api('/api/compliance')),
  },
];

// ─── Server wiring ───────────────────────────────────────────────────────────
const server = new Server(
  { name: 'sovera', version: '0.1.0' },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find(t => t.name === req.params.name);
  if (!tool) return err(`Unknown tool: ${req.params.name}`);
  try {
    const parsed = tool.zod.parse(req.params.arguments ?? {});
    return await tool.handler(parsed as never);
  } catch (e) {
    return err((e as Error).message);
  }
});

// Lightweight resources: project metadata + schema introspection.
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'sovera://project', name: 'Project info', description: 'Sovera project URL, tenant scope, and read-only flag.', mimeType: 'application/json' },
    { uri: 'sovera://schema',  name: 'Database schema', description: 'Tables, columns, and row estimates.', mimeType: 'application/json' },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  if (uri === 'sovera://project') {
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ url: SOVERA_URL, tenant: SOVERA_TENANT ?? null, readOnly: READ_ONLY }, null, 2) }] };
  }
  if (uri === 'sovera://schema') {
    const tables = await api('/api/tables').catch(e => ({ error: (e as Error).message }));
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(tables, null, 2) }] };
  }
  throw new Error(`Unknown resource: ${uri}`);
});

// ─── Boot ────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[sovera-mcp] connected · url=${SOVERA_URL} · tenant=${SOVERA_TENANT ?? '(none)'} · readOnly=${READ_ONLY}\n`);
}
main().catch(e => { process.stderr.write(`[sovera-mcp] fatal: ${(e as Error).message}\n`); process.exit(1); });
