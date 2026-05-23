'use client';

import { createClient, type SoveraClient } from '@sovera/client';
import { createContext, useContext, useMemo } from 'react';

const Ctx = createContext<SoveraClient | null>(null);

export function SoveraProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(
    () =>
      createClient({
        apimUrl: process.env.NEXT_PUBLIC_APIM_URL!,
        authority: process.env.NEXT_PUBLIC_AUTHORITY!,
        clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
      }),
    [],
  );
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useSovera(): SoveraClient {
  const c = useContext(Ctx);
  if (!c) throw new Error('Wrap your app in <SoveraProvider>');
  return c;
}
