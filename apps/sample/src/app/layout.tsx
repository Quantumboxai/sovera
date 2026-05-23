import { SoveraProvider } from '@/lib/sovera';

export const metadata = { title: 'Sovera sample' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto' }}>
        <SoveraProvider>{children}</SoveraProvider>
      </body>
    </html>
  );
}
