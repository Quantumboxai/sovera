'use client';

import { Search, Command, ShieldAlert, Activity } from 'lucide-react';
import { useEffect } from 'react';
import { useSovera } from '@/lib/sovera';
import { Badge } from './ui';

export function Topbar() {
  const { env, setEnv, impersonating, setPaletteOpen } = useSovera();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  return (
    <header className="h-14 shrink-0 border-b border-(--color-line) bg-(--color-bg-1)/60 backdrop-blur flex items-center gap-3 px-5">
      <button
        onClick={() => setPaletteOpen(true)}
        className="lift glass h-9 flex items-center gap-2.5 px-3 rounded-md text-[13px] text-(--color-ink-mute) min-w-[280px]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search tables, run actions…</span>
        <kbd className="text-[10px] text-(--color-ink-mute) flex items-center gap-0.5"><Command className="h-3 w-3" />K</kbd>
      </button>

      <div className="flex-1" />

      {impersonating && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-(--color-warn)/10 text-(--color-warn) text-[12px]">
          <ShieldAlert className="h-3.5 w-3.5" /> Impersonating — actions are audited
        </div>
      )}

      <div className="hidden md:flex items-center text-[12px]">
        {(['dev', 'staging', 'production'] as const).map(e => (
          <button
            key={e}
            onClick={() => setEnv(e)}
            className={
              'px-2.5 py-1.5 first:rounded-l-md last:rounded-r-md border border-(--color-line) -ml-px ' +
              (env === e ? 'bg-white/[0.05] text-(--color-ink)' : 'text-(--color-ink-mute) hover:text-(--color-ink-dim)')
            }
          >
            {e}
          </button>
        ))}
      </div>

      <div className="hidden md:flex items-center gap-1.5 text-[11px] text-(--color-ink-mute)">
        <Activity className="h-3 w-3 text-(--color-good)" />
        <span>fr-c · healthy</span>
        <Badge tone="good">99.99%</Badge>
      </div>

      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-(--color-violet) to-(--color-cyan) grid place-items-center text-[11px] font-semibold text-black">
        DC
      </div>
    </header>
  );
}
