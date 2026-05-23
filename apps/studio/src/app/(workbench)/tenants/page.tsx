'use client';

import { tenants as mockTenants, type Tenant } from '@/lib/mock';
import { useApiOrMock } from '@/lib/useApi';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Plus, ArrowRight } from 'lucide-react';

const tierTone = { starter: 'neutral', pro: 'violet', enterprise: 'cyan' } as const;
const tierQuota = { starter: 50, pro: 500, enterprise: 5000 };

export default function TenantsPage() {
  const { data: tenants, live } = useApiOrMock<Tenant[]>('/api/tenants', mockTenants);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
            <span>Govern</span><span>/</span><span className="text-(--color-ink-dim)">Tenants</span>
            <ComplianceBadge code="HDS §5.1.4" label="Customer isolation by silo" />
            <span className={'ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ' + (live ? 'bg-(--color-good)/20 text-(--color-good)' : 'bg-(--color-ink-mute)/20 text-(--color-ink-mute)')}>
              <span className={'h-1.5 w-1.5 rounded-full ' + (live ? 'bg-(--color-good)' : 'bg-(--color-ink-mute)')} />{live ? 'live' : 'demo'}
            </span>
          </div>
          <H1>Tenants</H1>
          <p className="text-(--color-ink-mute) text-[13px] mt-1.5 max-w-2xl">
            Each customer gets their own Postgres database, blob container, Web PubSub hub, and APIM subscription —
            wired together by one tenant module. Switch to view any tenant via the bottom-left switcher.
          </p>
        </div>
        <Button variant="brand"><Plus className="h-3.5 w-3.5" /> New tenant</Button>
      </div>

      <Card className="!p-0">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-b border-(--color-line)">
              <th className="text-left px-5 py-3 font-normal">Tenant</th>
              <th className="text-left px-5 py-3 font-normal">Tier</th>
              <th className="text-left px-5 py-3 font-normal">RPS / quota</th>
              <th className="text-left px-5 py-3 font-normal">Storage</th>
              <th className="text-left px-5 py-3 font-normal">Status</th>
              <th className="text-left px-5 py-3 font-normal">Created</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-line)">
            {tenants.map(t => {
              const quota = tierQuota[t.tier];
              const pct = Math.min(100, (t.rps / quota) * 100);
              return (
                <tr key={t.slug} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-gradient-to-br from-(--color-violet) to-(--color-cyan) grid place-items-center text-[11px] font-semibold text-black">
                        {t.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-(--color-ink)">{t.name}</div>
                        <div className="text-[11px] text-(--color-ink-mute) font-mono">{t.slug}.sovera.cloud · {t.region}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3"><Badge tone={tierTone[t.tier]}>{t.tier}</Badge></td>
                  <td className="px-5 py-3">
                    <div className="text-[12px] font-mono text-(--color-ink-dim)">{t.rps} / {quota}</div>
                    <div className="mt-1 h-1 rounded bg-white/[0.05] overflow-hidden w-32">
                      <div
                        className="h-full bg-gradient-to-r from-(--color-violet) to-(--color-cyan)"
                        style={{ width: pct + '%' }}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-(--color-ink-dim)">{t.storageGb} GB</td>
                  <td className="px-5 py-3">
                    <Badge tone={t.status === 'active' ? 'good' : t.status === 'provisioning' ? 'warn' : 'neutral'}>
                      {t.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-(--color-ink-mute) font-mono">{t.createdAt}</td>
                  <td className="px-5 py-3 text-right">
                    <button className="text-[12px] text-(--color-ink-mute) hover:text-(--color-cyan) flex items-center gap-1">
                      Open <ArrowRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardTitle>How onboarding works</CardTitle>
        <ol className="text-[13px] text-(--color-ink-dim) space-y-2 list-decimal pl-5 marker:text-(--color-ink-mute)">
          <li>Pick a slug + tier (Starter / Pro / Enterprise).</li>
          <li>Sovera deploys <span className="font-mono text-(--color-ink)">infra/modules/tenant.bicep</span> into your RG — DB, container, hub, KV secrets, APIM product+sub.</li>
          <li><span className="font-mono text-(--color-ink)">services/db/tenant-bootstrap.sql</span> pins the new database to its tenant UUID via <span className="font-mono text-(--color-ink)">dl.this_tenant()</span>.</li>
          <li>Tenant credentials land in Key Vault; APIM subscription key is emitted to the operator.</li>
        </ol>
      </Card>
    </div>
  );
}
