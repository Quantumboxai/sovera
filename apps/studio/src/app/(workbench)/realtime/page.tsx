'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Zap, Send, AlertTriangle, Pause, Play, Activity, RefreshCw, Users, Wand2, Copy, Check } from 'lucide-react';

type Event = { at: string; payload: unknown };

type ListenerSession = { pid: number; user: string; app: string; client: string | null; state: string; since: string };
type ListenerChannel = { channel: string; count: number; sessions: ListenerSession[] };
type ListenersResp = { total: number; channels: ListenerChannel[]; generatedAt: string };

type MetricSummary = { count: number; errors: number; p50ms: number; p95ms: number; lastSeen: string | null };
type MetricsResp = {
  windowHours: number;
  summary: Record<string, MetricSummary>;
  timeseries: Array<{ ts: string; name: string; count: number }>;
  generatedAt: string;
};

type Column = { name: string; type: string; nullable: boolean; pk?: boolean };
type TableInfo = { schema: string; name: string; columns: Column[] };

export default function RealtimePage() {
  const [channel, setChannel] = useState('demo');
  const [active, setActive] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [payload, setPayload] = useState('{"hello":"world","at":"now"}');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const stopRef = useRef(false);

  const [listeners, setListeners] = useState<ListenersResp | null>(null);
  const [listenersErr, setListenersErr] = useState<string | null>(null);
  const [listenersLoading, setListenersLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsResp | null>(null);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [genTable, setGenTable] = useState<string>('');
  const [genEvent, setGenEvent] = useState<'INSERT' | 'UPDATE' | 'DELETE'>('INSERT');
  const [genChannel, setGenChannel] = useState('table_changes');
  const [genCopied, setGenCopied] = useState(false);

  useEffect(() => {
    if (!active) { stopRef.current = true; return; }
    stopRef.current = false;
    (async () => {
      while (!stopRef.current) {
        try {
          const r = await fetch(`/api/realtime/${encodeURIComponent(channel)}`, { cache: 'no-store' });
          if (!r.ok) {
            setErr(`subscribe failed: HTTP ${r.status}`);
            await new Promise(res => setTimeout(res, 3000));
            continue;
          }
          const j = await r.json();
          if (j.events?.length) setEvents(prev => [...j.events, ...prev].slice(0, 200));
          setErr(null);
        } catch (e) {
          setErr((e as Error).message);
          await new Promise(res => setTimeout(res, 3000));
        }
      }
    })();
    return () => { stopRef.current = true; };
  }, [active, channel]);

  async function loadListeners() {
    setListenersLoading(true); setListenersErr(null);
    try {
      const r = await fetch('/api/realtime/ops/listeners', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setListeners(j);
    } catch (e) { setListenersErr((e as Error).message); }
    finally { setListenersLoading(false); }
  }

  async function loadMetrics() {
    setMetricsLoading(true); setMetricsErr(null);
    try {
      const r = await fetch('/api/realtime/ops/metrics', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMetrics(j);
    } catch (e) { setMetricsErr((e as Error).message); }
    finally { setMetricsLoading(false); }
  }

  async function loadTables() {
    try {
      const r = await fetch('/api/tables', { cache: 'no-store' });
      if (!r.ok) return;
      const j: TableInfo[] = await r.json();
      const filtered = j.filter(t => t.schema !== 'pg_catalog' && t.schema !== 'information_schema' && t.columns.length > 0);
      setTables(filtered);
      setGenTable(prev => prev || (filtered[0] ? `${filtered[0].schema}.${filtered[0].name}` : ''));
    } catch { /* silent */ }
  }

  useEffect(() => {
    loadListeners();
    loadMetrics();
    loadTables();
    const id = setInterval(() => { loadListeners(); loadMetrics(); }, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    setSending(true); setErr(null);
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(payload); } catch { parsed = payload; }
      const r = await fetch('/api/realtime/publish', { method: 'POST', body: JSON.stringify({ channel, payload: parsed }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setSending(false); }
  }

  const selectedTable = useMemo(() => tables.find(t => `${t.schema}.${t.name}` === genTable), [tables, genTable]);
  const triggerSql = useMemo(() => {
    if (!selectedTable) return '-- pick a table';
    const fqn = `"${selectedTable.schema}"."${selectedTable.name}"`;
    const fnName = `notify_${selectedTable.name}_${genEvent.toLowerCase()}`;
    const trgName = `${selectedTable.name}_${genEvent.toLowerCase()}_notify`;
    const rowAlias = genEvent === 'DELETE' ? 'OLD' : 'NEW';
    const safeChan = genChannel.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'table_changes';
    const testStmt = genEvent === 'INSERT' ? `insert into ${fqn} (...) values (...);`
      : genEvent === 'UPDATE' ? `update ${fqn} set ... where id = '...';`
      : `delete from ${fqn} where id = '...';`;
    return `-- Auto-generated by Sovera Studio
create or replace function ${fnName}() returns trigger
language plpgsql as $$
begin
  perform pg_notify(
    '${safeChan}',
    json_build_object(
      'event', '${genEvent}',
      'schema', '${selectedTable.schema}',
      'table',  '${selectedTable.name}',
      'at',     now(),
      'row',    row_to_json(${rowAlias})
    )::text
  );
  return ${rowAlias};
end $$;

drop trigger if exists ${trgName} on ${fqn};
create trigger ${trgName}
after ${genEvent.toLowerCase()} on ${fqn}
for each row execute function ${fnName}();

-- Test it:
-- ${testStmt}`;
  }, [selectedTable, genEvent, genChannel]);

  async function copyTrigger() {
    await navigator.clipboard.writeText(triggerSql);
    setGenCopied(true);
    setTimeout(() => setGenCopied(false), 1500);
  }

  const pubStat = metrics?.summary['rt-publish'];
  const subStat = metrics?.summary['rt-subscribe'];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Project</span><span>/</span><span className="text-(--color-ink-dim)">Realtime</span>
          <ComplianceBadge code="Live" label="Postgres LISTEN/NOTIFY" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>Realtime</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">Publish and subscribe to events using native Postgres <code className="font-mono text-(--color-ink)">pg_notify</code>. No extra broker, no extra bill.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Publishes (24h)</div>
          <div className="text-[22px] font-semibold text-(--color-ink) mt-1">{pubStat ? pubStat.count.toLocaleString() : '—'}</div>
          <div className="text-[11px] text-(--color-ink-mute) mt-0.5">{pubStat ? `${pubStat.errors} errors · p95 ${pubStat.p95ms}ms` : 'no data yet'}</div>
        </Card>
        <Card><div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Subscribes (24h)</div>
          <div className="text-[22px] font-semibold text-(--color-ink) mt-1">{subStat ? subStat.count.toLocaleString() : '—'}</div>
          <div className="text-[11px] text-(--color-ink-mute) mt-0.5">{subStat ? `${subStat.errors} errors · p95 ${Math.round(subStat.p95ms / 1000)}s` : 'no data yet'}</div>
        </Card>
        <Card><div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Active listeners</div>
          <div className="text-[22px] font-semibold text-(--color-ink) mt-1">{listeners ? listeners.total : '—'}</div>
          <div className="text-[11px] text-(--color-ink-mute) mt-0.5">{listeners ? `${listeners.channels.length} channels` : 'querying…'}</div>
        </Card>
        <Card><div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Transport</div>
          <div className="text-[14px] font-medium text-(--color-ink) mt-2">Postgres LISTEN/NOTIFY</div>
          <div className="text-[11px] text-(--color-ink-mute) mt-0.5">long-poll · 28s window</div>
        </Card>
      </div>

      {err && <Card className="border-(--color-bad)/40"><div className="flex items-center gap-2 text-[12px] text-(--color-bad)"><AlertTriangle className="h-3.5 w-3.5" /> {err}</div></Card>}

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-5">
          <CardTitle>Channel</CardTitle>
          <div className="mt-3 flex items-center gap-2">
            <input value={channel} onChange={e => setChannel(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} disabled={active}
              placeholder="demo" maxLength={40}
              className="flex-1 bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan) disabled:opacity-50" />
            <Button variant={active ? 'ghost' : 'brand'} onClick={() => setActive(!active)}>
              {active ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Subscribe</>}
            </Button>
          </div>
          <div className="mt-2 text-[11px] text-(--color-ink-mute)">{active ? <span className="text-(--color-good)">● listening on {channel}</span> : 'paused'}</div>

          <div className="mt-5">
            <CardTitle>Publish</CardTitle>
            <textarea value={payload} onChange={e => setPayload(e.target.value)} rows={4}
              className="mt-2 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[12px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-(--color-ink-mute)">JSON or plain text · max 7KB</span>
              <Button variant="brand" onClick={send} disabled={sending}><Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send'}</Button>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-7 !p-0">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <CardTitle><Zap className="h-3.5 w-3.5 inline" /> Events ({events.length})</CardTitle>
            <Button variant="ghost" onClick={() => setEvents([])}>Clear</Button>
          </div>
          {events.length === 0 ? (
            <div className="px-5 py-12 text-center text-[13px] text-(--color-ink-mute)">
              {active ? 'Waiting for events… try publishing from the panel.' : 'Subscribe to a channel to see events.'}
            </div>
          ) : (
            <ul className="divide-y divide-(--color-line) max-h-96 overflow-y-auto">
              {events.map((e, i) => (
                <li key={i} className="px-5 py-2.5 hover:bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone="violet">{new Date(e.at).toLocaleTimeString()}</Badge>
                  </div>
                  <pre className="text-[11px] font-mono text-(--color-ink-dim) whitespace-pre-wrap break-all">{typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload, null, 2)}</pre>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Active listeners</span>
          <button onClick={loadListeners} className="text-[11px] text-(--color-ink-mute) hover:text-(--color-ink) flex items-center gap-1">
            <RefreshCw className={'h-3 w-3 ' + (listenersLoading ? 'animate-spin' : '')} /> refresh
          </button>
        </CardTitle>
        {listenersErr && <div className="mt-2 text-[12px] text-(--color-bad) flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {listenersErr}</div>}
        {listeners && listeners.total === 0 && <div className="mt-3 text-[12px] text-(--color-ink-mute)">No sessions are currently LISTENing. Subscribe from the panel above to see one appear.</div>}
        {listeners && listeners.total > 0 && (
          <div className="mt-3 space-y-3">
            {listeners.channels.map(ch => (
              <div key={ch.channel} className="border border-(--color-line) rounded-md">
                <div className="px-3 py-2 border-b border-(--color-line) flex items-center justify-between bg-white/[0.02]">
                  <span className="font-mono text-[12px] text-(--color-ink)">{ch.channel}</span>
                  <Badge tone="cyan">{ch.count} session{ch.count === 1 ? '' : 's'}</Badge>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-b border-(--color-line)">
                      <th className="text-left px-3 py-1.5 font-normal">PID</th>
                      <th className="text-left px-3 py-1.5 font-normal">User</th>
                      <th className="text-left px-3 py-1.5 font-normal">App</th>
                      <th className="text-left px-3 py-1.5 font-normal">Client</th>
                      <th className="text-left px-3 py-1.5 font-normal">State</th>
                      <th className="text-left px-3 py-1.5 font-normal">Since</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-line)">
                    {ch.sessions.map(s => (
                      <tr key={s.pid}>
                        <td className="px-3 py-1.5 font-mono text-(--color-ink-dim)">{s.pid}</td>
                        <td className="px-3 py-1.5 text-(--color-ink-dim)">{s.user}</td>
                        <td className="px-3 py-1.5 text-(--color-ink-mute)">{s.app || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-(--color-ink-mute)">{s.client ?? 'local'}</td>
                        <td className="px-3 py-1.5"><Badge tone={s.state === 'idle' ? 'cyan' : 'violet'}>{s.state}</Badge></td>
                        <td className="px-3 py-1.5 text-[11px] text-(--color-ink-mute)">{new Date(s.since).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-(--color-ink-mute)">Source: <code className="font-mono">pg_stat_activity</code> · refreshed every 30s</p>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2"><Wand2 className="h-3.5 w-3.5" /> Database trigger generator</CardTitle>
        <p className="mt-1 text-[12px] text-(--color-ink-mute)">Wire a table change directly to a realtime channel. Pick a table and event — copy the SQL into the SQL editor.</p>
        <div className="mt-3 grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-5">
            <label className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) block mb-1">Table</label>
            <select value={genTable} onChange={e => setGenTable(e.target.value)}
              className="w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)">
              {tables.length === 0 && <option value="">(loading tables…)</option>}
              {tables.map(t => <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>{t.schema}.{t.name}</option>)}
            </select>
          </div>
          <div className="col-span-6 md:col-span-3">
            <label className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) block mb-1">Event</label>
            <select value={genEvent} onChange={e => setGenEvent(e.target.value as 'INSERT' | 'UPDATE' | 'DELETE')}
              className="w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)">
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div className="col-span-6 md:col-span-4">
            <label className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) block mb-1">Channel</label>
            <input value={genChannel} onChange={e => setGenChannel(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="table_changes" maxLength={40}
              className="w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
          </div>
        </div>
        <div className="mt-3 relative">
          <pre className="text-[12px] font-mono text-(--color-ink-dim) bg-black/30 border border-(--color-line) rounded-md p-3 overflow-x-auto max-h-80 overflow-y-auto">{triggerSql}</pre>
          <button onClick={copyTrigger} className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-(--color-violet)/20 hover:bg-(--color-violet)/30 text-(--color-violet) border border-(--color-violet)/40">
            {genCopied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Metrics source</span>
          <button onClick={loadMetrics} className="text-[11px] text-(--color-ink-mute) hover:text-(--color-ink) flex items-center gap-1">
            <RefreshCw className={'h-3 w-3 ' + (metricsLoading ? 'animate-spin' : '')} /> refresh
          </button>
        </CardTitle>
        {metricsErr && <div className="mt-2 text-[12px] text-(--color-bad) flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {metricsErr}</div>}
        <p className="mt-2 text-[11px] text-(--color-ink-mute)">App Insights · <code className="font-mono">AppRequests</code> filtered to <code className="font-mono">rt-publish</code> and <code className="font-mono">rt-subscribe</code> · 24h window · {metrics?.generatedAt ? `as of ${new Date(metrics.generatedAt).toLocaleTimeString()}` : 'loading…'}</p>
      </Card>
    </div>
  );
}
