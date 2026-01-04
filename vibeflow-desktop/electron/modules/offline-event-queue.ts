/**
 * Offline Event Queue Module
 * 
 * Queues events (skip token usage, bypass events) when offline
 * and syncs them to the server when connection is restored.
 * 
 * Requirements: 9.3, 9.6
 */

import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Types of events that can be queued
 */
export type QueuedEventType = 
  | 'skip_token_usage'
  | 'bypass_event'
  | 'offline_period'
  | 'heartbeat_missed';

/**
 * Base interface for queued events
 */
export interface BaseQueuedEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: QueuedEventType;
  /** User ID */
  userId: string;
  /** Client ID */
  clientId: string;
  /** When the event occurred */
  timestamp: number;
  /** Number of sync attempts */
  syncAttempts: number;
  /** Last sync attempt timestamp */
  lastSyncAttempt: number | null;
  /** Whether sync failed */
  syncFailed: boolean;
  /** Error message if sync failed */
  syncError: string | null;
}

/**
 * Skip token usage event
 * Requirements: 9.6
 */
export interface SkipTokenUsageEvent extends BaseQueuedEvent {
  type: 'skip_token_usage';
  payload: {
    /** Reason for using skip token */
    reason: 'quit_confirmation' | 'intervention_skip' | 'intervention_delay';
    /** Delay minutes if applicable */
    delayMinutes?: number;
    /** Context when token was used */
    context: {
      wasInWorkHours: boolean;
      wasInPomodoro: boolean;
      enforcementMode: 'strict' | 'gentle';
    };
  };
}

/**
 * Bypass event
 * Requirements: 9.3
 */
export interface BypassEvent extends BaseQueuedEvent {
  type: 'bypass_event';
  payload: {
    /** Type of bypass */
    eventType: 'force_quit' | 'offline_timeout' | 'guardian_killed';
    /** Duration of offline period in seconds */
    durationSeconds: number | null;
    /** Context when bypass occurred */
    context: {
      wasInWorkHours: boolean;
      wasInPomodoro: boolean;
      gracePeriodExpired: boolean;
    };
  };
}

/**
 * Offline period event
 */
export interface OfflinePeriodEvent extends BaseQueuedEvent {
  type: 'offline_period';
  payload: {
    /** When offline period started */
    startedAt: number;
    /** When offline period ended (null if still offline) */
    endedAt: number | null;
    /** Duration in seconds */
    durationSeconds: number | null;
    /** Context during offline period */
    context: {
      wasInWorkHours: boolean;
      wasInPomodoro: boolean;
    };
  };
}

/**
 * Heartbeat missed event
 */
export interface HeartbeatMissedEvent extends BaseQueuedEvent {
  type: 'heartbeat_missed';
  payload: {
    /** Number of consecutive missed heartbeats */
    missedCount: number;
    /** Expected heartbeat time */
    expectedAt: number;
  };
}

/**
 * Union type for all queued events
 */
export type QueuedEvent = 
  | SkipTokenUsageEvent 
  | BypassEvent 
  | OfflinePeriodEvent 
  | HeartbeatMissedEvent;

/**
 * Event queue configuration
 */
export interface EventQueueConfig {
  /** Maximum number of events to queue */
  maxQueueSize: number;
  /** Maximum age of events before they're discarded (ms) */
  maxEventAgeMs: number;
  /** Maximum sync attempts before giving up */
  maxSyncAttempts: number;
  /** Delay between sync attempts (ms) */
  syncRetryDelayMs: number;
}

/**
 * Event queue state
 */
export interface EventQueueState {
  /** Number of events in queue */
  queueSize: number;
  /** Number of events pending sync */
  pendingCount: number;
  /** Number of events that failed to sync */
  failedCount: number;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Last successful sync timestamp */
  lastSyncAt: number | null;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Sync handler function type
 */
export type SyncHandler = (event: QueuedEvent) => Promise<boolean>;

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'offlineEventQueue';
const DEFAULT_MAX_QUEUE_SIZE = 1000;
const DEFAULT_MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_MAX_SYNC_ATTEMPTS = 3;
const DEFAULT_SYNC_RETRY_DELAY_MS = 5000;

// =============================================================================
// Offline Event Queue Manager
// =============================================================================

/**
 * OfflineEventQueueManager
 * 
 * Manages a queue of events that occurred while offline.
 * Events are persisted to disk and synced when connection is restored.
 * 
 * Requirements: 9.3, 9.6
 */
export class OfflineEventQueueManager {
  private store: Store<{ [STORAGE_KEY]: QueuedEvent[] }>;
  private config: EventQueueConfig;
  private queue: QueuedEvent[] = [];
  private isSyncing: boolean = false;
  private lastSyncAt: number | null = null;
  private syncHandler: SyncHandler | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<EventQueueConfig> = {}) {
    this.config = {
      maxQueueSize: config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      maxEventAgeMs: config.maxEventAgeMs ?? DEFAULT_MAX_EVENT_AGE_MS,
      maxSyncAttempts: config.maxSyncAttempts ?? DEFAULT_MAX_SYNC_ATTEMPTS,
      syncRetryDelayMs: config.syncRetryDelayMs ?? DEFAULT_SYNC_RETRY_DELAY_MS,
    };

    this.store = new Store<{ [STORAGE_KEY]: QueuedEvent[] }>({
      name: 'vibeflow-offline-queue',
      defaults: {
        [STORAGE_KEY]: [],
      },
    });
  }

