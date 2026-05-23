'use client';

import { useState } from 'react';
import { tables, type Table } from '@/lib/mock';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { ShieldCheck, ArrowRight, KeyRound, Database, User, Lock, Eye, Sparkles } from 'lucide-react';

export default function RlsPage() {
  const [active, setActive] = useState<Table>(tables[0]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
            <span>Govern</span><span>/</span><span className="text-(--color-ink-dim)">RLS Designer</span>
            <ComplianceBadge code="HDS §5.2.3" label="Per-tenant data isolation" />
          </div>
          <H1>RLS Designer</H1>
          <p className="text-(--color-ink-mute) text-[13px] mt-1.5 max-w-2xl">
            See exactly how a request becomes a row. Sovera traces the JWT claim through Postgres session GUCs into your USING/CHECK predicates — and explains it in plain English.
          </p>
        </div>
      </div>

      {/* Table picker */}
      <div className="flex gap-2 flex-wrap">
        {tables.map(t => (
          <button
            key={t.schema + t.name}
            onClick={() => setActive(t)}
            className={
              'px-3 py-1.5 rounded-md text-[12px] border transition-colors ' +
              (active === t
                ? 'border-(--color-cyan)/40 bg-(--color-cyan)/10 text-(--color-ink)'
                : 'border-(--color-line) text-(--color-ink-mute) hover:text-(--color-ink)')
            }
          >
            <span className="text-(--color-ink-mute) font-normal">{t.schema}.</span>{t.name}
          </button>
        ))}
      </div>

      {/* The flow */}
      <Card>
        <CardTitle>Request flow</CardTitle>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
          <FlowNode icon={User}      label="User"        sub="Entra OAuth"  detail="claims.sub, claims.tid" />
          <FlowArrow text="JWT" />
          <FlowNode icon={KeyRound}  label="APIM + DAB"  sub="validate-jwt" detail={`SET app.claims.tid = '${active.schema === 'audit' ? 'derived' : '7c2…b1'}'`} />
          <FlowArrow text="GUC" />
          <FlowNode icon={Database}  label="Postgres"    sub={`${active.schema}.${active.name}`} detail={`RLS: ${active.rls}`} highlight />
        </div>
      </Card>

      {/* Policy + explainer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Policy</CardTitle>
            <Button variant="ghost">Edit SQL</Button>
          </div>
          {active.policies.map(p => (
            <div key={p.name} className="border border-(--color-line) rounded-md p-4 bg-white/[0.02] mb-3">
              <div className="flex items-center gap-2 text-[12px] mb-3">
                <ShieldCheck className="h-3.5 w-3.5 text-(--color-good)" />
                <span className="text-(--color-ink) font-medium">{p.name}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) mb-1">USING</div>
              <pre className="text-[12px] font-mono text-(--color-ink-dim) overflow-x-auto mb-3">{p.using}</pre>
              {p.check && (
                <>
                  <div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) mb-1">CHECK</div>
                  <pre className="text-[12px] font-mono text-(--color-ink-dim) overflow-x-auto">{p.check}</pre>
                </>
              )}
            </div>
          ))}
        </Card>

        <Card className="bg-gradient-to-br from-(--color-violet)/8 to-(--color-cyan)/4">
          <CardTitle>
            <Sparkles className="h-3.5 w-3.5 text-(--color-violet) inline mr-1" /> In plain English
          </CardTitle>
          <ol className="space-y-3 text-[13px] text-(--color-ink-dim) leading-relaxed">
            <Step n={1} text={<>The caller's JWT must contain a <Code>tid</Code> claim — a UUID identifying their tenant.</>} />
            <Step n={2} text={<>APIM forwards the token to DAB, which sets <Code>app.claims.tid</Code> on the Postgres session.</>} />
            <Step n={3} text={<>Postgres reads that GUC via <Code>dl.tenant_id()</Code> and matches it against every row's <Code>tenant_id</Code> column.</>} />
            <Step n={4} text={<><strong className="text-(--color-ink)">{active.schema}.{active.name}</strong> additionally pins the database itself to one tenant via <Code>dl.this_tenant()</Code> — so even with a stolen token from another silo, the query returns zero rows.</>} />
            <Step n={5} text={<>Writes are blocked by the <Code>CHECK</Code> clause if the row's <Code>tenant_id</Code> doesn't match the caller.</>} />
          </ol>
          <div className="border-t border-(--color-line) pt-3 mt-2 flex items-center gap-2 text-[11px] text-(--color-ink-mute)">
            <Lock className="h-3 w-3" />
            Net effect: a tenant <em>cannot</em> address another tenant's data — physically, not by convention.
          </div>
        </Card>
      </div>

      {/* Test simulator */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Test policy</CardTitle>
          <Badge tone="cyan">simulator</Badge>
        </div>
        <p className="text-[12px] text-(--color-ink-mute) mb-3">
          Pick a fake JWT and watch which rows would be visible. (Reads are dry-run; nothing executes against your DB.)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ScenarioCard ok label="tenant=acme reads own row" detail="claims.tid = row.tenant_id" />
          <ScenarioCard label="tenant=acme reads nimbus's row" detail="USING fails → 0 rows" />
          <ScenarioCard label="no JWT" detail="assert_tenant() raises" warn />
        </div>
      </Card>
    </div>
  );
}

function FlowNode({ icon: Icon, label, sub, detail, highlight }: {
  icon: typeof User; label: string; sub: string; detail: string; highlight?: boolean;
}) {
  return (
    <div className={
      'rounded-[var(--radius)] p-4 border ' +
      (highlight
        ? 'border-(--color-cyan)/40 bg-gradient-to-br from-(--color-cyan)/10 to-(--color-violet)/5'
        : 'border-(--color-line) bg-white/[0.02]')
    }>
      <div className="flex items-center gap-2">
        <Icon className={'h-4 w-4 ' + (highlight ? 'text-(--color-cyan)' : 'text-(--color-ink-mute)')} />
        <span className="text-[13px] text-(--color-ink) font-medium">{label}</span>
      </div>
      <div className="text-[11px] text-(--color-ink-mute) mt-1">{sub}</div>
      <pre className="text-[11px] font-mono text-(--color-ink-dim) mt-2 truncate">{detail}</pre>
    </div>
  );
}

function FlowArrow({ text }: { text: string }) {
  return (
    <div className="hidden lg:flex flex-col items-center justify-center text-(--color-ink-mute) text-[10px]">
      <span className="uppercase tracking-wider">{text}</span>
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}

function Step({ n, text }: { n: number; text: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="h-5 w-5 shrink-0 rounded-full bg-(--color-violet)/20 text-(--color-violet) grid place-items-center text-[11px] font-semibold font-mono">{n}</span>
      <span>{text}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-(--color-ink) text-[11.5px] font-mono">{children}</code>;
}

function ScenarioCard({ label, detail, ok, warn }: { label: string; detail: string; ok?: boolean; warn?: boolean }) {
  return (
    <div className="border border-(--color-line) rounded-md p-3 bg-white/[0.02]">
      <div className="flex items-center gap-2 text-[12px] text-(--color-ink) mb-1">
        {ok ? <Eye className="h-3.5 w-3.5 text-(--color-good)" /> : warn ? <Lock className="h-3.5 w-3.5 text-(--color-warn)" /> : <Lock className="h-3.5 w-3.5 text-(--color-ink-mute)" />}
        {label}
      </div>
      <div className="text-[11px] text-(--color-ink-mute) font-mono">{detail}</div>
    </div>
  );
}
