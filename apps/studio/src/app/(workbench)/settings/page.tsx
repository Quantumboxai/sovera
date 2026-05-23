import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { AlertTriangle, KeyRound, Globe, Database } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Account</span><span>/</span><span className="text-(--color-ink-dim)">Settings</span>
          <ComplianceBadge code="ISO 27001 A.9" label="Access control" />
        </div>
        <H1>Settings</H1>
      </div>

      <Card>
        <div className="flex items-start gap-3 mb-3">
          <Globe className="h-4 w-4 text-(--color-cyan) mt-0.5" />
          <div>
            <CardTitle>Project</CardTitle>
            <p className="text-[12px] text-(--color-ink-mute) mt-1">Region and APIM endpoint shared across all tenants.</p>
          </div>
        </div>
        <Field label="Project name"  value="sovera" />
        <Field label="Region"        value="francecentral" />
        <Field label="APIM gateway"  value="https://sovera-apim-prod.azure-api.net" mono />
        <Field label="Authority"     value="https://login.ciamlogin.com/<tenantId>/v2.0" mono />
      </Card>

      <Card>
        <div className="flex items-start gap-3 mb-3">
          <KeyRound className="h-4 w-4 text-(--color-violet) mt-0.5" />
          <div>
            <CardTitle>API keys & secrets</CardTitle>
            <p className="text-[12px] text-(--color-ink-mute) mt-1">Stored in Key Vault. Rotation automated every 90 days.</p>
          </div>
        </div>
        <Field label="anon (public)"        value="sk_pk_•••••••••••••" mono action="Copy" />
        <Field label="service_role"         value="sk_sv_•••••••••••••" mono action="Reveal" />
        <Field label="webhook signing key"  value="whk_•••••••••••••"   mono action="Rotate" />
      </Card>

      <Card>
        <div className="flex items-start gap-3 mb-3">
          <Database className="h-4 w-4 text-(--color-cyan) mt-0.5" />
          <div>
            <CardTitle>Database</CardTitle>
            <p className="text-[12px] text-(--color-ink-mute) mt-1">Per-tenant DBs live alongside the control DB. Backups run hourly.</p>
          </div>
        </div>
        <Field label="Backup retention" value="35 days · cross-region" />
        <Field label="PITR"             value="enabled · 7 days" />
        <Field label="High availability" value="Zone-redundant" />
      </Card>

      <Card className="border-(--color-bad)/40 bg-(--color-bad)/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-(--color-bad) mt-0.5" />
          <div className="flex-1">
            <CardTitle>Danger zone</CardTitle>
            <p className="text-[12px] text-(--color-ink-mute) mt-1 mb-3">These actions are audit-logged and require step-up auth.</p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost">Pause project</Button>
              <Button variant="ghost">Export full audit log</Button>
              <Button variant="ghost">Delete project</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, mono, action }: { label: string; value: string; mono?: boolean; action?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-t border-(--color-line) first:border-t-0">
      <div className="w-44 text-[12px] text-(--color-ink-mute)">{label}</div>
      <div className={'flex-1 text-[13px] text-(--color-ink) ' + (mono ? 'font-mono' : '')}>{value}</div>
      {action && <Badge tone="neutral">{action}</Badge>}
    </div>
  );
}