  /**
   * Initialize the queue by loading from persistent storage
   */
  initialize(): void {
    if (this.initialized) return;

    try {
      const stored = this.store.get(STORAGE_KEY);
      if (Array.isArray(stored)) {
        // Filter out expired events
        this.queue = stored.filter(event => this.isEventValid(event));
        this.persistQueue();
        console.log('[OfflineQueue] Initialized with', this.queue.length, 'events');
      }
      this.initialized = true;
    } catch (error) {
      console.error('[OfflineQueue] Failed to initialize:', error);
      this.queue = [];
      this.initialized = true;
    }
  }

  /**
   * Set the sync handler function
   */
  setSyncHandler(handler: SyncHandler): void {
    this.syncHandler = handler;
  }

  /**
   * Queue a skip token usage event
   * Requirements: 9.6
   */
  queueSkipTokenUsage(
    userId: string,
    clientId: string,
    reason: SkipTokenUsageEvent['payload']['reason'],
    context: SkipTokenUsageEvent['payload']['context'],
    delayMinutes?: number
  ): string {
    const event: SkipTokenUsageEvent = {
      id: uuidv4(),
      type: 'skip_token_usage',
      userId,
      clientId,
      timestamp: Date.now(),
      syncAttempts: 0,
      lastSyncAttempt: null,
      syncFailed: false,
      syncError: null,
      payload: {
        reason,
        delayMinutes,
        context,
      },
    };

    this.addEvent(event);
    return event.id;
  }

  /**
   * Queue a bypass event
   * Requirements: 9.3
   */
  queueBypassEvent(
    userId: string,
    clientId: string,
    eventType: BypassEvent['payload']['eventType'],
    context: BypassEvent['payload']['context'],
    durationSeconds?: number
  ): string {
    const event: BypassEvent = {
      id: uuidv4(),
      type: 'bypass_event',
      userId,
      clientId,
      timestamp: Date.now(),
      syncAttempts: 0,
      lastSyncAttempt: null,
      syncFailed: false,
      syncError: null,
      payload: {
        eventType,
        durationSeconds: durationSeconds ?? null,
        context,
      },
    };

    this.addEvent(event);
    return event.id;
  }

  /**
   * Queue an offline period event
   */
  queueOfflinePeriod(
    userId: string,
    clientId: string,
    startedAt: number,
    context: OfflinePeriodEvent['payload']['context'],
    endedAt?: number
  ): string {
    const event: OfflinePeriodEvent = {
      id: uuidv4(),
      type: 'offline_period',
      userId,
      clientId,
      timestamp: Date.now(),
      syncAttempts: 0,
      lastSyncAttempt: null,
      syncFailed: false,
      syncError: null,
      payload: {
        startedAt,
        endedAt: endedAt ?? null,
        durationSeconds: endedAt ? Math.floor((endedAt - startedAt) / 1000) : null,
        context,
      },
    };

    this.addEvent(event);
    return event.id;
  }

  /**
   * Queue a heartbeat missed event
   */
  queueHeartbeatMissed(
    userId: string,
    clientId: string,
    missedCount: number,
    expectedAt: number
  ): string {
    const event: HeartbeatMissedEvent = {
      id: uuidv4(),
      type: 'heartbeat_missed',
      userId,
      clientId,
      timestamp: Date.now(),
      syncAttempts: 0,
      lastSyncAttempt: null,
      syncFailed: false,
      syncError: null,
      payload: {
        missedCount,
        expectedAt,
      },
    };

    this.addEvent(event);
    return event.id;
  }

  /**
   * Get current queue state
   */
  getState(): EventQueueState {
    return {
      queueSize: this.queue.length,
      pendingCount: this.queue.filter(e => !e.syncFailed).length,
      failedCount: this.queue.filter(e => e.syncFailed).length,
      isSyncing: this.isSyncing,
      lastSyncAt: this.lastSyncAt,
    };
  }

  /**
   * Get all queued events
   */
  getQueue(): QueuedEvent[] {
    return [...this.queue];
  }

