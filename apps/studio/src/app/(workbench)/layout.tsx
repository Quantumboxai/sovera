import type { ReactNode } from 'react';
import { SoveraProvider } from '@/lib/sovera';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { CommandPalette } from '@/components/command-palette';

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return (
    <SoveraProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1400px] px-6 py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
      <CommandPalette />
    </SoveraProvider>
  );
}
