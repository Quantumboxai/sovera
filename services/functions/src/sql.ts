import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPool } from './db.js';
import { guard } from './auth.js';

type SqlBody = { sql?: string; tenant?: string };

// Strip SQL comments so the SELECT/CTE check isn't fooled by a leading -- comment.
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
    .replace(/--[^\n]*/g, '')           // -- to end of line
    .trim();
}

// Read-only allowlist: must start with SELECT or WITH (CTE) and contain no DDL/DML keywords.
const FORBIDDEN = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|vacuum|analyze|cluster|comment|reindex|do|call|begin|commit|rollback|set\b|reset\b|prepare|deallocate|listen|notify|lock|fetch|move|discard|refresh)\b/i;

export async function runSql(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:read'); if (!g.ok) return g.response;
  let body: SqlBody;
  try { body = (await req.json()) as SqlBody; }
  catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }

  const raw = (body.sql ?? '').trim();
  if (!raw) return { status: 400, jsonBody: { error: 'sql_required' } };
  if (raw.length > 20_000) return { status: 400, jsonBody: { error: 'sql_too_long' } };

  const stripped = stripComments(raw);
  if (!/^(select|with)\b/i.test(stripped)) {
    return { status: 400, jsonBody: { error: 'read_only', detail: 'Only SELECT / WITH queries are allowed.' } };
  }
  if (FORBIDDEN.test(stripped)) {
    return { status: 400, jsonBody: { error: 'forbidden_statement', detail: 'Statement contains a non-read keyword.' } };
  }
  // Reject multi-statement
  // Strip trailing semicolon, then ensure none remain inside.
  const noTrailing = stripped.replace(/;\s*$/, '');
  if (noTrailing.includes(';')) {
    return { status: 400, jsonBody: { error: 'single_statement_only' } };
  }

  const tenant = (body.tenant ?? '').trim();
  const pool = await getPool();
  const client = await pool.connect();
  const t0 = Date.now();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '8s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    if (tenant) {
      // Best-effort: surface the tenant slug to any policies that read it via current_setting.
      // We use a parameterized SELECT set_config so the value cannot break out.
      await client.query("SELECT set_config('app.tenant', $1, true)", [tenant]);
    }
    const result = await client.query(raw);
    await client.query('COMMIT');
    const ms = Date.now() - t0;
    const fields = result.fields?.map(f => f.name) ?? [];
    // Cap returned rows defensively (server should already limit, but belt-and-braces).
    const rows = (result.rows ?? []).slice(0, 1000).map(r => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(r)) {
        const v = (r as Record<string, unknown>)[k];
        out[k] = v instanceof Date ? v.toISOString()
               : typeof v === 'bigint' ? v.toString()
               : v === null ? null
               : (typeof v === 'object' ? JSON.stringify(v) : v);
      }
      return out;
    });
    return {
      status: 200,
      jsonBody: { ok: true, ms, fields, rows, rowCount: result.rowCount ?? rows.length, tenant: tenant || null },
    };
  } catch (e: unknown) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    ctx.error('runSql failed', e);
    const msg = (e as Error)?.message ?? 'unknown';
    return { status: 400, jsonBody: { error: 'query_failed', detail: msg, ms: Date.now() - t0 } };
  } finally {
    client.release();
  }
}

app.http('sql', {
  route: 'sql',
  methods: ['POST'],
  authLevel: 'function',
  handler: runSql,
});
