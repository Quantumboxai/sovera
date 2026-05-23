'use client';

import { useEffect, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Shield, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Activity } from 'lucide-react';

type Check = {
  area: string; httpsOnly?: boolean; minTlsVersion?: string; ftpsState?: string; http20?: boolean;
  location?: string; tlsEnforced?: boolean; minTls?: string; backupDays?: number; geoRedundant?: boolean; ha?: string; encryption?: string;
  error?: string;
};
type Data = {
  subscription: string; resourceGroup: string; region: string; at: string;
  policySummary?: { nonCompliantResources: number; nonCompliantPolicies: number; byState: Array<{ ComplianceState: string; Count: number }> };
  policySummaryError?: string;
  checks: Check[];
  secureScore?: { current: number; max: number; percentage: number } | null;
  secureScoreError?: string;
};

export default function CompliancePage() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/compliance', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setD(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const compliant = d?.policySummary?.byState?.find(x => x.ComplianceState === 'Compliant')?.Count ?? 0;
  const nonCompliant = d?.policySummary?.nonCompliantResources ?? 0;
  const total = compliant + nonCompliant;
  const pct = total > 0 ? Math.round(100 * compliant / total) : 100;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Enterprise</span><span>/</span><span className="text-(--color-ink-dim)">Compliance</span>
          <ComplianceBadge code="Live" label="Azure Policy + ARM" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>Compliance</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">Real-time view from Azure Policy, ARM configuration, and Defender for Cloud. Pulled at request time — no cached snapshots.</p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-(--color-ink-mute)">
          <span>Subscription <code className="font-mono text-(--color-ink-dim)">{d?.subscription?.slice(0, 8) ?? '…'}…</code></span>
          <span>· RG <code className="font-mono text-(--color-ink-dim)">{d?.resourceGroup}</code></span>
          <span>· Region <code className="font-mono text-(--color-ink-dim)">{d?.region}</code></span>
          <Button variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {err && <Card className="border-(--color-bad)/40"><div className="flex items-center gap-2 text-[12px] text-(--color-bad)"><AlertTriangle className="h-3.5 w-3.5" /> {err}</div></Card>}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardTitle>Azure Policy compliance</CardTitle>
          <div className="mt-2 text-3xl font-semibold text-(--color-cyan)">{loading ? '…' : `${pct}%`}</div>
          <div className="mt-1 text-[11px] text-(--color-ink-mute)">{compliant} compliant · {nonCompliant} non-compliant resources</div>
        </Card>
        <Card>
          <CardTitle>Defender secure score</CardTitle>
          <div className="mt-2 text-3xl font-semibold text-(--color-violet)">
            {d?.secureScore ? `${Math.round(d.secureScore.percentage * 100)}%` : '—'}
          </div>
          <div className="mt-1 text-[11px] text-(--color-ink-mute)">
            {d?.secureScore ? `${d.secureScore.current.toFixed(1)} / ${d.secureScore.max}` : (d?.secureScoreError ? 'not available' : '…')}
          </div>
        </Card>
        <Card>
          <CardTitle>Data region</CardTitle>
          <div className="mt-2 text-2xl font-semibold text-(--color-good)">{d?.region ?? '…'}</div>
          <div className="mt-1 text-[11px] text-(--color-ink-mute)">Enforced by subscription policy</div>
        </Card>
      </div>

      <Card className="!p-0">
        <div className="px-5 pt-4 pb-2"><CardTitle>Live infrastructure checks</CardTitle></div>
        {!d && loading && <div className="px-5 pb-4 text-[12px] text-(--color-ink-mute)">Loading from Azure ARM…</div>}
        <ul className="divide-y divide-(--color-line)">
          {d?.checks.map((c, i) => (
            <li key={i} className="px-5 py-3">
              <div className="flex items-center gap-2">
                {c.error ? <XCircle className="h-3.5 w-3.5 text-(--color-bad)" /> : <CheckCircle2 className="h-3.5 w-3.5 text-(--color-good)" />}
                <span className="text-[13px] text-(--color-ink) font-medium flex-1">{c.area}</span>
                {c.location && <Badge tone="cyan">{c.location}</Badge>}
              </div>
              {c.error ? (
                <div className="mt-1 text-[12px] text-(--color-bad) font-mono">{c.error}</div>
              ) : (
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                  {c.area === 'Function App' && <>
                    <Item label="HTTPS only" value={c.httpsOnly ? 'yes' : 'no'} ok={c.httpsOnly === true} />
                    <Item label="min TLS" value={c.minTlsVersion ?? '?'} ok={(c.minTlsVersion ?? '1.0') >= '1.2'} />
                    <Item label="FTPS" value={c.ftpsState ?? '?'} ok={c.ftpsState === 'FtpsOnly' || c.ftpsState === 'Disabled'} />
                    <Item label="HTTP/2" value={c.http20 ? 'on' : 'off'} ok={c.http20 === true} />
                  </>}
                  {c.area === 'Postgres' && <>
                    <Item label="TLS enforced" value={c.tlsEnforced ? 'yes' : 'no'} ok={c.tlsEnforced === true} />
                    <Item label="Backup days" value={String(c.backupDays ?? '?')} ok={(c.backupDays ?? 0) >= 7} />
                    <Item label="HA" value={c.ha ?? '?'} ok={c.ha !== 'Disabled' && !!c.ha} />
                    <Item label="Encryption" value={c.encryption ?? '?'} ok={!!c.encryption} />
                  </>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-(--color-good)" /><CardTitle>What this means</CardTitle></div>
        <p className="mt-2 text-[12px] text-(--color-ink-dim) leading-relaxed">
          Every value above is fetched at page-load from Azure&apos;s management API using the Function App&apos;s managed identity. There is no static cert badge — if Azure Policy flags a non-compliant resource, you see it here within seconds. Generate an audit-time-window evidence pack from the CLI: <code className="font-mono text-(--color-ink)">sovera evidence export --since 30d</code>.
        </p>
        <div className="mt-3 text-[10px] font-mono text-(--color-ink-mute)">last refreshed: {d?.at}</div>
      </Card>
    </div>
  );
}

function Item({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="border border-(--color-line) rounded px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-(--color-ink-mute)">{label}</div>
      <div className={'mt-0.5 font-mono text-[11px] flex items-center gap-1 ' + (ok ? 'text-(--color-good)' : 'text-(--color-warn)')}>
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <Activity className="h-3 w-3" />} {value}
      </div>
    </div>
  );
}
