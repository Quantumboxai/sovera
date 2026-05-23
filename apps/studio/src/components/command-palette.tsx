'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Database, Terminal, Building2, Radio, ShieldCheck,
  ScrollText, HardDrive, LayoutDashboard, Plus,
} from 'lucide-react';
import { useSovera } from '@/lib/sovera';

type Action = {
  id: string; label: string; group: string; icon: typeof Database; run: () => void;
};

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen } = useSovera();
  const [q, setQ] = useState('');

  const actions: Action[] = useMemo(() => [
    { id: 'go-overview', group: 'Navigate', label: 'Go to Overview',    icon: LayoutDashboard, run: () => router.push('/overview') },
    { id: 'go-tables',   group: 'Navigate', label: 'Go to Tables',      icon: Database,        run: () => router.push('/tables') },
    { id: 'go-sql',      group: 'Navigate', label: 'Open SQL editor',   icon: Terminal,        run: () => router.push('/sql') },
    { id: 'go-storage',  group: 'Navigate', label: 'Browse Storage',    icon: HardDrive,       run: () => router.push('/storage') },
    { id: 'go-realtime', group: 'Navigate', label: 'View Realtime',     icon: Radio,           run: () => router.push('/realtime') },
    { id: 'go-rls',      group: 'Navigate', label: 'Open RLS Designer', icon: ShieldCheck,     run: () => router.push('/rls') },
    { id: 'go-logs',     group: 'Navigate', label: 'Tail Logs',         icon: ScrollText,      run: () => router.push('/logs') },
    { id: 'go-tenants',  group: 'Navigate', label: 'Manage Tenants',    icon: Building2,       run: () => router.push('/tenants') },
    { id: 'new-tenant',  group: 'Actions',  label: 'New tenant…',       icon: Plus,            run: () => router.push('/tenants?new=1') },
    { id: 'new-table',   group: 'Actions',  label: 'New table…',        icon: Plus,            run: () => router.push('/tables?new=1') },
  ], [router]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter(a => a.label.toLowerCase().includes(needle) || a.group.toLowerCase().includes(needle));
  }, [q, actions]);

  useEffect(() => {
    if (!paletteOpen) setQ('');
  }, [paletteOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paletteOpen && e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen]);

  if (!paletteOpen) return null;

  const grouped = filtered.reduce<Record<string, Action[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a); return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" onClick={() => setPaletteOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-xl glass rounded-[var(--radius-lg)] overflow-hidden ring-1 ring-(--color-line-2)"
      >
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Type a command or search…"
          className="w-full bg-transparent px-4 py-3.5 text-[14px] text-(--color-ink) placeholder:text-(--color-ink-mute) outline-none border-b border-(--color-line)"
        />
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-1.5">
              <div className="px-3 py-1 text-[10px] tracking-wider uppercase text-(--color-ink-mute)">{group}</div>
              {items.map(a => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    onClick={() => { a.run(); setPaletteOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-(--color-ink-dim) hover:text-(--color-ink) hover:bg-white/[0.04]"
                  >
                    <Icon className="h-4 w-4 text-(--color-ink-mute)" />
                    <span className="flex-1 text-left">{a.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-(--color-ink-mute)" />
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-(--color-ink-mute)">No actions match "{q}".</div>
          )}
        </div>
        <div className="px-3 py-2 border-t border-(--color-line) flex items-center gap-3 text-[10px] text-(--color-ink-mute)">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
