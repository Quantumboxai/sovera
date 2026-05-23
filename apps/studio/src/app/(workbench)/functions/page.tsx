'use client';

import { useEffect, useMemo, useState } from 'react';
import { H1, Card, CardTitle, Badge } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Zap, CheckCircle2, AlertTriangle, Lock, Activity, RefreshCw } from 'lucide-react';

type Platform = {
  region: string; resourceGroup: string; functionApp: string;
  pgHost: string; runtime: string; plan: string;
};

type Fn = { name: string; method: string; route: string; scope: string | null; desc: string; group: string };
type FnStat = { name: string; count: number; errors: number; successRate: number; p50ms: number; p95ms: number; lastSeen: string | null };
type Failure = { ts: string; name: string; resultCode: string; durationMs: number; operationId: string | null };
type Metrics = { windowHours: number; stats: FnStat[]; failures: Failure[]; generatedAt: string };

// Source of truth: services/functions/src/*.ts (every app.http registration).
const FUNCTIONS: Fn[] = [
  // Database
  { name: 'tables',          method: 'GET',    route: '/api/tables',                 scope: 'db:read',         desc: 'List Postgres tables + columns + RLS policies', group: 'Database' },
  { name: 'tables-create',   method: 'POST',   route: '/api/tables',                 scope: 'db:write',        desc: 'Create a new table (DDL allowlist)',            group: 'Database' },
  { name: 'tenants',         method: 'GET',    route: '/api/tenants',                scope: 'db:read',         desc: 'List customer tenants from sovera.tenants',     group: 'Database' },
  { name: 'logs',            method: 'GET',    route: '/api/logs',                   scope: 'db:read',         desc: 'KQL across AppRequests / AzureDiagnostics',     group: 'Database' },
  { name: 'sql',             method: 'POST',   route: '/api/sql',                    scope: 'db:read',         desc: 'Read-only SELECT / WITH gateway, 8s timeout',   group: 'Database' },
  { name: 'seed-demo',       method: 'POST',   route: '/api/seed-demo',              scope: 'db:write',        desc: 'Seed app.patients (15 rows)',                   group: 'Database' },
  // Vector / AI
  { name: 'embed',           method: 'POST',   route: '/api/embed',                  scope: 'embed:write',     desc: 'Embed text via Azure OpenAI → pgvector',        group: 'Vector / AI' },
  { name: 'embed-search',    method: 'POST',   route: '/api/search',                 scope: 'search',          desc: 'Semantic search over pgvector',                 group: 'Vector / AI' },
  { name: 'embed-stats',     method: 'GET',    route: '/api/embed/stats',            scope: 'embed:read',      desc: 'Vector store stats (count, dims, last ingest)', group: 'Vector / AI' },
  // Storage
  { name: 'blob-containers-list',   method: 'GET',    route: '/api/blob/containers',                scope: 'blob:read',  desc: 'List containers',                       group: 'Storage' },
  { name: 'blob-containers-create', method: 'POST',   route: '/api/blob/containers',                scope: 'blob:write', desc: 'Create container',                      group: 'Storage' },
  { name: 'blob-list',              method: 'GET',    route: '/api/blob/{container}',               scope: 'blob:read',  desc: 'List blobs in container',               group: 'Storage' },
  { name: 'blob-sas-upload',        method: 'GET',    route: '/api/blob/{container}/sas/upload',    scope: 'blob:write', desc: '15-min user-delegation SAS for upload', group: 'Storage' },
  { name: 'blob-sas-download',      method: 'GET',    route: '/api/blob/{container}/sas/download',  scope: 'blob:read',  desc: '10-min user-delegation SAS for download', group: 'Storage' },
  { name: 'blob-delete',            method: 'DELETE', route: '/api/blob/{container}',               scope: 'blob:write', desc: 'Delete a blob',                         group: 'Storage' },
  // API Keys
  { name: 'keys-list',       method: 'GET',    route: '/api/keys',                   scope: 'keys:read',       desc: 'List API keys (hashed at rest)',                group: 'API Keys' },
  { name: 'keys-create',     method: 'POST',   route: '/api/keys',                   scope: 'keys:write',      desc: 'Mint new API key (scoped at creation)',         group: 'API Keys' },
  { name: 'keys-revoke',     method: 'DELETE', route: '/api/keys/{id}',              scope: 'keys:write',      desc: 'Revoke an API key',                             group: 'API Keys' },
  { name: 'scopes',          method: 'GET',    route: '/api/scopes',                 scope: null,              desc: 'Public scope catalog used by the key picker',   group: 'API Keys' },
  // RBAC
  { name: 'rbac-list',       method: 'GET',    route: '/api/rbac',                   scope: 'rbac:read',       desc: 'List role assignments',                         group: 'RBAC' },
  { name: 'rbac-create',     method: 'POST',   route: '/api/rbac',                   scope: 'rbac:write',      desc: 'Assign a role to an identity',                  group: 'RBAC' },
  { name: 'rbac-delete',     method: 'DELETE', route: '/api/rbac/{id}',              scope: 'rbac:write',      desc: 'Remove a role assignment',                      group: 'RBAC' },
  { name: 'rbac-me',         method: 'GET',    route: '/api/rbac/me',                scope: null,              desc: 'Returns the current caller (auth probe)',       group: 'RBAC' },
  // Realtime
  { name: 'rt-publish',      method: 'POST',   route: '/api/realtime/publish',       scope: 'realtime:publish',   desc: 'Publish a channel event (Postgres NOTIFY)',  group: 'Realtime' },
  { name: 'rt-subscribe',    method: 'GET',    route: '/api/realtime/{channel}',     scope: 'realtime:subscribe', desc: 'Web PubSub negotiate URL for a channel',     group: 'Realtime' },
  // Compliance
  { name: 'compliance',      method: 'GET',    route: '/api/compliance',             scope: 'compliance:read', desc: 'Live posture: Policy + Defender + Key Vault',   group: 'Compliance' },
  // Misc
  { name: 'platform',        method: 'GET',    route: '/api/platform',               scope: null,              desc: 'Deployment facts (region, RG, plan, db host)',  group: 'Misc' },
  { name: 'upload-url',      method: 'GET',    route: '/api/storage/upload-url',     scope: 'blob:write',      desc: 'Legacy SAS issuer (kept for back-compat)',      group: 'Misc' },
];

