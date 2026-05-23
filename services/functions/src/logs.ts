import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query';
import { DefaultAzureCredential } from '@azure/identity';
import { guard } from './auth.js';

type LogEvent = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  source: 'apim' | 'dab' | 'functions' | 'postgres' | 'sentinel' | 'wps';
  tenant?: string;
  msg: string;
};

const WORKSPACE_ID = process.env.LAW_WORKSPACE_ID!;
const client = new LogsQueryClient(new DefaultAzureCredential());

// Pull the 100 most-recent events across the platform.
// Each source contributes its own table; we union them with a normalised shape.
const KQL = `
let take_n = 100;
let fn = AppRequests
  | where TimeGenerated > ago(1h)
  | take take_n
  | project ts=TimeGenerated, level=iff(Success == true, 'info', 'error'),
            source='functions', tenant=tostring(''), msg=strcat(Name, ' ', tostring(ResultCode), ' in ', tostring(toint(DurationMs)), 'ms');
let pg = AzureDiagnostics
  | where ResourceProvider == 'MICROSOFT.DBFORPOSTGRESQL'
  | take take_n
  | project ts=TimeGenerated, level=iff(Category == 'PostgreSQLLogs' and Message has 'ERROR', 'error', 'info'),
            source='postgres', tenant=tostring(''), msg=tostring(Message);
let wps = AzureDiagnostics
  | where ResourceProvider == 'MICROSOFT.SIGNALRSERVICE' or ResourceProvider == 'MICROSOFT.WEBPUBSUB'
  | take take_n
  | project ts=TimeGenerated, level='info', source='wps', tenant=tostring(''),
            msg=strcat(OperationName, ' ', Category);
let sent = SecurityAlert
  | take take_n
  | project ts=TimeGenerated, level=iff(Severity == 'High' or Severity == 'Critical', 'error', 'warn'),
            source='sentinel', tenant=tostring(''), msg=AlertName;
union isfuzzy=true fn, pg, wps, sent
| order by ts desc
| take 200
`;

export async function logs(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:read'); if (!g.ok) return g.response;
  if (!WORKSPACE_ID) {
    return { status: 500, jsonBody: { error: 'LAW_WORKSPACE_ID not configured' } };
  }
  try {
    const r = await client.queryWorkspace(WORKSPACE_ID, KQL, { duration: 'PT1H' });
    if (r.status !== LogsQueryResultStatus.Success) {
      return { status: 200, jsonBody: [] satisfies LogEvent[] };
    }
    const table = r.tables[0];
    if (!table) return { status: 200, jsonBody: [] satisfies LogEvent[] };
    const idx = Object.fromEntries(table.columnDescriptors.map((c, i) => [c.name, i])) as Record<string, number>;
    const out: LogEvent[] = table.rows.map(row => {
      const ts = row[idx.ts] as Date;
      return {
        ts: ts ? new Date(ts).toISOString().slice(11, 23) : '',
        level: (row[idx.level] as LogEvent['level']) ?? 'info',
        source: (row[idx.source] as LogEvent['source']) ?? 'functions',
        tenant: (row[idx.tenant] as string) || undefined,
        msg: String(row[idx.msg] ?? ''),
      };
    });
    return { status: 200, headers: { 'Cache-Control': 'no-store' }, jsonBody: out };
  } catch (e: unknown) {
    ctx.error('logs query failed', e);
    return { status: 500, jsonBody: { error: 'logs_query_failed', detail: (e as Error)?.message } };
  }
}

app.http('logs', {
  route: 'logs',
  methods: ['GET'],
  authLevel: 'function',
  handler: logs,
});
