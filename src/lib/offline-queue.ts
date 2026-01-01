/**
 * Offline Event Queue
 * 
 * Provides localStorage-based queuing for timeline events when offline.
 * Events are persisted locally and synced when network connection is restored.
 * 
 * Requirements: 8.3
 */

import { z } from 'zod';

// Local Storage Key
const OFFLINE_QUEUE_KEY = 'vibeflow_offline_queue';

// Event types that can be queued
export const QueuedEventType = z.enum([
  'timeline_event',
  'block_event',
  'interruption_event',
]);

export type QueuedEventTypeValue = z.infer<typeof QueuedEventType>;

// Schema for timeline events
export const TimelineEventPayload = z.object({
  type: z.string(),
  startTime: z.string(), // ISO string
  endTime: z.string().optional(),
  duration: z.number().min(0),
  title: z.string(),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().default('browser_sentinel'),
});

// Schema for block events
export const BlockEventPayload = z.object({
  url: z.string(),
  timestamp: z.string(), // ISO string
  blockType: z.enum(['hard_block', 'soft_block']),
  userAction: z.enum(['proceeded', 'returned']).optional(),
  pomodoroId: z.string().optional(),
});

// Schema for interruption events
export const InterruptionEventPayload = z.object({
  timestamp: z.string(), // ISO string
  duration: z.number().min(0),
  source: z.enum(['blocked_site', 'tab_switch', 'idle', 'manual']),
  pomodoroId: z.string(),
  details: z.object({
    url: z.string().optional(),
    idleSeconds: z.number().optional(),
  }).optional(),
});

export type TimelineEventPayloadType = z.infer<typeof TimelineEventPayload>;
export type BlockEventPayloadType = z.infer<typeof BlockEventPayload>;
export type InterruptionEventPayloadType = z.infer<typeof InterruptionEventPayload>;

/**
 * Queued action structure stored in localStorage
 */
export interface QueuedAction {
  id: string;
  eventType: QueuedEventTypeValue;
  payload: TimelineEventPayloadType | BlockEventPayloadType | InterruptionEventPayloadType;
  queuedAt: string; // ISO string
  retryCount: number;
}

/**
 * Sync result for a single action
 */
export interface SyncResult {
  id: string;
  success: boolean;
  error?: string;
}

/**
 * Sync callback type for processing queued events
 */
export type SyncCallback = (action: QueuedAction) => Promise<boolean>;

// Generate unique ID for queued actions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the current offline queue from localStorage
 */
export function getOfflineQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!stored) return [];
    
    const queue = JSON.parse(stored);
    if (!Array.isArray(queue)) return [];
    
    return queue;
  } catch (error) {
    console.error('Failed to read offline queue:', error);
    return [];
  }
}

/**
 * Save the offline queue to localStorage
 */
export function saveOfflineQueue(queue: QueuedAction[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to save offline queue:', error);
  }
}

/**
 * Clear the offline queue
 */
export function clearOfflineQueue(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (error) {
    console.error('Failed to clear offline queue:', error);
  }
}

/**
 * Add a timeline event to the offline queue
 * Requirements: 8.3
 */
export function queueTimelineEvent(payload: TimelineEventPayloadType): QueuedAction {
  const validated = TimelineEventPayload.parse(payload);
  
  const action: QueuedAction = {
    id: generateId(),
    eventType: 'timeline_event',
    payload: validated,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  };
  
  const queue = getOfflineQueue();
  queue.push(action);
  saveOfflineQueue(queue);
  
  return action;
}

/**
 * Add a block event to the offline queue
 * Requirements: 8.3
 */
export function queueBlockEvent(payload: BlockEventPayloadType): QueuedAction {
  const validated = BlockEventPayload.parse(payload);
  
  const action: QueuedAction = {
    id: generateId(),
    eventType: 'block_event',
    payload: validated,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  };
  
  const queue = getOfflineQueue();
  queue.push(action);
  saveOfflineQueue(queue);
  
  return action;
}

/**
 * Add an interruption event to the offline queue
 * Requirements: 8.3
 */
export function queueInterruptionEvent(payload: InterruptionEventPayloadType): QueuedAction {
  const validated = InterruptionEventPayload.parse(payload);
  
  const action: QueuedAction = {
    id: generateId(),
    eventType: 'interruption_event',
    payload: validated,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  };
  
  const queue = getOfflineQueue();
  queue.push(action);
  saveOfflineQueue(queue);
  
  return action;
}

/**
 * Remove a specific action from the queue
 */
export function removeFromQueue(actionId: string): void {
  const queue = getOfflineQueue();
  const filtered = queue.filter(action => action.id !== actionId);
  saveOfflineQueue(filtered);
}

