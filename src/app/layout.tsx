import type { Metadata } from 'next';
import { SessionProvider } from '@/components/providers/session-provider';
import { TRPCProvider } from '@/components/providers/trpc-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'VibeFlow',
  description: 'AI-Native Output Engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          <TRPCProvider>{children}</TRPCProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
