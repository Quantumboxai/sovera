// Per-function metrics + recent failures from App Insights (via Log Analytics workspace).
// Powers the Functions ops page.
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query';
import { DefaultAzureCredential } from '@azure/identity';
import { guard } from './auth.js';

const WORKSPACE_ID = process.env.LAW_WORKSPACE_ID!;
const client = new LogsQueryClient(new DefaultAzureCredential());

type FnStat = {
  name: string;
  count: number;
  errors: number;
  successRate: number;   // 0..1
  p50ms: number;
  p95ms: number;
  lastSeen: string | null;
};

type Failure = {
  ts: string;
  name: string;
  resultCode: string;
  durationMs: number;
  operationId: string | null;
};

const STATS_KQL = `
AppRequests
| where TimeGenerated > ago(24h)
| where AppRoleName has 'sovera-fn' or cloud_RoleName has 'sovera-fn' or OperationName != ''
| summarize
    count_ = count(),
    errors = countif(Success == false),
    p50 = percentile(DurationMs, 50),
    p95 = percentile(DurationMs, 95),
    lastSeen = max(TimeGenerated)
  by Name
| order by count_ desc
| take 100
`;

const FAILURES_KQL = `
AppRequests
| where TimeGenerated > ago(24h)
| where Success == false
| project ts=TimeGenerated, name=Name, resultCode=ResultCode, durationMs=DurationMs, opId=OperationId
| order by ts desc
| take 25
`;

export async function fnMetrics(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:read'); if (!g.ok) return g.response;
  if (!WORKSPACE_ID) return { status: 500, jsonBody: { error: 'LAW_WORKSPACE_ID_missing' } };

  try {
    const [statsRes, failRes] = await Promise.all([
      client.queryWorkspace(WORKSPACE_ID, STATS_KQL, { duration: 'P1D' }),
      client.queryWorkspace(WORKSPACE_ID, FAILURES_KQL, { duration: 'P1D' }),
    ]);

    const stats: FnStat[] = [];
    if (statsRes.status === LogsQueryResultStatus.Success && statsRes.tables[0]) {
      const t = statsRes.tables[0];
      const idx = Object.fromEntries(t.columnDescriptors.map((c, i) => [c.name, i])) as Record<string, number>;
      for (const row of t.rows) {
        const count_ = Number(row[idx.count_] ?? 0);
        const errors = Number(row[idx.errors] ?? 0);
        const ls = row[idx.lastSeen] as Date | null;
        stats.push({
          name: String(row[idx.Name] ?? ''),
          count: count_,
          errors,
          successRate: count_ > 0 ? 1 - errors / count_ : 1,
          p50ms: Math.round(Number(row[idx.p50] ?? 0)),
          p95ms: Math.round(Number(row[idx.p95] ?? 0)),
          lastSeen: ls ? new Date(ls).toISOString() : null,
        });
      }
    }

    const failures: Failure[] = [];
    if (failRes.status === LogsQueryResultStatus.Success && failRes.tables[0]) {
      const t = failRes.tables[0];
      const idx = Object.fromEntries(t.columnDescriptors.map((c, i) => [c.name, i])) as Record<string, number>;
      for (const row of t.rows) {
        failures.push({
          ts: new Date(row[idx.ts] as Date).toISOString(),
          name: String(row[idx.name] ?? ''),
          resultCode: String(row[idx.resultCode] ?? ''),
          durationMs: Math.round(Number(row[idx.durationMs] ?? 0)),
          operationId: (row[idx.opId] as string) || null,
        });
      }
    }

    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { windowHours: 24, stats, failures, generatedAt: new Date().toISOString() },
    };
  } catch (e) {
    ctx.error('fn-metrics query failed', e);
    return { status: 500, jsonBody: { error: 'metrics_query_failed', detail: (e as Error)?.message } };
  }
}

app.http('fn-metrics', {
  route: 'functions/metrics',
  methods: ['GET'],
  authLevel: 'function',
  handler: fnMetrics,
});
