import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sovera Studio',
  description: 'The sovereign control plane for your data — HDS/HIPAA-grade, fast, beautiful.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen relative">{children}</body>
    </html>
  );
}
