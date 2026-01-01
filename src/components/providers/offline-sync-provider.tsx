/**
 * Offline Sync Provider
 * 
 * React context provider that initializes the offline sync manager
 * and provides sync status to child components.
 * 
 * Requirements: 8.3
 */

'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useOfflineSync, type UseOfflineSyncResult } from '@/hooks/use-offline-sync';

// Create context with default values
const OfflineSyncContext = createContext<UseOfflineSyncResult>({
  isInitialized: false,
  isSyncing: false,
  isOnline: true,
  queueLength: 0,
  hasQueuedActions: false,
  triggerSync: async () => false,
});

/**
 * Hook to access offline sync context
 */
export function useOfflineSyncContext(): UseOfflineSyncResult {
  return useContext(OfflineSyncContext);
}

interface OfflineSyncProviderProps {
  children: ReactNode;
}

/**
 * Provider component that initializes offline sync functionality
 * 
 * This should be placed inside TRPCProvider to have access to tRPC mutations.
 */
export function OfflineSyncProvider({ children }: OfflineSyncProviderProps): React.ReactElement {
  const offlineSync = useOfflineSync();

  return (
    <OfflineSyncContext.Provider value={offlineSync}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export default OfflineSyncProvider;
