'use client';

import { useState } from 'react';
import { ChevronsUpDown, Check, Shield } from 'lucide-react';
import { useSovera } from '@/lib/sovera';
import { Badge } from './ui';

const tierTone = { starter: 'neutral', pro: 'violet', enterprise: 'cyan' } as const;

export function TenantSwitcher() {
  const [open, setOpen] = useState(false);
  const { tenant, setTenantSlug, tenants, impersonating } = useSovera();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="lift glass w-full rounded-[var(--radius)] px-3 py-2.5 text-left flex items-center gap-2.5"
      >
        <div className="h-8 w-8 rounded-md bg-gradient-to-br from-(--color-violet) to-(--color-cyan) grid place-items-center text-[12px] font-semibold text-black">
          {tenant.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-(--color-ink) truncate flex items-center gap-1.5">
            {tenant.name}
            {impersonating && <Shield className="h-3 w-3 text-(--color-warn)" />}
          </div>
          <div className="text-[11px] text-(--color-ink-mute) flex items-center gap-1.5">
            <Badge tone={tierTone[tenant.tier]}>{tenant.tier}</Badge>
            <span>{tenant.region}</span>
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-(--color-ink-mute)" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 bottom-[calc(100%+8px)] left-0 right-0 glass rounded-[var(--radius)] p-1.5 max-h-[60vh] overflow-auto">
            {tenants.map(t => (
              <button
                key={t.slug}
                onClick={() => { setTenantSlug(t.slug); setOpen(false); }}
                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-white/[0.04] flex items-center gap-2.5"
              >
                <div className="h-7 w-7 rounded-md bg-gradient-to-br from-(--color-violet) to-(--color-cyan) grid place-items-center text-[11px] font-semibold text-black">
                  {t.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-(--color-ink) truncate">{t.name}</div>
                  <div className="text-[11px] text-(--color-ink-mute) truncate">{t.slug}.sovera.cloud</div>
                </div>
                <Badge tone={tierTone[t.tier]}>{t.tier}</Badge>
                {t.slug === tenant.slug && <Check className="h-4 w-4 text-(--color-cyan)" />}
              </button>
            ))}
            <div className="border-t border-(--color-line) mt-1.5 pt-1.5 px-2 py-1.5 text-[11px] text-(--color-ink-mute)">
              Switching tenants is logged in <span className="text-(--color-ink-dim)">audit.events</span>.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
