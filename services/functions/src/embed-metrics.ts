// Embed/Search call metrics from App Insights (Log Analytics workspace).
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query';
import { DefaultAzureCredential } from '@azure/identity';
import { guard } from './auth.js';

const WORKSPACE_ID = process.env.LAW_WORKSPACE_ID!;
const logs = new LogsQueryClient(new DefaultAzureCredential());

const KQL = `
AppRequests
| where TimeGenerated > ago(24h)
| where Name in ('embed','embed-search','embed-stats','embed-delete','embed-bulk-del')
| summarize
    count_ = count(),
    errors = countif(Success == false),
    p50 = percentile(DurationMs, 50),
    p95 = percentile(DurationMs, 95),
    lastSeen = max(TimeGenerated)
  by Name
`;

export async function embedMetrics(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'embed:read'); if (!g.ok) return g.response;
  if (!WORKSPACE_ID) return { status: 500, jsonBody: { error: 'LAW_WORKSPACE_ID_missing' } };
  try {
    const res = await logs.queryWorkspace(WORKSPACE_ID, KQL, { duration: 'P1D' });
    const out: Record<string, { count: number; errors: number; p50ms: number; p95ms: number; lastSeen: string | null }> = {};
    if (res.status === LogsQueryResultStatus.Success && res.tables[0]) {
      const t = res.tables[0];
      const idx = Object.fromEntries(t.columnDescriptors.map((c, i) => [c.name, i])) as Record<string, number>;
      for (const row of t.rows) {
        const name = String(row[idx.Name] ?? '');
        const ls = row[idx.lastSeen] as Date | null;
        out[name] = {
          count: Number(row[idx.count_] ?? 0),
          errors: Number(row[idx.errors] ?? 0),
          p50ms: Math.round(Number(row[idx.p50] ?? 0)),
          p95ms: Math.round(Number(row[idx.p95] ?? 0)),
          lastSeen: ls ? new Date(ls).toISOString() : null,
        };
      }
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { windowHours: 24, byName: out, generatedAt: new Date().toISOString() },
    };
  } catch (e) {
    ctx.error('embed-metrics query failed', e);
    return { status: 500, jsonBody: { error: 'embed_metrics_query_failed', detail: (e as Error)?.message } };
  }
}

app.http('embed-metrics', { route: 'embed/metrics', methods: ['GET'], authLevel: 'function', handler: embedMetrics });
