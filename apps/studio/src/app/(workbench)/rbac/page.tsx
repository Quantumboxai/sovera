'use client';

import { useEffect, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { UsersRound, Plus, Trash2, RefreshCw, AlertTriangle, BadgeCheck } from 'lucide-react';

type Assignment = { id: string; principal: string; principal_name: string | null; role: string; scope: string; created_at: string };
type Me = { authenticated: boolean; kind?: 'user' | 'key'; name?: string; email?: string; roles?: Array<{ role: string; scope: string }> };

export default function RbacPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [valid, setValid] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [principal, setPrincipal] = useState('');
  const [role, setRole] = useState('Developer');
  const [scope, setScope] = useState('project:sovera');

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/rbac', { cache: 'no-store' }),
        fetch('/api/rbac/me', { cache: 'no-store' }),
      ]);
      const j1 = await r1.json(); const j2 = await r2.json();
      if (!r1.ok) throw new Error(j1.error ?? `HTTP ${r1.status}`);
      setAssignments(j1.assignments ?? []);
      setValid(j1.validRoles ?? []);
      setMe(j2);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setErr(null);
    try {
      const r = await fetch('/api/rbac', { method: 'POST', body: JSON.stringify({ principal, role, scope }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setShowAdd(false); setPrincipal('');
      load();
    } catch (e) { setErr((e as Error).message); }
  }

  async function remove(id: string) {
    if (!confirm('Remove this role assignment?')) return;
    await fetch(`/api/rbac/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Enterprise</span><span>/</span><span className="text-(--color-ink-dim)">RBAC</span>
          <ComplianceBadge code="HDS §5.2.4" label="Least privilege · audit logged" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>Role-Based Access Control</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">Assignments persisted in <code className="font-mono text-(--color-ink)">app.role_assignments</code>. Every change is written to the audit log with the actor identity.</p>
      </div>

      {err && <Card className="border-(--color-bad)/40"><div className="flex items-center gap-2 text-[12px] text-(--color-bad)"><AlertTriangle className="h-3.5 w-3.5" /> {err}</div></Card>}

      <Card>
        <CardTitle>You</CardTitle>
        {me?.authenticated ? (
          <div className="mt-2 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-(--color-violet)/30 to-(--color-cyan)/30 grid place-items-center text-(--color-ink) font-semibold">{me.name?.[0] ?? '?'}</div>
            <div className="flex-1">
              <div className="text-[13px] text-(--color-ink)">{me.name ?? 'Unknown'}</div>
              <div className="text-[11px] text-(--color-ink-mute) font-mono">{me.email ?? me.kind}</div>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              {(me.roles ?? []).length === 0 ? <Badge tone="warn">no roles assigned</Badge> : (me.roles ?? []).map((r, i) => <Badge key={i} tone="violet">{r.role}</Badge>)}
            </div>
          </div>
        ) : <div className="mt-2 text-[12px] text-(--color-ink-mute)">Not authenticated.</div>}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => setShowAdd(!showAdd)} variant="brand"><Plus className="h-3.5 w-3.5" /> Assign role</Button>
        <Button variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {showAdd && (
        <Card>
          <CardTitle>New assignment</CardTitle>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-(--color-ink-mute) uppercase tracking-wider">Principal (email)</label>
              <input value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="user@example.com"
                className="mt-1 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
            </div>
            <div>
              <label className="text-[11px] text-(--color-ink-mute) uppercase tracking-wider">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="mt-1 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)">
                {valid.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="text-[11px] text-(--color-ink-mute) uppercase tracking-wider">Scope</label>
              <input value={scope} onChange={e => setScope(e.target.value)} placeholder="project:sovera or tenant:acme"
                className="mt-1 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="brand" onClick={add} disabled={!principal}>Assign</Button>
          </div>
        </Card>
      )}

      <Card className="!p-0">
        <div className="px-5 pt-4 pb-2"><CardTitle>Assignments ({assignments.length})</CardTitle></div>
        {assignments.length === 0 && !loading ? (
          <div className="px-5 py-8 text-center text-[13px] text-(--color-ink-mute)">No assignments. Add one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                  <th className="text-left px-5 py-2 font-normal">Principal</th>
                  <th className="text-left px-5 py-2 font-normal">Role</th>
                  <th className="text-left px-5 py-2 font-normal">Scope</th>
                  <th className="text-left px-5 py-2 font-normal">Since</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-line)">
                {assignments.map(a => (
                  <tr key={a.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-2.5 text-(--color-ink) flex items-center gap-2">
                      <UsersRound className="h-3.5 w-3.5 text-(--color-ink-mute)" />
                      <div>
                        <div>{a.principal}</div>
                        {a.principal_name && <div className="text-[11px] text-(--color-ink-mute)">{a.principal_name}</div>}
                      </div>
                    </td>
                    <td className="px-5 py-2.5"><Badge tone="violet">{a.role}</Badge></td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-(--color-ink-mute)">{a.scope}</td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-(--color-ink-mute)">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button onClick={() => remove(a.id)} className="text-(--color-ink-mute) hover:text-(--color-bad)"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-(--color-good)" /><CardTitle>Built-in roles</CardTitle></div>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          {valid.map(r => <li key={r} className="border border-(--color-line) rounded px-2.5 py-1.5 text-(--color-ink-dim) font-mono">{r}</li>)}
        </ul>
      </Card>
    </div>
  );
}
