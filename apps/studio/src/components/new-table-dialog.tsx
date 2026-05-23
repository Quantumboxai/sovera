'use client';

import { useState } from 'react';
import { Plus, Trash2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

type Col = { name: string; type: string; nullable: boolean; pk: boolean };

const TYPES = [
  'uuid', 'text', 'varchar', 'int', 'bigint', 'boolean',
  'timestamptz', 'date', 'jsonb', 'numeric',
];

export function NewTableDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [schema, setSchema] = useState('public');
  const [name, setName] = useState('');
  const [rls, setRls] = useState(true);
  const [cols, setCols] = useState<Col[]>([
    { name: 'tenant_id', type: 'uuid', nullable: false, pk: false },
    { name: 'created_at', type: 'timestamptz', nullable: false, pk: false },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setSchema('public'); setName(''); setRls(true); setErr(null);
    setCols([
      { name: 'tenant_id', type: 'uuid', nullable: false, pk: false },
      { name: 'created_at', type: 'timestamptz', nullable: false, pk: false },
    ]);
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schema, name, rls, columns: cols.filter(c => c.name && c.type) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
      setOpen(false); reset(); onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New table
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-2xl glass lift rounded-[var(--radius)] border border-(--color-line) max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-(--color-line) flex items-center justify-between">
              <div>
                <div className="text-[14px] text-(--color-ink)">Create table</div>
                <div className="text-[11px] text-(--color-ink-mute)">Runs CREATE TABLE on the Sovera Postgres backend.</div>
              </div>
              <button
                onClick={() => !busy && setOpen(false)}
                className="h-7 w-7 grid place-items-center rounded-md text-(--color-ink-mute) hover:text-(--color-ink) hover:bg-white/[0.05]"
              ><X className="h-4 w-4" /></button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Schema">
                  <input
                    value={schema} onChange={(e) => setSchema(e.target.value)}
                    placeholder="public"
                    className="w-full bg-transparent border border-(--color-line) rounded-md px-2.5 py-1.5 text-[13px] font-mono text-(--color-ink) outline-none focus:ring-2 focus:ring-(--color-violet)/40"
                  />
                </Field>
                <Field label="Table name">
                  <input
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="appointments"
                    className="w-full bg-transparent border border-(--color-line) rounded-md px-2.5 py-1.5 text-[13px] font-mono text-(--color-ink) outline-none focus:ring-2 focus:ring-(--color-violet)/40"
                  />
                </Field>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] text-(--color-ink-dim)">Columns</div>
                  <button
                    onClick={() => setCols([...cols, { name: '', type: 'text', nullable: true, pk: false }])}
                    className="text-[11px] text-(--color-violet) hover:underline"
                  >+ add column</button>
                </div>
                <div className="text-[11px] text-(--color-ink-mute) mb-2">
                  An <code className="text-(--color-ink-dim)">id uuid PRIMARY KEY</code> is added automatically if no PK is specified.
                </div>
                <div className="space-y-1.5">
                  {cols.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_140px_70px_60px_28px] gap-2 items-center">
                      <input
                        value={c.name}
                        onChange={(e) => updateCol(i, { name: e.target.value })}
                        placeholder="column_name"
                        className="bg-transparent border border-(--color-line) rounded-md px-2 py-1 text-[12px] font-mono text-(--color-ink) outline-none focus:ring-2 focus:ring-(--color-violet)/40"
                      />
                      <select
                        value={c.type}
                        onChange={(e) => updateCol(i, { type: e.target.value })}
                        className="bg-(--color-bg) border border-(--color-line) rounded-md px-2 py-1 text-[12px] font-mono text-(--color-ink) outline-none focus:ring-2 focus:ring-(--color-violet)/40"
                      >
                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5 text-[11px] text-(--color-ink-dim)">
                        <input type="checkbox" checked={c.nullable} onChange={(e) => updateCol(i, { nullable: e.target.checked })} />
                        null
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] text-(--color-ink-dim)">
                        <input type="checkbox" checked={c.pk} onChange={(e) => updateCol(i, { pk: e.target.checked })} />
                        pk
                      </label>
                      <button
                        onClick={() => setCols(cols.filter((_, j) => j !== i))}
                        className="h-6 w-6 grid place-items-center rounded text-(--color-ink-mute) hover:text-(--color-bad) hover:bg-white/[0.05]"
                      ><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12px] text-(--color-ink-dim)">
                <input type="checkbox" checked={rls} onChange={(e) => setRls(e.target.checked)} />
                Enable row-level security (recommended)
              </label>

              {err && (
                <div className="text-[12px] text-(--color-bad) bg-(--color-bad)/10 border border-(--color-bad)/30 rounded-md px-3 py-2 font-mono">
                  {err}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-(--color-line) flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => !busy && setOpen(false)}>Cancel</Button>
              <Button variant="brand" onClick={submit}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create table
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function updateCol(i: number, patch: Partial<Col>) {
    setCols(cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-(--color-ink-mute) mb-1">{label}</div>
      {children}
    </div>
  );
}