  /**
   * Get pending events (not yet synced or failed)
   */
  getPendingEvents(): QueuedEvent[] {
    return this.queue.filter(e => !e.syncFailed);
  }

  /**
   * Get failed events
   */
  getFailedEvents(): QueuedEvent[] {
    return this.queue.filter(e => e.syncFailed);
  }

  /**
   * Sync all pending events to the server
   * Requirements: 9.3, 9.6
   */
  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        errors: ['Sync already in progress'],
      };
    }

    if (!this.syncHandler) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        errors: ['No sync handler configured'],
      };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    const pendingEvents = this.getPendingEvents();
    console.log('[OfflineQueue] Syncing', pendingEvents.length, 'events');

    for (const event of pendingEvents) {
      try {
        event.syncAttempts++;
        event.lastSyncAttempt = Date.now();

        const success = await this.syncHandler(event);

        if (success) {
          // Remove successfully synced event
          this.removeEvent(event.id);
          result.syncedCount++;
        } else {
          // Mark as failed if max attempts reached
          if (event.syncAttempts >= this.config.maxSyncAttempts) {
            event.syncFailed = true;
            event.syncError = 'Max sync attempts reached';
            result.failedCount++;
            result.errors.push(`Event ${event.id}: Max sync attempts reached`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        event.syncError = errorMessage;
        
        if (event.syncAttempts >= this.config.maxSyncAttempts) {
          event.syncFailed = true;
          result.failedCount++;
        }
        
        result.errors.push(`Event ${event.id}: ${errorMessage}`);
      }
    }

    this.persistQueue();
    this.isSyncing = false;
    this.lastSyncAt = Date.now();

    result.success = result.failedCount === 0;
    console.log('[OfflineQueue] Sync complete:', result);

    return result;
  }

  /**
   * Retry syncing failed events
   */
  async retryFailed(): Promise<SyncResult> {
    // Reset failed status for retry
    for (const event of this.queue) {
      if (event.syncFailed) {
        event.syncFailed = false;
        event.syncAttempts = 0;
        event.syncError = null;
      }
    }
    this.persistQueue();

    return this.syncAll();
  }

  /**
   * Clear all events from the queue
   */
  clearQueue(): void {
    this.queue = [];
    this.persistQueue();
    console.log('[OfflineQueue] Queue cleared');
  }

  /**
   * Clear only failed events
   */
  clearFailed(): void {
    this.queue = this.queue.filter(e => !e.syncFailed);
    this.persistQueue();
    console.log('[OfflineQueue] Failed events cleared');
  }

  /**
   * Remove a specific event by ID
   */
  removeEvent(eventId: string): boolean {
    const index = this.queue.findIndex(e => e.id === eventId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.persistQueue();
      return true;
    }
    return false;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EventQueueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): EventQueueConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Add an event to the queue
   */
  private addEvent(event: QueuedEvent): void {
    // Enforce max queue size
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove oldest event
      this.queue.shift();
      console.warn('[OfflineQueue] Queue full, removed oldest event');
    }

    this.queue.push(event);
    this.persistQueue();
    console.log('[OfflineQueue] Event queued:', event.type, event.id);
  }

  /**
   * Check if an event is still valid (not expired)
   */
  private isEventValid(event: QueuedEvent): boolean {
    const age = Date.now() - event.timestamp;
    return age < this.config.maxEventAgeMs;
  }

  /**
   * Persist queue to storage
   */
  private persistQueue(): void {
    try {
      this.store.set(STORAGE_KEY, this.queue);
    } catch (error) {
      console.error('[OfflineQueue] Failed to persist queue:', error);
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let eventQueueInstance: OfflineEventQueueManager | null = null;

/**
 * Get the offline event queue singleton
 */
export function getOfflineEventQueue(): OfflineEventQueueManager {
  if (!eventQueueInstance) {
    eventQueueInstance = new OfflineEventQueueManager();
    eventQueueInstance.initialize();
  }
  return eventQueueInstance;
}

/**
 * Initialize offline event queue with custom config
 */
export function initializeOfflineEventQueue(config: Partial<EventQueueConfig> = {}): OfflineEventQueueManager {
  if (eventQueueInstance) {
    eventQueueInstance.updateConfig(config);
  } else {
    eventQueueInstance = new OfflineEventQueueManager(config);
    eventQueueInstance.initialize();
  }
  return eventQueueInstance;
}

/**
 * Reset offline event queue singleton (for testing)
 */
export function resetOfflineEventQueue(): void {
  if (eventQueueInstance) {
    eventQueueInstance.clearQueue();
    eventQueueInstance = null;
  }
}

export { OfflineEventQueueManager as default };
