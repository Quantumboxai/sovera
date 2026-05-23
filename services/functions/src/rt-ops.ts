// Realtime ops: active listeners (pg_stat_activity) + App Insights metrics for rt-publish/rt-subscribe.
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query';
import { DefaultAzureCredential } from '@azure/identity';
import pg from 'pg';
import { guard } from './auth.js';

const credential = new DefaultAzureCredential();
const WORKSPACE_ID = process.env.LAW_WORKSPACE_ID!;
const logs = new LogsQueryClient(credential);

async function pgClient(): Promise<pg.Client> {
  const tok = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
  const c = new pg.Client({
    host: process.env.PG_HOST!,
    user: process.env.PG_USER!,
    database: process.env.PG_DB ?? 'postgres',
    password: tok!.token,
    port: 5432,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
}

// ---- Active listeners --------------------------------------------------------
// pg.listening_channels is a SQL function (introduced in PG 9.0+) that returns
// the channels the *current* session is LISTENing to — but we want a global view.
// pg_stat_activity exposes wait_event_info; sessions on LISTEN show wait_event = 'ClientRead'
// AND a recent NOTIFY/LISTEN in query. We approximate by listing all sessions whose
// most-recent query was a LISTEN statement and the connection is still idle.
const LISTENERS_KQL = `
select
  pid,
  usename                                                            as user_name,
  application_name,
  client_addr::text                                                  as client_addr,
  state,
  wait_event,
  backend_start,
  state_change,
  query
from pg_stat_activity
where query ilike 'LISTEN %'
  and state in ('idle','active','idle in transaction')
  and backend_type = 'client backend'
order by state_change desc
limit 100
`;

async function listeners(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:read'); if (!g.ok) return g.response;
  const c = await pgClient();
  try {
    const r = await c.query(LISTENERS_KQL);
    // Group by channel parsed from `LISTEN channelname`
    const byChannel = new Map<string, { channel: string; count: number; sessions: any[] }>();
    for (const row of r.rows) {
      const m = /LISTEN\s+"?([a-zA-Z0-9_]+)"?/i.exec(row.query ?? '');
      const ch = m?.[1] ?? '(unknown)';
      if (!byChannel.has(ch)) byChannel.set(ch, { channel: ch, count: 0, sessions: [] });
      const g = byChannel.get(ch)!;
      g.count++;
      g.sessions.push({
        pid: row.pid,
        user: row.user_name,
        app: row.application_name,
        client: row.client_addr,
        state: row.state,
        since: row.state_change,
      });
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: {
        total: r.rows.length,
        channels: Array.from(byChannel.values()).sort((a, b) => b.count - a.count),
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    ctx.error('rt-listeners query failed', e);
    return { status: 500, jsonBody: { error: 'listeners_query_failed', detail: (e as Error)?.message } };
  } finally { await c.end(); }
}

// ---- App Insights metrics for rt-publish / rt-subscribe ---------------------
const METRICS_KQL = `
AppRequests
| where TimeGenerated > ago(24h)
| where Name in ('rt-publish','rt-subscribe')
| summarize
    count_ = count(),
    errors = countif(Success == false),
    p50 = percentile(DurationMs, 50),
    p95 = percentile(DurationMs, 95),
    lastSeen = max(TimeGenerated)
  by Name
`;

const TIMESERIES_KQL = `
AppRequests
| where TimeGenerated > ago(24h)
| where Name in ('rt-publish','rt-subscribe')
| summarize count_ = count() by bin(TimeGenerated, 1h), Name
| order by TimeGenerated asc
`;

async function metrics(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:read'); if (!g.ok) return g.response;
  if (!WORKSPACE_ID) return { status: 500, jsonBody: { error: 'LAW_WORKSPACE_ID_missing' } };
  try {
    const [sumRes, tsRes] = await Promise.all([
      logs.queryWorkspace(WORKSPACE_ID, METRICS_KQL, { duration: 'P1D' }),
      logs.queryWorkspace(WORKSPACE_ID, TIMESERIES_KQL, { duration: 'P1D' }),
    ]);
    const summary: Record<string, { count: number; errors: number; p50ms: number; p95ms: number; lastSeen: string | null }> = {};
    if (sumRes.status === LogsQueryResultStatus.Success && sumRes.tables[0]) {
      const t = sumRes.tables[0];
      const idx = Object.fromEntries(t.columnDescriptors.map((c, i) => [c.name, i])) as Record<string, number>;
      for (const row of t.rows) {
        const name = String(row[idx.Name] ?? '');
        const ls = row[idx.lastSeen] as Date | null;
        summary[name] = {
          count: Number(row[idx.count_] ?? 0),
          errors: Number(row[idx.errors] ?? 0),
          p50ms: Math.round(Number(row[idx.p50] ?? 0)),
          p95ms: Math.round(Number(row[idx.p95] ?? 0)),
          lastSeen: ls ? new Date(ls).toISOString() : null,
        };
      }
    }
    const timeseries: Array<{ ts: string; name: string; count: number }> = [];
    if (tsRes.status === LogsQueryResultStatus.Success && tsRes.tables[0]) {
      const t = tsRes.tables[0];
      const idx = Object.fromEntries(t.columnDescriptors.map((c, i) => [c.name, i])) as Record<string, number>;
      for (const row of t.rows) {
        timeseries.push({
          ts: new Date(row[idx.TimeGenerated] as Date).toISOString(),
          name: String(row[idx.Name] ?? ''),
          count: Number(row[idx.count_] ?? 0),
        });
      }
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { windowHours: 24, summary, timeseries, generatedAt: new Date().toISOString() },
    };
  } catch (e) {
    ctx.error('rt-metrics query failed', e);
    return { status: 500, jsonBody: { error: 'rt_metrics_query_failed', detail: (e as Error)?.message } };
  }
}

// Distinct routes from realtime/{channel} (different segment counts)
app.http('rt-listeners', { route: 'realtime/ops/listeners', methods: ['GET'], authLevel: 'function', handler: listeners });
app.http('rt-metrics',   { route: 'realtime/ops/metrics',   methods: ['GET'], authLevel: 'function', handler: metrics });
