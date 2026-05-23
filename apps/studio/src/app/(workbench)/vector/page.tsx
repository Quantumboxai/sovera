'use client';

import { useEffect, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Sparkles, Search, Upload, AlertTriangle, RefreshCw, Trash2, Activity, Filter } from 'lucide-react';

type Stats = {
  ok: boolean;
  total: number;
  model: string;
  dim: number;
  bySource: Array<{ source: string; count: number; tenants: number }>;
  byModel: Array<{ model: string; dim: number; count: number; current: boolean }>;
};
type SearchHit = { id: string; tenant: string | null; source: string; ref: string | null; content: string; score: number };

type MetricRow = { count: number; errors: number; p50ms: number; p95ms: number; lastSeen: string | null };
type Metrics = { windowHours: number; byName: Record<string, MetricRow>; generatedAt: string };

type Tenant = { id: string; name?: string };

export default function VectorPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [tenants, setTenants] = useState<Tenant[]>([]);

  // embed form
  const [embedSource, setEmbedSource] = useState('demo');
  const [embedTenant, setEmbedTenant] = useState('');
  const [embedText, setEmbedText] = useState('');
  const [embedBusy, setEmbedBusy] = useState(false);
  const [embedMsg, setEmbedMsg] = useState<string | null>(null);

  // search form
  const [q, setQ] = useState('');
  const [searchTenant, setSearchTenant] = useState('');
  const [searchSource, setSearchSource] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMs, setSearchMs] = useState<number | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [tenantScope, setTenantScope] = useState<string | null>(null);

  // delete state
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true); setStatsErr(null);
    try {
      const r = await fetch('/api/embed/stats', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setStats(j);
    } catch (e) { setStatsErr((e as Error).message); }
    finally { setLoading(false); }
  }

  async function loadMetrics() {
    setMetricsLoading(true); setMetricsErr(null);
    try {
      const r = await fetch('/api/embed/metrics', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMetrics(j);
    } catch (e) { setMetricsErr((e as Error).message); }
    finally { setMetricsLoading(false); }
  }

  async function loadTenants() {
    try {
      const r = await fetch('/api/tenants', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j)) setTenants(j);
      else if (Array.isArray(j.tenants)) setTenants(j.tenants);
    } catch { /* silent */ }
  }

  useEffect(() => {
    loadStats();
    loadMetrics();
    loadTenants();
  }, []);

  async function doEmbed() {
    setEmbedBusy(true); setEmbedMsg(null);
    try {
      const texts = embedText.split('\n').map(s => s.trim()).filter(Boolean);
      if (!texts.length) throw new Error('no_texts');
      const body: { texts: string[]; source: string; tenant?: string } = { texts, source: embedSource };
      if (embedTenant.trim()) body.tenant = embedTenant.trim();
      const r = await fetch('/api/embed', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setEmbedMsg(`✓ Embedded ${j.count} texts in ${j.ms}ms (${j.model}, dim=${j.dim}${j.tokens ? `, ${j.tokens} tokens` : ''})`);
      loadStats(); loadMetrics();
    } catch (e) { setEmbedMsg(`✗ ${(e as Error).message}`); }
    finally { setEmbedBusy(false); }
  }

  async function doSearch() {
    setSearchBusy(true); setSearchErr(null); setHits([]); setTenantScope(null);
    try {
      const body: { query: string; k: number; tenant?: string; source?: string } = { query: q, k: 10 };
      if (searchTenant.trim()) body.tenant = searchTenant.trim();
      if (searchSource.trim()) body.source = searchSource.trim();
      const r = await fetch('/api/search', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setHits(j.results ?? []);
      setSearchMs(j.ms);
      setTenantScope(j.tenantScope ?? null);
      loadMetrics();
    } catch (e) { setSearchErr((e as Error).message); }
    finally { setSearchBusy(false); }
  }

  async function deleteHit(id: string) {
    if (!confirm('Delete this embedding row?')) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/embed/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setHits(prev => prev.filter(h => h.id !== id));
      loadStats();
    } catch (e) { alert((e as Error).message); }
    finally { setDeleting(null); }
  }

  async function bulkDelete(source: string) {
    if (!confirm(`Delete ALL embeddings with source="${source}"? This cannot be undone.`)) return;
    setBulkDeleting(source);
    try {
      const r = await fetch('/api/embed/bulk-delete', { method: 'POST', body: JSON.stringify({ source }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      alert(`Deleted ${j.deleted} rows.`);
      loadStats();
    } catch (e) { alert((e as Error).message); }
    finally { setBulkDeleting(null); }
  }

  const embedM = metrics?.byName['embed'];
  const searchM = metrics?.byName['embed-search'];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Project</span><span>/</span><span className="text-(--color-ink-dim)">Vector / AI</span>
          <ComplianceBadge code="HDS" label="EU-pinned embeddings · DataZoneStandard" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>Vector / AI</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">Real embeddings via Azure OpenAI <code className="font-mono text-(--color-ink)">text-embedding-3-small</code> (1536-dim), stored in <code className="font-mono text-(--color-ink)">app.embeddings</code> with an HNSW cosine index. API keys are tenant-locked; the Studio operator may filter across tenants.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardTitle>Total vectors</CardTitle><div className="mt-2 text-2xl font-semibold text-(--color-cyan)">{stats?.total.toLocaleString() ?? '—'}</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">in app.embeddings</div></Card>
        <Card><CardTitle>Embed calls (24h)</CardTitle><div className="mt-2 text-2xl font-semibold text-(--color-violet)">{embedM ? embedM.count.toLocaleString() : '—'}</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">{embedM ? `${embedM.errors} errors · p95 ${embedM.p95ms}ms` : 'no data yet'}</div></Card>
        <Card><CardTitle>Search calls (24h)</CardTitle><div className="mt-2 text-2xl font-semibold text-(--color-violet)">{searchM ? searchM.count.toLocaleString() : '—'}</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">{searchM ? `${searchM.errors} errors · p95 ${searchM.p95ms}ms` : 'no data yet'}</div></Card>
        <Card><CardTitle>Index</CardTitle><div className="mt-2 text-[13px] font-mono text-(--color-good)">hnsw / cosine</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">model {stats?.model ?? 'text-embedding-3-small'} · dim {stats?.dim ?? 1536}</div></Card>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-6">
          <div className="flex items-center justify-between">
            <CardTitle><Upload className="h-3.5 w-3.5 inline-block mr-1" /> Embed text</CardTitle>
            <div className="flex items-center gap-2">
              <input value={embedSource} onChange={e => setEmbedSource(e.target.value)} placeholder="source" className="bg-black/30 border border-(--color-line) rounded px-2 py-1 text-[11px] font-mono text-(--color-ink) w-28" />
              <select value={embedTenant} onChange={e => setEmbedTenant(e.target.value)} className="bg-black/30 border border-(--color-line) rounded px-2 py-1 text-[11px] font-mono text-(--color-ink) w-32">
                <option value="">(no tenant)</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name ?? t.id}</option>)}
              </select>
            </div>
          </div>
          <textarea value={embedText} onChange={e => setEmbedText(e.target.value)} rows={6} placeholder="One text per line"
            className="mt-3 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[12px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-(--color-ink-mute)">{embedText.split('\n').filter(s => s.trim()).length} texts · one per line · max 64</span>
            <Button variant="brand" onClick={doEmbed} disabled={embedBusy}>{embedBusy ? 'Embedding…' : 'Embed & store'}</Button>
          </div>
          {embedMsg && <div className={'mt-2 text-[12px] ' + (embedMsg.startsWith('✓') ? 'text-(--color-good)' : 'text-(--color-bad)')}>{embedMsg}</div>}
        </Card>

        <Card className="col-span-12 lg:col-span-6">
          <CardTitle><Search className="h-3.5 w-3.5 inline-block mr-1" /> Semantic search</CardTitle>
          <div className="mt-3 flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="natural language query"
              className="flex-1 bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
            <Button variant="brand" onClick={doSearch} disabled={searchBusy}>{searchBusy ? 'Searching…' : 'Search'}</Button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Filter className="h-3 w-3 text-(--color-ink-mute)" />
            <select value={searchTenant} onChange={e => setSearchTenant(e.target.value)} className="bg-black/30 border border-(--color-line) rounded px-2 py-1 text-[11px] font-mono text-(--color-ink) w-36">
              <option value="">(all tenants)</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name ?? t.id}</option>)}
            </select>
            <input value={searchSource} onChange={e => setSearchSource(e.target.value)} placeholder="source filter" className="bg-black/30 border border-(--color-line) rounded px-2 py-1 text-[11px] font-mono text-(--color-ink) w-32" />
            {tenantScope && <Badge tone="cyan">scope: {tenantScope}</Badge>}
          </div>
          {searchMs !== null && <div className="mt-2 text-[11px] text-(--color-ink-mute)">{hits.length} hits · {searchMs}ms total</div>}
          {searchErr && <div className="mt-2 text-[12px] text-(--color-bad) flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {searchErr}</div>}
          <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto">
            {hits.map(h => (
              <li key={h.id} className="border border-(--color-line) rounded-md p-2.5 hover:bg-white/[0.02]">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="cyan">{(h.score * 100).toFixed(1)}% match</Badge>
                    <span className="text-[10px] font-mono text-(--color-ink-mute)">{h.source}</span>
                    {h.tenant && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-(--color-violet)/20 text-(--color-violet)">tenant: {h.tenant}</span>}
                  </div>
                  <button onClick={() => deleteHit(h.id)} disabled={deleting === h.id} className="text-(--color-ink-mute) hover:text-(--color-bad) disabled:opacity-50" title="Delete this embedding">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-[12px] text-(--color-ink-dim)">{h.content}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Model breakdown — warns if older-model rows exist */}
      {stats && stats.byModel.length > 1 && (
        <Card className="border-(--color-warn)/40">
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-(--color-warn)" /> Multiple embedding models detected</CardTitle>
          <p className="mt-1 text-[12px] text-(--color-ink-mute)">Search filters to the <span className="font-mono text-(--color-ink)">{stats.model}</span> (dim {stats.dim}) rows only. Older rows are invisible to search and consume storage — bulk-delete them by source to clean up.</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {stats.byModel.map(m => (
              <div key={`${m.model}-${m.dim}`} className={'flex items-center justify-between px-3 py-2 border rounded ' + (m.current ? 'border-(--color-good)/40 bg-(--color-good)/5' : 'border-(--color-line)')}>
                <div>
                  <div className="font-mono text-[12px] text-(--color-ink)">{m.model} <span className="text-(--color-ink-mute)">· dim {m.dim}</span></div>
                  <div className="text-[10px] text-(--color-ink-mute) mt-0.5">{m.current ? 'current — used by search' : 'orphaned — invisible to search'}</div>
                </div>
                <Badge tone={m.current ? 'cyan' : 'warn'}>{m.count.toLocaleString()}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>By source</CardTitle>
          <Button variant="ghost" onClick={() => { loadStats(); loadMetrics(); }}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {statsErr && <div className="mt-2 text-[12px] text-(--color-bad)">{statsErr}</div>}
        {!loading && stats && stats.bySource.length === 0 && <div className="mt-3 text-[12px] text-(--color-ink-mute)">No embeddings yet. Use the Embed panel to add some.</div>}
        {stats && stats.bySource.length > 0 && (
          <ul className="mt-3 divide-y divide-(--color-line)">
            {stats.bySource.map(s => (
              <li key={s.source} className="py-2 flex items-center gap-3 text-[13px]">
                <Sparkles className="h-3.5 w-3.5 text-(--color-violet)" />
                <span className="font-mono text-(--color-ink)">{s.source}</span>
                <span className="ml-auto text-(--color-ink-mute) text-[12px]">{s.count.toLocaleString()} vectors · {s.tenants} tenant(s)</span>
                <button onClick={() => bulkDelete(s.source)} disabled={bulkDeleting === s.source}
                  className="text-[11px] text-(--color-ink-mute) hover:text-(--color-bad) disabled:opacity-50 flex items-center gap-1 px-2 py-1 rounded hover:bg-(--color-bad)/10"
                  title={`Delete all rows with source="${s.source}"`}>
                  <Trash2 className="h-3 w-3" /> {bulkDeleting === s.source ? '…' : 'delete'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Usage source</span>
          <button onClick={loadMetrics} className="text-[11px] text-(--color-ink-mute) hover:text-(--color-ink) flex items-center gap-1">
            <RefreshCw className={'h-3 w-3 ' + (metricsLoading ? 'animate-spin' : '')} /> refresh
          </button>
        </CardTitle>
        {metricsErr && <div className="mt-2 text-[12px] text-(--color-bad) flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {metricsErr}</div>}
        <p className="mt-2 text-[11px] text-(--color-ink-mute)">App Insights · <code className="font-mono">AppRequests</code> filtered to embed/search/stats/delete · 24h window · {metrics?.generatedAt ? `as of ${new Date(metrics.generatedAt).toLocaleTimeString()}` : 'loading…'}</p>
      </Card>
    </div>
  );
}
