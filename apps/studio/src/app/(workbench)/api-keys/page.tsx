'use client';

import { useEffect, useMemo, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { KeyRound, Copy, CheckCircle2, RefreshCw, Trash2, Plus, Eye, EyeOff, AlertTriangle, ShieldCheck } from 'lucide-react';

type Key = {
  id: string; name: string; prefix: string; tenant: string | null; scopes: string[];
  created_at: string; last_used_at: string | null; revoked_at: string | null; created_by: string | null;
};

type ScopeDef = { id: string; label: string; group: string };

const PRESETS: Array<{ name: string; description: string; scopes: string[] }> = [
  { name: 'Read-only',     description: 'Safe for dashboards, BI, monitoring',                 scopes: ['db:read','embed:read','search','blob:read','rbac:read','compliance:read','realtime:subscribe'] },
  { name: 'Ingestion',     description: 'Write embeddings, upload blobs, publish events',      scopes: ['embed:write','search','blob:write','blob:read','realtime:publish'] },
  { name: 'AI / RAG',      description: 'Embed text and search the vector store',              scopes: ['embed:read','embed:write','search'] },
  { name: 'Full access',   description: 'Everything — use sparingly',                          scopes: ['*'] },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTenant, setNewTenant] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{ name: string; secret: string; scopes: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [catalog, setCatalog] = useState<ScopeDef[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(['embed:read','search']));

  useEffect(() => {
    fetch('/api/scopes', { cache: 'no-store' }).then(r => r.ok ? r.json() : { scopes: [] })
      .then(j => setCatalog(j.scopes ?? [])).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, ScopeDef[]> = {};
    for (const s of catalog) { (g[s.group] ??= []).push(s); }
    return g;
  }, [catalog]);

  function toggleScope(id: string) {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      if (id === '*') { return next.has('*') ? new Set() : new Set(['*']); }
      next.delete('*');
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function applyPreset(scopes: string[]) { setSelectedScopes(new Set(scopes)); }

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/keys', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setKeys(j.keys ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setCreating(true); setError(null);
    try {
      const scopes = Array.from(selectedScopes);
      if (scopes.length === 0) throw new Error('Pick at least one scope (or use a preset).');
      const r = await fetch('/api/keys', { method: 'POST', body: JSON.stringify({ name: newName, tenant: newTenant || null, scopes }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setJustCreated({ name: j.name, secret: j.secret, scopes: j.scopes ?? scopes });
      setNewName(''); setNewTenant(''); setShowNew(false);
      setSelectedScopes(new Set(['embed:read','search']));
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setCreating(false); }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this key? Any client using it will immediately stop working.')) return;
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    load();
  }

  function copy(s: string) { navigator.clipboard.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Developer</span><span>/</span><span className="text-(--color-ink-dim)">API Keys</span>
          <ComplianceBadge code="HDS §5.3.4" label="Hashed at rest · SHA-256" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>API Keys</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">Server-side keys to call <code className="font-mono text-(--color-ink)">/api/*</code>. Stored hashed in Postgres — the plaintext is shown only at creation time.</p>
      </div>

      {justCreated && (
        <Card className="border-(--color-good)/50">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-(--color-good) shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] text-(--color-ink) font-medium">Key &quot;{justCreated.name}&quot; created — copy it now</div>
              <div className="text-[11px] text-(--color-ink-mute) mt-1">This is the only time you&apos;ll see the full value.</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {justCreated.scopes.map(s => <span key={s} className={'text-[10px] font-mono px-1.5 py-0.5 rounded ' + (s === '*' ? 'bg-(--color-warn)/20 text-(--color-warn)' : 'bg-white/[0.04] text-(--color-ink-dim)')}>{s}</span>)}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 font-mono text-[12px] text-(--color-ink) bg-black/40 border border-(--color-line) rounded-md px-3 py-2 overflow-x-auto">
                  {reveal ? justCreated.secret : justCreated.secret.slice(0, 16) + '·'.repeat(20)}
                </code>
                <Button variant="ghost" onClick={() => setReveal(!reveal)}>{reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</Button>
                <Button variant="ghost" onClick={() => copy(justCreated.secret)}>{copied ? <CheckCircle2 className="h-3.5 w-3.5 text-(--color-good)" /> : <Copy className="h-3.5 w-3.5" />}</Button>
              </div>
              <button className="mt-3 text-[11px] text-(--color-ink-mute) hover:text-(--color-ink)" onClick={() => setJustCreated(null)}>I&apos;ve saved it · dismiss</button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => setShowNew(!showNew)} variant="brand"><Plus className="h-3.5 w-3.5" /> New key</Button>
        <Button variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        {error && <span className="text-[12px] text-(--color-bad) flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {error}</span>}
      </div>

      {showNew && (
        <Card>
          <CardTitle>Create new API key</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-(--color-ink-mute) uppercase tracking-wider">Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ci-runner-prod"
                className="mt-1 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
            </div>
            <div>
              <label className="text-[11px] text-(--color-ink-mute) uppercase tracking-wider">Tenant scope (optional)</label>
              <input value={newTenant} onChange={e => setNewTenant(e.target.value)} placeholder="acme · or leave empty for all"
                className="mt-1 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-(--color-ink-mute) uppercase tracking-wider flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Scopes — least privilege</label>
              <span className="text-[11px] text-(--color-ink-mute)">{selectedScopes.has('*') ? 'wildcard (all)' : `${selectedScopes.size} selected`}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRESETS.map(p => (
                <button key={p.name} type="button" onClick={() => applyPreset(p.scopes)}
                  title={p.description}
                  className="text-[11px] px-2 py-1 rounded-md border border-(--color-line) bg-white/[0.02] text-(--color-ink-dim) hover:text-(--color-ink) hover:border-(--color-cyan)">
                  {p.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-black/20 border border-(--color-line) rounded-md p-3">
              {Object.entries(grouped).map(([group, scopes]) => (
                <div key={group}>
                  <div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) mb-1.5">{group}</div>
                  <div className="space-y-1">
                    {scopes.map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-[12px] text-(--color-ink-dim) hover:text-(--color-ink) cursor-pointer">
                        <input type="checkbox" checked={selectedScopes.has(s.id)} disabled={selectedScopes.has('*') && s.id !== '*'}
                          onChange={() => toggleScope(s.id)}
                          className="accent-(--color-cyan)" />
                        <span className="font-mono text-[11px]">{s.id}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) mb-1.5">Danger</div>
                <label className="flex items-center gap-2 text-[12px] text-(--color-warn) hover:text-(--color-bad) cursor-pointer">
                  <input type="checkbox" checked={selectedScopes.has('*')} onChange={() => toggleScope('*')} className="accent-(--color-bad)" />
                  <span className="font-mono text-[11px]">*  (wildcard)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button variant="brand" onClick={create} disabled={!newName || creating || selectedScopes.size === 0}>{creating ? 'Creating…' : 'Create key'}</Button>
          </div>
        </Card>
      )}

      <Card className="!p-0">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <CardTitle>Keys ({keys.length})</CardTitle>
          {loading && <span className="text-[11px] text-(--color-ink-mute)">loading…</span>}
        </div>
        {keys.length === 0 && !loading ? (
          <div className="px-5 py-8 text-center text-[13px] text-(--color-ink-mute)">No keys yet. Create one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                  <th className="text-left px-5 py-2 font-normal">Name</th>
                  <th className="text-left px-5 py-2 font-normal">Prefix</th>
                  <th className="text-left px-5 py-2 font-normal">Tenant</th>
                  <th className="text-left px-5 py-2 font-normal">Scopes</th>
                  <th className="text-left px-5 py-2 font-normal">Created</th>
                  <th className="text-left px-5 py-2 font-normal">Last used</th>
                  <th className="text-left px-5 py-2 font-normal">Status</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-line)">
                {keys.map(k => (
                  <tr key={k.id} className={'hover:bg-white/[0.02] ' + (k.revoked_at ? 'opacity-50' : '')}>
                    <td className="px-5 py-2.5 text-(--color-ink) flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 text-(--color-violet)" />{k.name}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-(--color-ink-dim)">{k.prefix}…</td>
                    <td className="px-5 py-2.5 text-(--color-ink-mute) font-mono">{k.tenant ?? '—'}</td>
                    <td className="px-5 py-2.5"><div className="flex flex-wrap gap-1 max-w-[280px]">
                      {k.scopes.length === 0
                        ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-(--color-bad)/20 text-(--color-bad)"><AlertTriangle className="h-3 w-3" /> no scopes — key cannot call any endpoint</span>
                        : k.scopes.map(s => <span key={s} className={'text-[10px] font-mono px-1.5 py-0.5 rounded ' + (s === '*' ? 'bg-(--color-warn)/20 text-(--color-warn)' : 'bg-white/[0.04] text-(--color-ink-dim)')}>{s}</span>)}
                    </div></td>
                    <td className="px-5 py-2.5 text-(--color-ink-mute) font-mono text-[11px]">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-2.5 text-(--color-ink-mute) font-mono text-[11px]">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</td>
                    <td className="px-5 py-2.5">{k.revoked_at ? <Badge tone="warn">revoked</Badge> : <Badge tone="good">active</Badge>}</td>
                    <td className="px-5 py-2.5 text-right">
                      {!k.revoked_at && <button onClick={() => revoke(k.id)} className="text-(--color-ink-mute) hover:text-(--color-bad)"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>How to use</CardTitle>
        <pre className="mt-3 text-[12px] font-mono text-(--color-ink-dim) bg-black/30 border border-(--color-line) rounded-md p-3 overflow-x-auto">{`curl https://sovera-fn-h2ssji7afhlr2.azurewebsites.net/api/sql \\
  -H "Authorization: Bearer $SOVERA_KEY" \\
  -H "content-type: application/json" \\
  -d '{"sql":"select 1"}'`}</pre>
      </Card>
    </div>
  );
}