const GROUP_ORDER = ['Database','Vector / AI','Storage','API Keys','RBAC','Realtime','Compliance','Misc'];

export default function FunctionsPage() {
  const [p, setP] = useState<Platform | null>(null);
  const [health, setHealth] = useState<'ok' | 'degraded' | 'down' | 'checking'>('checking');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/platform').then(r => r.ok ? r.json() : null).then(setP).catch(() => {});
  }, []);

  async function runHealth() {
    setHealth('checking');
    const probes = await Promise.all([
      fetch('/api/scopes').then(r => r.ok).catch(() => false),
      fetch('/api/platform').then(r => r.ok).catch(() => false),
    ]);
    const ok = probes.filter(Boolean).length;
    setHealth(ok === 2 ? 'ok' : ok === 1 ? 'degraded' : 'down');
    setCheckedAt(new Date().toLocaleTimeString());
  }

  async function loadMetrics() {
    setMetricsLoading(true); setMetricsErr(null);
    try {
      const r = await fetch('/api/functions/metrics', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMetrics(await r.json());
    } catch (e) { setMetricsErr((e as Error).message); }
    finally { setMetricsLoading(false); }
  }

  useEffect(() => { runHealth(); loadMetrics(); }, []);

  const statByName = useMemo(() => {
    const m = new Map<string, FnStat>();
    metrics?.stats.forEach(s => m.set(s.name, s));
    return m;
  }, [metrics]);

  const totals = useMemo(() => {
    if (!metrics) return null;
    const c = metrics.stats.reduce((a, s) => a + s.count, 0);
    const e = metrics.stats.reduce((a, s) => a + s.errors, 0);
    return { calls: c, errors: e, errorRate: c > 0 ? e / c : 0 };
  }, [metrics]);

  const grouped: Record<string, Fn[]> = {};
  for (const f of FUNCTIONS) { (grouped[f.group] ??= []).push(f); }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Project</span><span>/</span><span className="text-(--color-ink-dim)">Functions</span>
          <ComplianceBadge code="HDS §5.3.1" label="Serverless compute, managed identity" />
          {health === 'ok' && <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)"><span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live</span>}
          {health === 'degraded' && <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-warn)/20 text-(--color-warn)"><AlertTriangle className="h-3 w-3" /> degraded</span>}
          {health === 'down' && <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-bad)/20 text-(--color-bad)"><AlertTriangle className="h-3 w-3" /> down</span>}
          {health === 'checking' && <span className="ml-2 text-[10px] text-(--color-ink-mute)">checking…</span>}
        </div>
        <H1>Functions</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">HTTP triggers backing the Studio and your <code className="font-mono text-(--color-ink)">/api/*</code> surface. Linux Flex Consumption, Node 20, managed identity → Postgres / Storage / OpenAI / Web PubSub. Every gated endpoint enforces the scope shown below.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardTitle>Function app</CardTitle><div className="mt-1 text-[13px] font-mono text-(--color-ink) truncate">{p?.functionApp ?? '…'}</div></Card>
        <Card><CardTitle>Region</CardTitle><div className="mt-1 text-[13px] text-(--color-ink)">{p?.region ?? '…'}</div></Card>
        <Card><CardTitle>Triggers</CardTitle><div className="mt-1 text-[13px] text-(--color-ink)">{FUNCTIONS.length} HTTP</div></Card>
        <Card><CardTitle>Calls (24h)</CardTitle><div className="mt-1 text-[14px] text-(--color-ink) font-mono">{totals ? totals.calls.toLocaleString() : '…'}</div></Card>
        <Card><CardTitle>Error rate (24h)</CardTitle><div className={'mt-1 text-[14px] font-mono ' + (totals && totals.errorRate > 0.01 ? 'text-(--color-bad)' : 'text-(--color-good)')}>{totals ? (totals.errorRate * 100).toFixed(2) + '%' : '…'}</div></Card>
      </div>

      {GROUP_ORDER.filter(g => grouped[g]).map(group => (
        <Card key={group} className="!p-0">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <CardTitle>{group} <span className="text-(--color-ink-mute) font-normal">({grouped[group].length})</span></CardTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                  <th className="text-left px-5 py-2 font-normal">Name</th>
                  <th className="text-left px-5 py-2 font-normal">Method</th>
                  <th className="text-left px-5 py-2 font-normal">Route</th>
                  <th className="text-left px-5 py-2 font-normal">Scope</th>
                  <th className="text-right px-5 py-2 font-normal">Calls 24h</th>
                  <th className="text-right px-5 py-2 font-normal">Errors</th>
                  <th className="text-right px-5 py-2 font-normal">p95</th>
                  <th className="text-left px-5 py-2 font-normal">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-line)">
                {grouped[group].map(f => {
                  const s = statByName.get(f.name);
                  const er = s && s.count > 0 ? s.errors / s.count : 0;
                  return (
                    <tr key={f.name + f.method} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-2.5 text-(--color-ink) font-medium">
                        <span className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-(--color-violet)" />{f.name}
                        </span>
                        <span className="block text-[10px] text-(--color-ink-mute) mt-0.5 ml-5">{f.desc}</span>
                      </td>
                      <td className="px-5 py-2.5"><Badge tone={f.method === 'GET' ? 'cyan' : f.method === 'DELETE' ? 'warn' : 'violet'}>{f.method}</Badge></td>
                      <td className="px-5 py-2.5 font-mono text-[12px] text-(--color-ink-dim)">{f.route}</td>
                      <td className="px-5 py-2.5">
                        {f.scope
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-(--color-ink-dim)"><Lock className="h-2.5 w-2.5" />{f.scope}</span>
                          : <span className="text-[10px] text-(--color-ink-mute)">open</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-[12px] text-(--color-ink-dim)">{s ? s.count.toLocaleString() : '—'}</td>
                      <td className={'px-5 py-2.5 text-right font-mono text-[12px] ' + (s && s.errors > 0 ? 'text-(--color-bad)' : 'text-(--color-ink-mute)')}>
                        {s ? (s.errors > 0 ? `${s.errors} (${(er * 100).toFixed(1)}%)` : '0') : '—'}
                      </td>
                      <td className={'px-5 py-2.5 text-right font-mono text-[12px] ' + (s && s.p95ms > 1000 ? 'text-(--color-warn)' : 'text-(--color-ink-dim)')}>
                        {s ? `${s.p95ms}ms` : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-[11px] text-(--color-ink-mute) font-mono">
                        {s?.lastSeen ? new Date(s.lastSeen).toLocaleTimeString() : 'never'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <Card>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Recent failures (24h)</span>
          <button onClick={loadMetrics} className="text-[11px] text-(--color-ink-mute) hover:text-(--color-ink) flex items-center gap-1">
            <RefreshCw className={'h-3 w-3 ' + (metricsLoading ? 'animate-spin' : '')} /> refresh
          </button>
        </CardTitle>
        {metricsErr && <div className="mt-2 text-[12px] text-(--color-bad) flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {metricsErr}</div>}
        {metrics && metrics.failures.length === 0 && <div className="mt-2 text-[12px] text-(--color-good) flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Zero failures in the last 24h.</div>}
        {metrics && metrics.failures.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                  <th className="text-left px-3 py-2 font-normal">When</th>
                  <th className="text-left px-3 py-2 font-normal">Function</th>
                  <th className="text-left px-3 py-2 font-normal">Status</th>
                  <th className="text-right px-3 py-2 font-normal">Duration</th>
                  <th className="text-left px-3 py-2 font-normal">Operation ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-line)">
                {metrics.failures.map((f, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-[11px] text-(--color-ink-mute)">{new Date(f.ts).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 text-(--color-ink)">{f.name}</td>
                    <td className="px-3 py-2"><Badge tone="bad">{f.resultCode}</Badge></td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-(--color-ink-dim)">{Math.round(f.durationMs)}ms</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-(--color-ink-mute) truncate max-w-[180px]">{f.operationId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-(--color-ink-mute)">Source: App Insights · AppRequests · last 24h. Backed by KQL query against Log Analytics workspace.</p>
      </Card>

      <Card>
        <CardTitle className="flex items-center justify-between">
          <span>Health check</span>
          <button onClick={runHealth} className="text-[11px] text-(--color-ink-mute) hover:text-(--color-ink)">re-run</button>
        </CardTitle>
        <div className="mt-2 text-[12px] text-(--color-ink-dim)">
          {health === 'ok' && <span className="inline-flex items-center gap-1 text-(--color-good)"><CheckCircle2 className="h-3.5 w-3.5" /> Both probes returned 200 — host is healthy and Easy Auth is forwarding.</span>}
          {health === 'degraded' && <span className="inline-flex items-center gap-1 text-(--color-warn)"><AlertTriangle className="h-3.5 w-3.5" /> One probe failed — host is up but some routes are not loading.</span>}
          {health === 'down' && <span className="inline-flex items-center gap-1 text-(--color-bad)"><AlertTriangle className="h-3.5 w-3.5" /> Host is not responding.</span>}
          {checkedAt && <span className="ml-2 text-(--color-ink-mute)">last checked {checkedAt}</span>}
        </div>
        <p className="mt-3 text-[12px] text-(--color-ink-mute)">Authentication precedence: <code className="font-mono text-(--color-ink)">Easy Auth</code> session (Studio user → all scopes) &gt; <code className="font-mono text-(--color-ink)">Authorization: Bearer sov_live_…</code> (API key → scopes from DB). Host-level function key is required by the platform but is never used by Studio.</p>
      </Card>
    </div>
  );
}
