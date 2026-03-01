import type { Metadata } from 'next';
import { SessionProvider } from '@/components/providers/session-provider';
import { TRPCProvider } from '@/components/providers/trpc-provider';
import { TraySyncProvider } from '@/components/providers/tray-sync-provider';
import { SidebarProvider } from '@/contexts/sidebar-context';
import { ChatProvider, ChatFAB, ChatPanel } from '@/components/chat';
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
          <TRPCProvider>
            <TraySyncProvider>
              <SidebarProvider>
                <ChatProvider>
                  {children}
                  <ChatFAB />
                  <ChatPanel />
                </ChatProvider>
              </SidebarProvider>
            </TraySyncProvider>
          </TRPCProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
