'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { tenants, type Tenant } from './mock';

type Env = 'production' | 'staging' | 'dev';

type Ctx = {
  tenant: Tenant;
  setTenantSlug: (slug: string) => void;
  impersonating: boolean;
  env: Env;
  setEnv: (e: Env) => void;
  tenants: Tenant[];
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
};

const SoveraCtx = createContext<Ctx | null>(null);

export function SoveraProvider({ children }: { children: ReactNode }) {
  const [tenantSlug, setTenantSlug] = useState('acme');
  const [env, setEnv] = useState<Env>('production');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const tenant = useMemo(() => tenants.find(t => t.slug === tenantSlug) ?? tenants[0], [tenantSlug]);
  // "impersonating" = looking at a real customer's data through their lens.
  // We badge it visually so it's never invisible.
  const impersonating = env === 'production' && tenant.slug !== 'acme';

  return (
    <SoveraCtx.Provider value={{ tenant, setTenantSlug, impersonating, env, setEnv, tenants, paletteOpen, setPaletteOpen }}>
      {children}
    </SoveraCtx.Provider>
  );
}

export function useSovera() {
  const v = useContext(SoveraCtx);
  if (!v) throw new Error('useSovera must be used inside <SoveraProvider>');
  return v;
}
