/**
 * Offline Sync Hook
 * 
 * React hook that initializes the offline sync manager and provides
 * tRPC-based sync handlers for processing queued events.
 * 
 * Requirements: 8.3
 */

'use client';

import { useEffect, useCallback, useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  initializeOfflineSyncManager,
  cleanupOfflineSyncManager,
  registerSyncHandler,
  syncOfflineQueue,
  hasQueuedActions,
  getQueueLength,
  isOnline,
  isSyncing,
  type OfflineSyncHandler,
  type TimelineEventPayloadType,
  type BlockEventPayloadType,
  type InterruptionEventPayloadType,
} from '@/lib/offline-queue';

export interface UseOfflineSyncResult {
  /** Whether the sync manager is initialized */
  isInitialized: boolean;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Whether the browser is online */
  isOnline: boolean;
  /** Number of queued actions */
  queueLength: number;
  /** Whether there are queued actions */
  hasQueuedActions: boolean;
  /** Manually trigger a sync */
  triggerSync: () => Promise<boolean>;
}

/**
 * Hook to manage offline sync functionality
 * 
 * This hook:
 * 1. Initializes the offline sync manager on mount
 * 2. Registers tRPC-based sync handlers
 * 3. Cleans up on unmount
 * 4. Provides sync status and manual sync trigger
 */
export function useOfflineSync(): UseOfflineSyncResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [online, setOnline] = useState(true);
  const [queueLen, setQueueLen] = useState(0);

  // tRPC mutations for syncing events
  const createEventMutation = trpc.timeline.createEvent.useMutation();
  const createBlockEventMutation = trpc.timeline.createBlockEvent.useMutation();
  const createInterruptionEventMutation = trpc.timeline.createInterruptionEvent.useMutation();

  // Create sync handlers using tRPC mutations
  const createSyncHandlers = useCallback((): OfflineSyncHandler => {
    return {
      syncTimelineEvent: async (payload: TimelineEventPayloadType): Promise<boolean> => {
        try {
          await createEventMutation.mutateAsync({
            type: payload.type as 'pomodoro' | 'distraction' | 'break' | 'scheduled_task' | 'activity_log' | 'block' | 'state_change' | 'interruption' | 'idle',
            startTime: new Date(payload.startTime),
            endTime: payload.endTime ? new Date(payload.endTime) : undefined,
            duration: payload.duration,
            title: payload.title,
            metadata: payload.metadata,
            source: payload.source,
          });
          return true;
        } catch (error) {
          console.error('Failed to sync timeline event:', error);
          return false;
        }
      },

      syncBlockEvent: async (payload: BlockEventPayloadType): Promise<boolean> => {
        try {
          await createBlockEventMutation.mutateAsync({
            url: payload.url,
            timestamp: new Date(payload.timestamp),
            blockType: payload.blockType,
            userAction: payload.userAction,
            pomodoroId: payload.pomodoroId,
          });
          return true;
        } catch (error) {
          console.error('Failed to sync block event:', error);
          return false;
        }
      },

      syncInterruptionEvent: async (payload: InterruptionEventPayloadType): Promise<boolean> => {
        try {
          await createInterruptionEventMutation.mutateAsync({
            timestamp: new Date(payload.timestamp),
            duration: payload.duration,
            source: payload.source,
            pomodoroId: payload.pomodoroId,
            details: payload.details,
          });
          return true;
        } catch (error) {
          console.error('Failed to sync interruption event:', error);
          return false;
        }
      },
    };
  }, [createEventMutation, createBlockEventMutation, createInterruptionEventMutation]);

  // Update queue length periodically
  const updateQueueLength = useCallback(() => {
    setQueueLen(getQueueLength());
  }, []);

  // Manual sync trigger
  const triggerSync = useCallback(async (): Promise<boolean> => {
    if (syncInProgress) return false;
    
    setSyncInProgress(true);
    try {
      const result = await syncOfflineQueue();
      updateQueueLength();
      return result;
    } finally {
      setSyncInProgress(false);
    }
  }, [syncInProgress, updateQueueLength]);

  // Initialize sync manager on mount
  useEffect(() => {
    // Register sync handlers
    const handlers = createSyncHandlers();
    registerSyncHandler(handlers);

    // Initialize the sync manager
    initializeOfflineSyncManager();
    setIsInitialized(true);

    // Set initial online status
    setOnline(isOnline());
    updateQueueLength();

    // Listen for online/offline events to update state
    const handleOnline = () => {
      setOnline(true);
      updateQueueLength();
    };
    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodically update queue length
    const interval = setInterval(updateQueueLength, 5000);

    // Cleanup on unmount
    return () => {
      cleanupOfflineSyncManager();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      setIsInitialized(false);
    };
  }, [createSyncHandlers, updateQueueLength]);

  // Update syncing state
  useEffect(() => {
    const checkSyncing = () => {
      setSyncInProgress(isSyncing());
    };
    
    const interval = setInterval(checkSyncing, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    isInitialized,
    isSyncing: syncInProgress,
    isOnline: online,
    queueLength: queueLen,
    hasQueuedActions: queueLen > 0,
    triggerSync,
  };
}

export default useOfflineSync;
