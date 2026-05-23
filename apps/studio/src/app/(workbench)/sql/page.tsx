'use client';

import { useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { useSovera } from '@/lib/sovera';
import { Play, Clock, ShieldCheck, Sparkles } from 'lucide-react';

const PRESETS = [
  { name: 'Top tables by size', sql: `select schemaname, relname, pg_size_pretty(pg_total_relation_size(c.oid))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_stat_user_tables s on s.relid = c.oid
order by pg_total_relation_size(c.oid) desc limit 20;` },
  { name: 'Active tenants today', sql: `select tenant_id, count(*) as events
from audit.events
where ts >= now() - interval '1 day'
group by 1 order by 2 desc limit 10;` },
  { name: 'Slow queries', sql: `select query, calls, round(mean_exec_time::numeric, 2) as ms
from pg_stat_statements
order by mean_exec_time desc limit 20;` },
];

export default function SQLPage() {
  const { tenant } = useSovera();
  const [sql, setSql] = useState(`-- Run as tenant: ${tenant.slug}
select id, full_name, dob
from app.patients
where created_at >= now() - interval '7 days'
order by created_at desc
limit 50;`);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ ms: number; rowCount: number; live: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const r = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql, tenant: tenant.slug }),
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setError(j.detail || j.error || `HTTP ${r.status}`);
        setRows(null); setMeta(null);
      } else {
        setFields(j.fields ?? []);
        setRows(j.rows ?? []);
        setMeta({ ms: j.ms ?? 0, rowCount: j.rowCount ?? (j.rows?.length ?? 0), live: true });
      }
    } catch (e) {
      setError((e as Error).message);
      setRows(null); setMeta(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
            <span>Build</span><span>/</span><span className="text-(--color-ink-dim)">SQL editor</span>
            <ComplianceBadge code="HDS §5.2.5" label="Tenant claim enforced on session" />
          </div>
          <H1>SQL editor</H1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="violet"><ShieldCheck className="h-3 w-3 inline mr-1" /> as tenant <span className="font-mono">{tenant.slug}</span></Badge>
          <Button variant="brand" onClick={run}>
            {running ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-3 !p-3">
          <div className="px-1.5 py-1 text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Snippets</div>
          <ul className="space-y-0.5">
            {PRESETS.map(p => (
              <li key={p.name}>
                <button
                  onClick={() => setSql(p.sql)}
                  className="w-full text-left px-2.5 py-2 rounded-md text-[12px] text-(--color-ink-dim) hover:bg-white/[0.04] hover:text-(--color-ink)"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 p-3 rounded-md border border-(--color-line) bg-gradient-to-br from-(--color-violet)/10 to-transparent">
            <div className="flex items-center gap-1.5 text-[11px] text-(--color-ink-dim)">
              <Sparkles className="h-3 w-3 text-(--color-violet)" /> AI helpers
            </div>
            <div className="text-[11px] text-(--color-ink-mute) mt-1 leading-snug">
              "Explain this plan" · "Add an index" · "Rewrite as CTE"
            </div>
          </div>
        </Card>

        <div className="col-span-12 lg:col-span-9 space-y-5">
          <Card className="!p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-(--color-line)">
              <div className="flex items-center gap-2 text-[11px] text-(--color-ink-mute) font-mono">
                <span className="h-2 w-2 rounded-full bg-(--color-good)" /> sovera-pg-fr-c · search_path=app,public
              </div>
              <span className="text-[11px] text-(--color-ink-mute)">{sql.length} chars</span>
            </div>
            <textarea
              spellCheck={false}
              value={sql}
              onChange={e => setSql(e.target.value)}
              className="w-full h-72 bg-transparent text-[13px] font-mono text-(--color-ink) p-4 outline-none resize-none"
            />
          </Card>

          <Card className="!p-0">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <CardTitle>Results</CardTitle>
              {meta && (
                <span className="text-[11px] text-(--color-ink-mute)">
                  {meta.rowCount} rows · {meta.ms}ms · {meta.live ? 'live' : 'demo'}
                </span>
              )}
            </div>
            {error ? (
              <div className="mx-5 mb-5 text-[12px] text-(--color-bad) bg-(--color-bad)/10 border border-(--color-bad)/30 rounded-md px-3 py-2 font-mono whitespace-pre-wrap">
                {error}
              </div>
            ) : !rows ? (
              <div className="px-5 pb-6 text-[12px] text-(--color-ink-mute)">Run a query to see results.</div>
            ) : rows.length === 0 ? (
              <div className="px-5 pb-6 text-[12px] text-(--color-ink-mute)">Query returned 0 rows.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                      {(fields.length ? fields : Object.keys(rows[0])).map(k => <th key={k} className="text-left px-5 py-2 font-normal">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-line) font-mono">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        {(fields.length ? fields : Object.keys(r)).map((k, j) => (
                          <td key={j} className="px-5 py-2 text-(--color-ink-dim)">
                            {r[k] === null ? <span className="text-(--color-ink-mute) italic">null</span> : String(r[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
