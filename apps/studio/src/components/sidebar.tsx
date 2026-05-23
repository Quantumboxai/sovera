'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Database, Terminal, HardDrive, Radio,
  ShieldCheck, ScrollText, Building2, Settings, Sparkles,
  KeyRound, Code2, TerminalSquare, Sparkles as Vec, Lock,
  BadgeCheck, UsersRound, Globe2, Zap,
} from 'lucide-react';
import { TenantSwitcher } from './tenant-switcher';
import { UserBadge } from './user-badge';

type Item = { href: string; label: string; icon: typeof Database; badge?: string };
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: 'Project',
    items: [
      { href: '/overview',  label: 'Overview',  icon: LayoutDashboard },
      { href: '/tables',    label: 'Database',  icon: Database },
      { href: '/auth',      label: 'Auth',      icon: Lock },
      { href: '/storage',   label: 'Storage',   icon: HardDrive },
      { href: '/functions', label: 'Functions', icon: Zap },
      { href: '/realtime',  label: 'Realtime',  icon: Radio },
      { href: '/vector',    label: 'Vector / AI', icon: Vec },
    ],
  },
  {
    title: 'Developer',
    items: [
      { href: '/sql',         label: 'SQL Editor', icon: Terminal },
      { href: '/api-keys',    label: 'API Keys',   icon: KeyRound },
      { href: '/mcp',         label: 'MCP Server', icon: TerminalSquare, badge: 'new' as const },
      { href: '/sdk',         label: 'SDK Setup',  icon: Code2 },
      { href: '/logs',        label: 'Logs',       icon: ScrollText },
    ],
  },
  {
    title: 'Enterprise',
    items: [
      { href: '/compliance', label: 'Compliance',     icon: BadgeCheck },
      { href: '/rls',        label: 'RLS Designer',   icon: ShieldCheck },
      { href: '/rbac',       label: 'RBAC',           icon: UsersRound },
      { href: '/tenants',    label: 'Tenants',        icon: Building2 },
      { href: '/residency',  label: 'Data residency', icon: Globe2 },
      { href: '/settings',   label: 'Settings',       icon: Settings },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden md:flex w-[244px] shrink-0 flex-col border-r border-(--color-line) bg-(--color-bg-1)/60 backdrop-blur">
      <div className="px-5 pt-5 pb-4">
        <Link href="/overview" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-(--color-violet) to-(--color-cyan)" />
          <div>
            <div className="brand-text text-[16px] font-semibold tracking-tight">Sovera</div>
            <div className="text-[10px] text-(--color-ink-mute) tracking-wider uppercase">Studio</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-2.5 overflow-y-auto">
        {groups.map(g => (
          <div key={g.title} className="mb-4">
            <div className="px-3 py-1.5 text-[10px] tracking-wider uppercase text-(--color-ink-mute)">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map(it => {
                const active = path?.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href as never}
                      className={
                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ' +
                        (active
                          ? 'bg-white/[0.04] text-(--color-ink) ring-1 ring-(--color-line-2)'
                          : 'text-(--color-ink-dim) hover:text-(--color-ink) hover:bg-white/[0.03]')
                      }
                    >
                      <Icon className={'h-4 w-4 ' + (active ? 'text-(--color-cyan)' : 'text-(--color-ink-mute)')} />
                      <span>{it.label}</span>
                      {'badge' in it && it.badge && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-(--color-violet)/20 text-(--color-violet)">{it.badge}</span>
                      )}
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-(--color-cyan) dot-pulse" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-2.5 pb-2.5">
        <div className="mb-2.5 mx-2 p-3 rounded-[var(--radius)] border border-(--color-line) bg-gradient-to-br from-(--color-violet)/10 to-(--color-cyan)/5">
          <div className="flex items-center gap-1.5 text-[11px] text-(--color-ink-dim)">
            <Sparkles className="h-3.5 w-3.5 text-(--color-violet)" /> Sovera AI
          </div>
          <div className="text-[11px] text-(--color-ink-mute) mt-1 leading-snug">
            Ask "explain this policy" or "generate a migration" — coming soon.
          </div>
        </div>
        <TenantSwitcher />
        <div className="mt-2">
          <UserBadge />
        </div>
      </div>
    </aside>
  );
}
