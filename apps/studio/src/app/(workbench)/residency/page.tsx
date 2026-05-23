'use client';

import { useEffect, useState } from 'react';
import { H1, Card, CardTitle, Badge } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Globe2, MapPin, Server, Database, HardDrive, Lock } from 'lucide-react';

type Platform = {
  region: string; resourceGroup: string; functionApp: string;
  pgHost: string; pgDb: string; pgUser: string;
};

const REGIONS = [
  { code: 'francecentral', label: 'France Central',  city: 'Paris',      country: 'France',        gdpr: true, hds: true, schrems: 'safe', primary: true },
  { code: 'francesouth',   label: 'France South',    city: 'Marseille',  country: 'France',        gdpr: true, hds: true, schrems: 'safe' },
  { code: 'germanywestcentral', label: 'Germany West Central', city: 'Frankfurt', country: 'Germany', gdpr: true, hds: false, schrems: 'safe' },
  { code: 'northeurope',   label: 'North Europe',    city: 'Dublin',     country: 'Ireland',       gdpr: true, hds: false, schrems: 'safe' },
  { code: 'westeurope',    label: 'West Europe',     city: 'Amsterdam',  country: 'Netherlands',   gdpr: true, hds: false, schrems: 'safe' },
];

export default function ResidencyPage() {
  const [p, setP] = useState<Platform | null>(null);
  useEffect(() => { fetch('/api/platform').then(r => r.ok ? r.json() : null).then(setP).catch(() => {}); }, []);

  const primary = p?.region ?? 'francecentral';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Enterprise</span><span>/</span><span className="text-(--color-ink-dim)">Data residency</span>
          <ComplianceBadge code="GDPR Art. 44" label="No transfer outside the EU" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>Data Residency</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">Every byte of your data — at rest, in transit, in backup — stays in the region you pick. Currently <span className="text-(--color-ink) font-mono">{primary}</span>.</p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-5">
          <div className="flex items-center justify-between">
            <CardTitle>Primary region</CardTitle>
            <Badge tone="good">active</Badge>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-md bg-gradient-to-br from-(--color-violet)/30 to-(--color-cyan)/30 grid place-items-center">
              <MapPin className="h-6 w-6 text-(--color-cyan)" />
            </div>
            <div>
              <div className="text-[16px] text-(--color-ink) font-semibold">France Central</div>
              <div className="text-[12px] text-(--color-ink-mute) font-mono">{primary} · Paris, France 🇫🇷</div>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-[12px] text-(--color-ink-dim)">
            <li className="flex items-center gap-2"><Server className="h-3.5 w-3.5 text-(--color-ink-mute)" /> Compute — Container Apps + Functions</li>
            <li className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-(--color-ink-mute)" /> Postgres — Flexible Server</li>
            <li className="flex items-center gap-2"><HardDrive className="h-3.5 w-3.5 text-(--color-ink-mute)" /> Blob storage — ZRS</li>
            <li className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-(--color-ink-mute)" /> Key Vault — CMK · HSM-backed</li>
          </ul>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardTitle>Live resources</CardTitle>
          <div className="mt-3 space-y-2 font-mono text-[12px]">
            <Row label="Function app"     value={p?.functionApp ?? '…'} />
            <Row label="Postgres host"    value={p?.pgHost ?? '…'} />
            <Row label="Postgres user"    value={p?.pgUser ?? '…'} />
            <Row label="Resource group"   value={p?.resourceGroup ?? '…'} />
            <Row label="Region"           value={primary} />
          </div>
          <div className="mt-4 text-[11px] text-(--color-ink-mute)">Source: <code className="font-mono text-(--color-ink-dim)">GET /api/platform</code> — live, read from Azure env at request time.</div>
        </Card>

        <Card className="col-span-12 !p-0">
          <div className="px-5 pt-4 pb-2"><CardTitle>Available regions</CardTitle></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                  <th className="text-left px-5 py-2 font-normal">Region</th>
                  <th className="text-left px-5 py-2 font-normal">Location</th>
                  <th className="text-left px-5 py-2 font-normal">GDPR</th>
                  <th className="text-left px-5 py-2 font-normal">HDS</th>
                  <th className="text-left px-5 py-2 font-normal">Schrems II</th>
                  <th className="text-left px-5 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-line)">
                {REGIONS.map(r => (
                  <tr key={r.code} className={'hover:bg-white/[0.02] ' + (r.primary ? 'bg-(--color-good)/5' : '')}>
                    <td className="px-5 py-2.5 text-(--color-ink) flex items-center gap-2">
                      <Globe2 className="h-3.5 w-3.5 text-(--color-cyan)" /> <span className="font-mono">{r.code}</span>
                    </td>
                    <td className="px-5 py-2.5 text-(--color-ink-dim)">{r.city}, {r.country}</td>
                    <td className="px-5 py-2.5"><Badge tone={r.gdpr ? 'good' : 'neutral'}>{r.gdpr ? 'yes' : '—'}</Badge></td>
                    <td className="px-5 py-2.5"><Badge tone={r.hds ? 'good' : 'neutral'}>{r.hds ? 'yes' : '—'}</Badge></td>
                    <td className="px-5 py-2.5"><Badge tone="good">{r.schrems}</Badge></td>
                    <td className="px-5 py-2.5">
                      {r.primary ? <Badge tone="violet">primary</Badge> : <Badge tone="neutral">available</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="col-span-12">
          <CardTitle>How we enforce it</CardTitle>
          <ul className="mt-3 space-y-2 text-[12px] text-(--color-ink-dim)">
            <li>• Azure Policy at subscription level blocks deployments outside <span className="font-mono text-(--color-ink)">france*</span>.</li>
            <li>• Postgres is single-region with ZRS backups; no cross-region replication.</li>
            <li>• Blob storage uses ZRS within francecentral; no GRS replication.</li>
            <li>• Logs ship to a Log Analytics workspace in the same region (30-day retention).</li>
            <li>• No Microsoft engineer can read your data — keys are CMK in your Key Vault.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-(--color-line) last:border-0">
      <span className="text-(--color-ink-mute) text-[11px] uppercase tracking-wider">{label}</span>
      <span className="text-(--color-ink) truncate">{value}</span>
    </div>
  );
}