/**
 * Update retry count for an action
 */
export function incrementRetryCount(actionId: string): void {
  const queue = getOfflineQueue();
  const updated = queue.map(action => {
    if (action.id === actionId) {
      return { ...action, retryCount: action.retryCount + 1 };
    }
    return action;
  });
  saveOfflineQueue(updated);
}

/**
 * Get the number of queued actions
 */
export function getQueueLength(): number {
  return getOfflineQueue().length;
}

/**
 * Check if there are any queued actions
 */
export function hasQueuedActions(): boolean {
  return getQueueLength() > 0;
}

/**
 * Process the offline queue with a sync callback
 * Returns results for each action processed
 * Requirements: 8.3
 */
export async function processOfflineQueue(
  syncCallback: SyncCallback,
  maxRetries: number = 3
): Promise<SyncResult[]> {
  const queue = getOfflineQueue();
  const results: SyncResult[] = [];
  const remainingQueue: QueuedAction[] = [];
  
  for (const action of queue) {
    try {
      const success = await syncCallback(action);
      
      if (success) {
        results.push({ id: action.id, success: true });
      } else {
        // Sync failed, check retry count
        if (action.retryCount < maxRetries) {
          remainingQueue.push({
            ...action,
            retryCount: action.retryCount + 1,
          });
          results.push({ 
            id: action.id, 
            success: false, 
            error: 'Sync failed, will retry' 
          });
        } else {
          // Max retries exceeded, discard
          results.push({ 
            id: action.id, 
            success: false, 
            error: 'Max retries exceeded' 
          });
        }
      }
    } catch (error) {
      // Error during sync, check retry count
      if (action.retryCount < maxRetries) {
        remainingQueue.push({
          ...action,
          retryCount: action.retryCount + 1,
        });
        results.push({ 
          id: action.id, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      } else {
        results.push({ 
          id: action.id, 
          success: false, 
          error: 'Max retries exceeded' 
        });
      }
    }
  }
  
  // Save remaining queue (failed items that can still retry)
  saveOfflineQueue(remainingQueue);
  
  return results;
}

/**
 * Check if the browser is online
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Get the localStorage key (for testing)
 */
export function getOfflineQueueKey(): string {
  return OFFLINE_QUEUE_KEY;
}


// ============================================================================
// Network Recovery and Sync Manager
// Requirements: 8.3 - Sync when connection is restored
// ============================================================================

/**
 * Sync manager state
 */
interface SyncManagerState {
  isInitialized: boolean;
  isSyncing: boolean;
  lastSyncAttempt: Date | null;
  onlineHandler: (() => void) | null;
}

const syncManagerState: SyncManagerState = {
  isInitialized: false,
  isSyncing: false,
  lastSyncAttempt: null,
  onlineHandler: null,
};

/**
 * Sync handler type - provided by the application to handle actual API calls
 */
export type OfflineSyncHandler = {
  syncTimelineEvent: (payload: TimelineEventPayloadType) => Promise<boolean>;
  syncBlockEvent: (payload: BlockEventPayloadType) => Promise<boolean>;
  syncInterruptionEvent: (payload: InterruptionEventPayloadType) => Promise<boolean>;
};

let registeredSyncHandler: OfflineSyncHandler | null = null;

/**
 * Register the sync handler for processing queued events
 * This should be called once when the app initializes
 */
export function registerSyncHandler(handler: OfflineSyncHandler): void {
  registeredSyncHandler = handler;
}

/**
 * Get the registered sync handler
 */
export function getSyncHandler(): OfflineSyncHandler | null {
  return registeredSyncHandler;
}

/**
 * Process a single queued action using the registered handler
 */
async function processSingleAction(action: QueuedAction): Promise<boolean> {
  if (!registeredSyncHandler) {
    console.warn('No sync handler registered');
    return false;
  }
  
  try {
    switch (action.eventType) {
      case 'timeline_event':
        return await registeredSyncHandler.syncTimelineEvent(
          action.payload as TimelineEventPayloadType
        );
      case 'block_event':
        return await registeredSyncHandler.syncBlockEvent(
          action.payload as BlockEventPayloadType
        );
      case 'interruption_event':
        return await registeredSyncHandler.syncInterruptionEvent(
          action.payload as InterruptionEventPayloadType
        );
      default:
        console.warn('Unknown event type:', action.eventType);
        return false;
    }
  } catch (error) {
    console.error('Error processing queued action:', error);
    return false;
  }
}

/**
 * Sync all queued events
 * Returns true if all events were synced successfully
 */
export async function syncOfflineQueue(): Promise<boolean> {
  if (syncManagerState.isSyncing) {
    console.log('Sync already in progress');
    return false;
  }
  
  if (!isOnline()) {
    console.log('Cannot sync: offline');
    return false;
  }
  
  if (!hasQueuedActions()) {
    return true; // Nothing to sync
  }
  
  syncManagerState.isSyncing = true;
  syncManagerState.lastSyncAttempt = new Date();
  
  try {
    const results = await processOfflineQueue(processSingleAction);
    const allSuccess = results.every(r => r.success);
    
    if (!allSuccess) {
      console.log('Some events failed to sync:', results.filter(r => !r.success));
    }
    
    return allSuccess;
  } finally {
    syncManagerState.isSyncing = false;
  }
}

/**
 * Handle online event - triggered when network connection is restored
 */
function handleOnline(): void {
  console.log('Network connection restored, syncing offline queue...');
  
  // Add a small delay to ensure connection is stable
  setTimeout(() => {
    syncOfflineQueue().then(success => {
      if (success) {
        console.log('Offline queue synced successfully');
      } else {
        console.log('Some items in offline queue failed to sync');
      }
    }).catch(error => {
      console.error('Error syncing offline queue:', error);
    });
  }, 1000);
}

/**
 * Initialize the offline sync manager
 * Sets up the online event listener for automatic sync
 * Requirements: 8.3
 */
export function initializeOfflineSyncManager(): void {
  if (typeof window === 'undefined') return;
  
  if (syncManagerState.isInitialized) {
    console.log('Offline sync manager already initialized');
    return;
  }
  
  // Store the handler reference for cleanup
  syncManagerState.onlineHandler = handleOnline;
  
  // Listen for online event
  window.addEventListener('online', handleOnline);
  
  syncManagerState.isInitialized = true;
  console.log('Offline sync manager initialized');
  
  // If we're online and have queued items, sync immediately
  if (isOnline() && hasQueuedActions()) {
    handleOnline();
  }
}

/**
 * Cleanup the offline sync manager
 * Removes event listeners
 */
export function cleanupOfflineSyncManager(): void {
  if (typeof window === 'undefined') return;
  
  if (syncManagerState.onlineHandler) {
    window.removeEventListener('online', syncManagerState.onlineHandler);
    syncManagerState.onlineHandler = null;
  }
  
  syncManagerState.isInitialized = false;
  console.log('Offline sync manager cleaned up');
}

/**
 * Check if sync manager is initialized
 */
export function isSyncManagerInitialized(): boolean {
  return syncManagerState.isInitialized;
}

/**
 * Check if sync is currently in progress
 */
export function isSyncing(): boolean {
  return syncManagerState.isSyncing;
}

/**
 * Get the last sync attempt time
 */
export function getLastSyncAttempt(): Date | null {
  return syncManagerState.lastSyncAttempt;
}

/**
 * Smart queue function that tries to sync immediately if online,
 * otherwise queues for later
 */
export async function queueOrSyncTimelineEvent(
  payload: TimelineEventPayloadType
): Promise<{ queued: boolean; synced: boolean }> {
  if (isOnline() && registeredSyncHandler) {
    try {
      const success = await registeredSyncHandler.syncTimelineEvent(payload);
      if (success) {
        return { queued: false, synced: true };
      }
    } catch (error) {
      console.error('Failed to sync timeline event, queuing instead:', error);
    }
  }
  
  // Queue for later
  queueTimelineEvent(payload);
  return { queued: true, synced: false };
}

/**
 * Smart queue function for block events
 */
export async function queueOrSyncBlockEvent(
  payload: BlockEventPayloadType
): Promise<{ queued: boolean; synced: boolean }> {
  if (isOnline() && registeredSyncHandler) {
    try {
      const success = await registeredSyncHandler.syncBlockEvent(payload);
      if (success) {
        return { queued: false, synced: true };
      }
    } catch (error) {
      console.error('Failed to sync block event, queuing instead:', error);
    }
  }
  
  queueBlockEvent(payload);
  return { queued: true, synced: false };
}

/**
 * Smart queue function for interruption events
 */
export async function queueOrSyncInterruptionEvent(
  payload: InterruptionEventPayloadType
): Promise<{ queued: boolean; synced: boolean }> {
  if (isOnline() && registeredSyncHandler) {
    try {
      const success = await registeredSyncHandler.syncInterruptionEvent(payload);
      if (success) {
        return { queued: false, synced: true };
      }
    } catch (error) {
      console.error('Failed to sync interruption event, queuing instead:', error);
    }
  }
  
  queueInterruptionEvent(payload);
  return { queued: true, synced: false };
}
