'use client';

import { useEffect, useState } from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';

type Me = { user_id?: string; user_claims?: Array<{ typ: string; val: string }> };

export function UserBadge() {
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    fetch('/.auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((arr: Me[] | null) => {
        const u = arr?.[0];
        if (!u) { setMe({ name: 'Signed in', email: '' }); return; }
        const claims = u.user_claims ?? [];
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const c = claims.find(c => c.typ === k);
            if (c?.val) return c.val;
          }
          return '';
        };
        const email = u.user_id ?? get('preferred_username', 'email', 'upn');
        const name = get('name', 'given_name') || email.split('@')[0];
        setMe({ name, email });
      })
      .catch(() => setMe({ name: 'Signed in', email: '' }));
  }, []);

  if (!me) {
    return <div className="h-12 mx-2 rounded-md bg-white/[0.03] animate-pulse" />;
  }

  const initial = (me.name || me.email || '?').slice(0, 1).toUpperCase();

  return (
    <div className="lift glass w-full rounded-[var(--radius)] px-3 py-2.5 flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-md bg-gradient-to-br from-(--color-violet) to-(--color-cyan) grid place-items-center text-[12px] font-semibold text-black">
        {initial || <UserIcon className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-(--color-ink) truncate">{me.name}</div>
        <div className="text-[11px] text-(--color-ink-mute) truncate">{me.email || 'Microsoft Entra'}</div>
      </div>
      <a
        href="/.auth/logout?post_logout_redirect_uri=/"
        title="Sign out"
        className="h-7 w-7 grid place-items-center rounded-md text-(--color-ink-mute) hover:text-(--color-ink) hover:bg-white/[0.05]"
      >
        <LogOut className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
