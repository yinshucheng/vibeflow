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
import { useSession } from 'next-auth/react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import { OfflineSyncProvider } from './offline-sync-provider';

function isUnauthorizedError(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    error.data?.code === 'UNAUTHORIZED'
  );
}

function redirectToLogin() {
  const currentPath = window.location.pathname;
  // Don't redirect if already on auth pages (prevents infinite loop)
  if (currentPath === '/login' || currentPath === '/register') return;
  const loginUrl = `/login?callbackUrl=${encodeURIComponent(currentPath)}`;
  window.location.href = loginUrl;
}

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Browser should use relative path
    return '';
  }
  // SSR should use localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  // useSession() keeps the NextAuth session provider active
  useSession();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (isUnauthorizedError(error)) {
              redirectToLogin();
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            if (isUnauthorizedError(error)) {
              redirectToLogin();
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000, // 5 seconds
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (isUnauthorizedError(error)) return false;
              return failureCount < 3;
            },
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
          // Auth is handled via NextAuth session cookie (sent automatically by browser)
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
