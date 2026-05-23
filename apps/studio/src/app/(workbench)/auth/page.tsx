'use client';

import { useEffect, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Lock, Shield, Users, LogIn, CheckCircle2, ExternalLink } from 'lucide-react';

type Me = { user_id?: string; user_claims?: Array<{ typ: string; val: string }> };

export default function AuthPage() {
  const [me, setMe] = useState<{ name: string; email: string; oid: string; tid: string } | null>(null);

  useEffect(() => {
    fetch('/.auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((arr: Me[] | null) => {
        const u = arr?.[0];
        if (!u) return;
        const claims = u.user_claims ?? [];
        const get = (...keys: string[]) => {
          for (const k of keys) { const c = claims.find(c => c.typ === k); if (c?.val) return c.val; }
          return '';
        };
        setMe({
          name: get('name', 'given_name') || (u.user_id ?? '').split('@')[0],
          email: u.user_id ?? get('preferred_username', 'email'),
          oid: get('http://schemas.microsoft.com/identity/claims/objectidentifier', 'oid'),
          tid: get('http://schemas.microsoft.com/identity/claims/tenantid', 'tid'),
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Project</span><span>/</span><span className="text-(--color-ink-dim)">Auth</span>
          <ComplianceBadge code="HDS §5.2.1" label="Strong identity required" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>Authentication</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">Microsoft Entra ID (Azure AD) — single sign-on, MFA, conditional access enforced by Azure tenant policy.</p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-7 space-y-4">
          <CardTitle>Identity provider</CardTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Provider" value="Microsoft Entra ID" />
            <Field label="Mode" value="Easy Auth (ACA managed)" />
            <Field label="App registration" value="Sovera Studio" mono />
            <Field label="Client ID" value="c5edbba7-3c93-4734-9b38-feed115ed695" mono />
            <Field label="Tenant ID" value={me?.tid ?? '533005c0-8ef0-404d-985a-7ca64041253a'} mono />
            <Field label="Flow" value="response_type=code id_token (form_post)" mono />
            <Field label="Scopes" value="openid profile email" mono />
            <Field label="Token store" value="Disabled (stateless)" />
          </div>
          <div className="pt-2 flex gap-2">
            <Button variant="default" onClick={() => window.open('https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/c5edbba7-3c93-4734-9b38-feed115ed695')}>
              <ExternalLink className="h-3.5 w-3.5" /> View in Entra
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/.auth/logout?post_logout_redirect_uri=/'}>
              <LogIn className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-5 space-y-3">
          <CardTitle>Signed-in user</CardTitle>
          {me ? (
            <>
              <div className="flex items-center gap-3 pt-1">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-(--color-violet) to-(--color-cyan) grid place-items-center text-[18px] font-semibold text-black">
                  {(me.name || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] text-(--color-ink) truncate">{me.name}</div>
                  <div className="text-[12px] text-(--color-ink-mute) truncate">{me.email}</div>
                </div>
              </div>
              <Field label="Object ID" value={me.oid} mono />
              <Field label="Authentication" value={<><CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-(--color-good)" />Verified via Entra</>} />
            </>
          ) : (
            <div className="text-[12px] text-(--color-ink-mute)">Loading…</div>
          )}
        </Card>

        <Card className="col-span-12 lg:col-span-6 space-y-2">
          <CardTitle>Security controls</CardTitle>
          <Item icon={<Shield className="h-3.5 w-3.5" />} label="HTTPS only" on />
          <Item icon={<Lock className="h-3.5 w-3.5" />}    label="Unauthenticated → 302 to login.microsoftonline.com" on />
          <Item icon={<Users className="h-3.5 w-3.5" />}   label="MFA enforced via tenant CA policy" on />
          <Item icon={<Shield className="h-3.5 w-3.5" />}  label="Anonymous client action: RedirectToLoginPage" on />
        </Card>

        <Card className="col-span-12 lg:col-span-6 space-y-2">
          <CardTitle>Endpoints</CardTitle>
          <Endpoint label="Login"   path="/.auth/login/aad" />
          <Endpoint label="Logout"  path="/.auth/logout" />
          <Endpoint label="User"    path="/.auth/me" />
          <Endpoint label="Refresh" path="/.auth/refresh" />
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">{label}</div>
      <div className={'text-[12px] mt-0.5 text-(--color-ink) ' + (mono ? 'font-mono' : '')}>{value || '—'}</div>
    </div>
  );
}
function Item({ icon, label, on }: { icon: React.ReactNode; label: string; on?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-(--color-ink-dim)">
      <span className={on ? 'text-(--color-good)' : 'text-(--color-ink-mute)'}>{icon}</span>
      <span className="flex-1">{label}</span>
      <Badge tone={on ? 'good' : 'neutral'}>{on ? 'on' : 'off'}</Badge>
    </div>
  );
}
function Endpoint({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex items-center justify-between text-[12px] py-1.5 border-b border-(--color-line) last:border-0">
      <span className="text-(--color-ink-dim)">{label}</span>
      <a href={path} className="font-mono text-(--color-cyan) hover:underline">{path}</a>
    </div>
  );
}
