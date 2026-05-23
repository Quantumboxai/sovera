'use client';

import { useSovera } from '@/lib/sovera';
import { H1, Card, CardTitle, Stat, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { complianceFlags, tenants, logs } from '@/lib/mock';
import {
  ArrowUpRight, Activity, ShieldCheck, KeyRound, Database, Building2, Zap,
} from 'lucide-react';

export default function OverviewPage() {
  const { tenant } = useSovera();
  const activeTenants = tenants.filter(t => t.status === 'active').length;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
            <span>Overview</span>
            <span>/</span>
            <span className="text-(--color-ink-dim)">{tenant.name}</span>
            <ComplianceBadge code="HDS §5.4.2" label="Per-tenant access auditing" />
          </div>
          <H1>
            <span className="brand-text">Sovera</span> control plane is healthy.
          </H1>
          <p className="text-(--color-ink-mute) text-[14px] mt-1.5 max-w-xl">
            One sovereign backend. Postgres, storage, realtime, and serverless — fronted by APIM, secured by Entra,
            audited by Sentinel. Built on Azure, lives in France.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost">Invite member</Button>
          <Button variant="brand">New tenant <ArrowUpRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Database size" value="412 GB" hint="+18 GB this week" accent="violet" />
        <Stat label="Requests / min" value="14.2k" hint="P95 38ms" accent="cyan" />
        <Stat label="Active tenants" value={String(activeTenants)} hint="1 provisioning" accent="good" />
        <Stat label="Error rate (5m)" value="0.04%" hint="-0.02 vs 24h" accent="good" />
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <CardTitle>Traffic — last 60 min</CardTitle>
            <Badge tone="cyan">live</Badge>
          </div>
          <Sparkline />
          <div className="grid grid-cols-4 gap-3 pt-2 border-t border-(--color-line)">
            <Mini label="GET" value="9.8k" />
            <Mini label="POST" value="3.1k" />
            <Mini label="PATCH" value="0.9k" />
            <Mini label="DELETE" value="0.4k" />
          </div>
        </Card>

        <Card>
          <CardTitle>Compliance posture</CardTitle>
          <ul className="space-y-2.5">
            {complianceFlags.map(f => (
              <li key={f.code} className="flex items-start gap-2.5">
                <span className={'mt-1 h-1.5 w-1.5 rounded-full ' + (f.ok ? 'bg-(--color-good) dot-pulse' : 'bg-(--color-bad)')} />
                <div className="min-w-0">
                  <div className="text-[12px] text-(--color-ink)">{f.label}</div>
                  <div className="text-[11px] text-(--color-ink-mute)">{f.code}</div>
                </div>
                <ShieldCheck className="ml-auto h-3.5 w-3.5 text-(--color-good)" />
              </li>
            ))}
          </ul>
          <div className="text-[11px] text-(--color-ink-mute) pt-2 border-t border-(--color-line)">
            Audited 2 minutes ago by Sentinel.
          </div>
        </Card>
      </div>

      {/* Health row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <HealthCard icon={Database} title="Postgres Flexible" sub="fr-central · ZRS · CMK"
          metrics={[{ k: 'CPU', v: '34%' }, { k: 'Conn', v: '142 / 500' }, { k: 'IOPS', v: '4.1k' }]} />
        <HealthCard icon={Zap} title="Functions Flex" sub="3 apps · 12 instances"
          metrics={[{ k: 'Cold start', v: '210ms' }, { k: 'P95', v: '88ms' }, { k: 'Errors', v: '0' }]} />
        <HealthCard icon={KeyRound} title="Key Vault" sub="HSM · auto-rotate"
          metrics={[{ k: 'Keys', v: '14' }, { k: 'Next rotation', v: '3 days' }, { k: 'Expired', v: '0' }]} />
      </div>

      {/* Recent activity */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Recent events</CardTitle>
          <Button variant="ghost">View all logs</Button>
        </div>
        <ul className="divide-y divide-(--color-line) -mx-5">
          {logs.slice(0, 6).map((l, i) => (
            <li key={i} className="px-5 py-2.5 flex items-center gap-3 text-[12px]">
              <span className={
                'h-1.5 w-1.5 rounded-full ' +
                (l.level === 'error' ? 'bg-(--color-bad)' : l.level === 'warn' ? 'bg-(--color-warn)' : 'bg-(--color-good)')
              } />
              <span className="font-mono text-(--color-ink-mute) w-28">{l.ts}</span>
              <Badge tone="neutral">{l.source}</Badge>
              {l.tenant && <Badge tone="violet">{l.tenant}</Badge>}
              <span className="text-(--color-ink-dim) truncate">{l.msg}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-wider uppercase text-(--color-ink-mute)">{label}</div>
      <div className="text-[16px] text-(--color-ink) font-medium font-mono">{value}</div>
    </div>
  );
}

function HealthCard({ icon: Icon, title, sub, metrics }: {
  icon: typeof Activity; title: string; sub: string; metrics: { k: string; v: string }[];
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-white/[0.04] grid place-items-center">
          <Icon className="h-4 w-4 text-(--color-cyan)" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] text-(--color-ink)">{title}</div>
          <div className="text-[11px] text-(--color-ink-mute)">{sub}</div>
        </div>
        <Badge tone="good">●</Badge>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-(--color-line)">
        {metrics.map(m => (
          <div key={m.k}>
            <div className="text-[10px] tracking-wider uppercase text-(--color-ink-mute)">{m.k}</div>
            <div className="text-[13px] text-(--color-ink) font-mono">{m.v}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// SVG sparkline — no chart lib needed for this density.
function Sparkline() {
  const data = [22, 26, 24, 30, 28, 35, 38, 36, 42, 40, 44, 50, 48, 56, 60, 58, 62, 70, 66, 72, 78, 74, 80, 84, 82, 88, 92, 90, 94, 100];
  const w = 720, h = 160, pad = 8;
  const max = Math.max(...data), min = Math.min(...data);
  const x = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const area = `${path} L ${x(data.length - 1)} ${h - pad} L ${x(0)} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="s" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#g)" />
      <path d={path} fill="none" stroke="url(#s)" strokeWidth="1.75" />
    </svg>
  );
}
