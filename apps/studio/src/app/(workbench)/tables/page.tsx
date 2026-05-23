'use client';

import { useState, useEffect } from 'react';
import { tables as mockTables, fmtBytes, type Table, type Column } from '@/lib/mock';
import { useApiOrMock } from '@/lib/useApi';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Database, KeyRound, Link2, ShieldCheck, EyeOff, Plus } from 'lucide-react';
import { NewTableDialog } from '@/components/new-table-dialog';

export default function TablesPage() {
  const { data: tables, live, refresh } = useApiOrMock<Table[]>('/api/tables', mockTables);
  const [active, setActive] = useState<Table>(tables[0]);
  useEffect(() => { if (tables.length && !tables.find(t => t.schema === active.schema && t.name === active.name)) setActive(tables[0]); }, [tables]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
            <span>Build</span><span>/</span><span className="text-(--color-ink-dim)">Tables</span>
            <ComplianceBadge code="HDS §5.2.3" label="Per-tenant data isolation" />
            <span className={'ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ' + (live ? 'bg-(--color-good)/20 text-(--color-good)' : 'bg-(--color-ink-mute)/20 text-(--color-ink-mute)')}>
              <span className={'h-1.5 w-1.5 rounded-full ' + (live ? 'bg-(--color-good)' : 'bg-(--color-ink-mute)')} />{live ? 'live' : 'demo'}
            </span>
          </div>
          <H1>Tables</H1>
        </div>
        <NewTableDialog onCreated={refresh} />
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Tree */}
        <Card className="col-span-12 lg:col-span-3 !p-3">
          <input
            placeholder="Filter…"
            className="w-full bg-transparent border border-(--color-line) rounded-md px-2.5 py-1.5 text-[12px] text-(--color-ink) placeholder:text-(--color-ink-mute) outline-none focus:ring-2 focus:ring-(--color-violet)/40"
          />
          {Object.entries(groupBySchema(tables)).map(([schema, list]) => (
            <div key={schema} className="mt-3">
              <div className="px-1.5 py-1 text-[10px] uppercase tracking-wider text-(--color-ink-mute)">{schema}</div>
              <ul className="space-y-0.5">
                {list.map(t => (
                  <li key={t.name}>
                    <button
                      onClick={() => setActive(t)}
                      className={
                        'w-full text-left px-2.5 py-1.5 rounded-md text-[13px] flex items-center gap-2 ' +
                        (active.name === t.name && active.schema === t.schema
                          ? 'bg-white/[0.05] text-(--color-ink)'
                          : 'text-(--color-ink-dim) hover:bg-white/[0.03] hover:text-(--color-ink)')
                      }
                    >
                      <Database className="h-3.5 w-3.5 text-(--color-ink-mute)" />
                      <span className="flex-1">{t.name}</span>
                      <span className="text-[10px] text-(--color-ink-mute) font-mono">{compact(t.rows)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        {/* Detail */}
        <div className="col-span-12 lg:col-span-9 space-y-5">
          <Card>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="!text-[18px]">
                  <span className="text-(--color-ink-mute) font-normal">{active.schema}.</span>{active.name}
                </CardTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Badge tone="neutral">{active.rows.toLocaleString()} rows</Badge>
                  <Badge tone="neutral">{fmtBytes(active.bytes)}</Badge>
                  <Badge tone={active.rls === 'forced' ? 'good' : active.rls === 'enabled' ? 'cyan' : 'bad'}>
                    <ShieldCheck className="h-3 w-3 inline mr-1" />RLS {active.rls}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost">Open in SQL</Button>
                <Button variant="default">View data</Button>
              </div>
            </div>
          </Card>

          <Card className="!p-0">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <CardTitle>Columns</CardTitle>
              <span className="text-[11px] text-(--color-ink-mute)">{active.columns.length} fields</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                    <th className="text-left px-5 py-2 font-normal">Name</th>
                    <th className="text-left px-5 py-2 font-normal">Type</th>
                    <th className="text-left px-5 py-2 font-normal">Nullable</th>
                    <th className="text-left px-5 py-2 font-normal">Attributes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-line)">
                  {active.columns.map(c => <ColumnRow key={c.name} c={c} />)}
                </tbody>
              </table>
            </div>
          </Card>

          {/* RLS policies summary — links to RLS Designer */}
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>Row-level security policies</CardTitle>
              <Button variant="ghost">Edit in RLS Designer →</Button>
            </div>
            <ul className="space-y-2">
              {active.policies.map(p => (
                <li key={p.name} className="border border-(--color-line) rounded-md p-3 bg-white/[0.02]">
                  <div className="flex items-center gap-2 text-[12px]">
                    <ShieldCheck className="h-3.5 w-3.5 text-(--color-good)" />
                    <span className="text-(--color-ink) font-medium">{p.name}</span>
                    <Badge tone="violet">USING</Badge>
                  </div>
                  <pre className="mt-2 text-[12px] font-mono text-(--color-ink-dim) overflow-x-auto">{p.using}</pre>
                  {p.check && (
                    <>
                      <Badge tone="cyan">CHECK</Badge>
                      <pre className="mt-1 text-[12px] font-mono text-(--color-ink-dim) overflow-x-auto">{p.check}</pre>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ColumnRow({ c }: { c: Column }) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-5 py-2.5 text-(--color-ink) font-medium flex items-center gap-2">
        {c.pk && <KeyRound className="h-3 w-3 text-(--color-violet)" />}
        {c.fk && <Link2 className="h-3 w-3 text-(--color-cyan)" />}
        {c.sensitive && <EyeOff className="h-3 w-3 text-(--color-warn)" />}
        <span>{c.name}</span>
      </td>
      <td className="px-5 py-2.5 font-mono text-(--color-ink-dim)">{c.type}</td>
      <td className="px-5 py-2.5 text-(--color-ink-mute)">{c.nullable ? 'yes' : '—'}</td>
      <td className="px-5 py-2.5">
        <div className="flex gap-1.5 flex-wrap">
          {c.pk && <Badge tone="violet">PK</Badge>}
          {c.fk && <Badge tone="cyan">→ {c.fk}</Badge>}
          {c.index && <Badge tone="neutral">indexed</Badge>}
          {c.sensitive && <Badge tone="warn">PHI</Badge>}
        </div>
      </td>
    </tr>
  );
}

function groupBySchema(ts: Table[]) {
  return ts.reduce<Record<string, Table[]>>((acc, t) => {
    (acc[t.schema] ??= []).push(t); return acc;
  }, {});
}
function compact(n: number) {
  if (n > 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n > 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
