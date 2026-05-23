'use client';

import { useState, useMemo } from 'react';
import { logs as mockLogs, type LogEvent } from '@/lib/mock';
import { useApiOrMock } from '@/lib/useApi';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { Pause, Play, Filter, Download } from 'lucide-react';

const TABS = ['All', 'API', 'DB', 'Auth', 'WAL'] as const;
type Tab = typeof TABS[number];

const matches = (tab: Tab, e: LogEvent) => {
  switch (tab) {
    case 'All':  return true;
    case 'API':  return e.source === 'apim' || e.source === 'functions';
    case 'DB':   return e.source === 'postgres' || e.source === 'dab';
    case 'Auth': return e.source === 'sentinel';
    case 'WAL':  return e.source === 'wps';
  }
};

const sourceTone: Record<LogEvent['source'], 'neutral' | 'violet' | 'cyan' | 'warn' | 'bad' | 'good'> = {
  apim: 'violet', dab: 'cyan', functions: 'violet', postgres: 'cyan', sentinel: 'warn', wps: 'good',
};

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('All');
  const [paused, setPaused] = useState(false);
  const { data: seed, live } = useApiOrMock<LogEvent[]>('/api/logs', mockLogs);
  const filtered = useMemo(() => seed.filter(e => matches(tab, e)), [tab, seed]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
            <span>Govern</span><span>/</span><span className="text-(--color-ink-dim)">Logs</span>
            <ComplianceBadge code="HIPAA §164.312(b)" label="Audit controls" />
            <span className={'ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ' + (live ? 'bg-(--color-good)/20 text-(--color-good)' : 'bg-(--color-ink-mute)/20 text-(--color-ink-mute)')}>
              <span className={'h-1.5 w-1.5 rounded-full ' + (live ? 'bg-(--color-good)' : 'bg-(--color-ink-mute)')} />{live ? 'live' : 'demo'}
            </span>
          </div>
          <H1>Logs</H1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setPaused(p => !p)}>
            {paused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Pause className="h-3.5 w-3.5" /> Pause stream</>}
          </Button>
          <Button variant="ghost"><Download className="h-3.5 w-3.5" /> Export</Button>
        </div>
      </div>

      <Card className="!p-0">
        <div className="px-4 pt-3 pb-2 flex items-center gap-1 border-b border-(--color-line)">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'px-3 py-1.5 rounded-md text-[12px] ' +
                (tab === t ? 'bg-white/[0.05] text-(--color-ink)' : 'text-(--color-ink-mute) hover:text-(--color-ink)')
              }
            >
              {t}
              {t === 'WAL' && <span className="ml-1.5 h-1.5 w-1.5 inline-block rounded-full bg-(--color-good) dot-pulse align-middle" />}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-[11px] text-(--color-ink-mute)">
            <Filter className="h-3 w-3" /> {filtered.length} events · {paused ? 'paused' : 'live'}
          </div>
        </div>

        <ul className="divide-y divide-(--color-line)">
          {filtered.map((l, i) => (
            <li key={i} className="px-5 py-2.5 flex items-center gap-3 text-[12px] hover:bg-white/[0.02]">
              <span className={
                'h-1.5 w-1.5 rounded-full ' +
                (l.level === 'error' ? 'bg-(--color-bad)' : l.level === 'warn' ? 'bg-(--color-warn)' : 'bg-(--color-good)')
              } />
              <span className="font-mono text-(--color-ink-mute) w-28 shrink-0">{l.ts}</span>
              <Badge tone={sourceTone[l.source]}>{l.source}</Badge>
              {l.tenant && <Badge tone="neutral">{l.tenant}</Badge>}
              <span className="text-(--color-ink-dim) font-mono truncate">{l.msg}</span>
            </li>
          ))}
        </ul>
      </Card>

      {tab === 'WAL' && (
        <Card>
          <CardTitle>WAL inspector</CardTitle>
          <p className="text-[12px] text-(--color-ink-mute) mb-3">
            Live Postgres replication stream — every row change, before it reaches a subscriber. Filter by tenant or schema.
          </p>
          <pre className="text-[11px] font-mono text-(--color-ink-dim) bg-black/30 rounded-md p-3 overflow-x-auto leading-relaxed">{`BEGIN 481923
table app.patients: INSERT: id[uuid]:'4a1…c8' tenant_id[uuid]:'7c2…b1' full_name[text]:'████' dob[date]:'████-██-██'
table audit.events: INSERT: ts[timestamptz]:'2026-…' op[text]:'INSERT' table_name[text]:'app.patients'
COMMIT 481923`}</pre>
        </Card>
      )}
    </div>
  );
}
