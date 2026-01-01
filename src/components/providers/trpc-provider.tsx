'use client';

/**
 * tRPC Provider Component
 * 
 * Wraps the application with tRPC and React Query providers.
 * Also initializes the offline sync manager for event queuing.
 * 
 * Requirements: 8.3
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import { OfflineSyncProvider } from './offline-sync-provider';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser should use relative path
    return '';
  }
  // SSR should use localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000, // 5 seconds
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers() {
            // Include dev user email header if in dev mode
            const headers: Record<string, string> = {};
            
            if (process.env.NODE_ENV === 'development') {
              const devEmail = localStorage.getItem('dev-user-email');
              if (devEmail) {
                headers['x-dev-user-email'] = devEmail;
              }
            }
            
            return headers;
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <OfflineSyncProvider>{children}</OfflineSyncProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
