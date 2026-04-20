/**
 * Event Queue for Browser Sentinel
 * 
 * Manages offline event storage and replay when connection is restored.
 * Requirements: 5.26, 5.27, 5.28, 5.29
 */

import type { OctopusEvent } from '../types/index.js';

/**
 * Maximum number of events to store when offline
 * Requirements: 5.29
 */
const MAX_QUEUE_SIZE = 1000;

/**
 * Storage key for persisting events
 */
const STORAGE_KEY = 'vibeflow_event_queue';

/**
 * Event queue entry with metadata
 */
interface QueuedEvent {
  event: OctopusEvent;
  queuedAt: number;
  retryCount: number;
}

/**
 * Event queue statistics
 */
export interface EventQueueStats {
  pendingCount: number;
  oldestEventTime: number | null;
  newestEventTime: number | null;
  totalRetries: number;
}

/**
 * Event Queue Manager
 * 
 * Handles offline event storage with the following features:
 * - Persists events to chrome.storage.local
 * - Limits queue size to MAX_QUEUE_SIZE (1000 events)
 * - Replays events in order when connection is restored
 * - Tracks retry counts for failed sends
 * 
 * Requirements: 5.26, 5.27, 5.28, 5.29
 */
export class EventQueue {
  private queue: QueuedEvent[] = [];
  private isLoaded = false;

  /**
   * Initialize the event queue by loading from storage
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;
    
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
        const raw = result[STORAGE_KEY] as QueuedEvent[];
        // Filter out any legacy-format events that lack an eventType (Phase B2 cleanup)
        const valid = raw.filter(entry => entry.event && typeof entry.event.eventType === 'string');
        const dropped = raw.length - valid.length;
        if (dropped > 0) {
          console.warn(`[EventQueue] Cleared ${dropped} legacy-format events from offline queue`);
        }
        this.queue = valid;
        console.log(`[EventQueue] Loaded ${this.queue.length} pending events from storage`);
      }
      this.isLoaded = true;
    } catch (error) {
      console.error('[EventQueue] Failed to load from storage:', error);
      this.queue = [];
      this.isLoaded = true;
    }
  }

  /**
   * Add an event to the queue
   * Requirements: 5.26, 5.29
   * 
   * @param event - The Octopus event to queue
   * @returns true if event was queued, false if queue is full
   */
  async enqueue(event: OctopusEvent): Promise<boolean> {
    await this.ensureLoaded();

    // Check if queue is at capacity
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      console.warn('[EventQueue] Queue is full, dropping oldest event');
      // Remove oldest event to make room
      this.queue.shift();
    }

    const queuedEvent: QueuedEvent = {
      event,
      queuedAt: Date.now(),
      retryCount: 0,
    };

    this.queue.push(queuedEvent);
    await this.persist();
    
    console.log(`[EventQueue] Event queued, total: ${this.queue.length}`);
    return true;
  }

  /**
   * Add multiple events to the queue
   * Requirements: 5.26, 5.29
   * 
   * @param events - Array of Octopus events to queue
   * @returns number of events successfully queued
   */
  async enqueueBatch(events: OctopusEvent[]): Promise<number> {
    await this.ensureLoaded();

    let queuedCount = 0;
    for (const event of events) {
      // Check if queue is at capacity
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        console.warn('[EventQueue] Queue is full, dropping oldest events');
        // Remove oldest events to make room
        const eventsToRemove = Math.min(events.length - queuedCount, this.queue.length);
        this.queue.splice(0, eventsToRemove);
      }

      const queuedEvent: QueuedEvent = {
        event,
        queuedAt: Date.now(),
        retryCount: 0,
      };

      this.queue.push(queuedEvent);
      queuedCount++;
    }

    await this.persist();
    console.log(`[EventQueue] ${queuedCount} events queued, total: ${this.queue.length}`);
    return queuedCount;
  }

  /**
   * Get all pending events for replay
   * Requirements: 5.28
   * 
   * @returns Array of queued events in FIFO order
   */
  async getPendingEvents(): Promise<OctopusEvent[]> {
    await this.ensureLoaded();
    return this.queue.map(qe => qe.event);
  }

  /**
   * Get pending events with metadata
   */
  async getPendingEventsWithMetadata(): Promise<QueuedEvent[]> {
    await this.ensureLoaded();
    return [...this.queue];
  }

  /**
   * Remove events that have been successfully sent
   * Requirements: 5.28
   * 
   * @param count - Number of events to remove from the front of the queue
   */
  async markSent(count: number): Promise<void> {
    await this.ensureLoaded();
    
    if (count > 0 && count <= this.queue.length) {
      this.queue.splice(0, count);
      await this.persist();
      console.log(`[EventQueue] Marked ${count} events as sent, remaining: ${this.queue.length}`);
    }
  }

  /**
   * Remove a specific event by its eventId
   * 
   * @param eventId - The event ID to remove
   */
  async removeEvent(eventId: string): Promise<boolean> {
    await this.ensureLoaded();
    
    const index = this.queue.findIndex(qe => qe.event.eventId === eventId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      await this.persist();
      return true;
    }
    return false;
  }

  /**
   * Increment retry count for failed events
   * 
   * @param count - Number of events from the front that failed
   */
  async markRetry(count: number): Promise<void> {
    await this.ensureLoaded();
    
    for (let i = 0; i < Math.min(count, this.queue.length); i++) {
      this.queue[i].retryCount++;
    }
    await this.persist();
  }

  /**
   * Clear all events from the queue
   */
  async clear(): Promise<void> {
    this.queue = [];
    await this.persist();
    console.log('[EventQueue] Queue cleared');
  }

  /**
   * Get the current queue size
   */
  async size(): Promise<number> {
    await this.ensureLoaded();
    return this.queue.length;
  }

  /**
   * Check if the queue is empty
   */
  async isEmpty(): Promise<boolean> {
    await this.ensureLoaded();
    return this.queue.length === 0;
  }

  /**
   * Check if the queue is at capacity
   * Requirements: 5.29
   */
  async isFull(): Promise<boolean> {
    await this.ensureLoaded();
    return this.queue.length >= MAX_QUEUE_SIZE;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<EventQueueStats> {
    await this.ensureLoaded();
    
    const totalRetries = this.queue.reduce((sum, qe) => sum + qe.retryCount, 0);
    
    return {
      pendingCount: this.queue.length,
      oldestEventTime: this.queue.length > 0 ? this.queue[0].queuedAt : null,
      newestEventTime: this.queue.length > 0 ? this.queue[this.queue.length - 1].queuedAt : null,
      totalRetries,
    };
  }

  /**
   * Get the maximum queue size
   */
  getMaxSize(): number {
    return MAX_QUEUE_SIZE;
  }

  /**
   * Ensure the queue is loaded from storage
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.initialize();
    }
  }

  /**
   * Persist the queue to storage
   */
  private async persist(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.queue });
    } catch (error) {
      console.error('[EventQueue] Failed to persist to storage:', error);
    }
  }
}

/**
 * Singleton instance of the event queue
 */
let eventQueueInstance: EventQueue | null = null;

/**
 * Get the singleton event queue instance
 */
export function getEventQueue(): EventQueue {
  if (!eventQueueInstance) {
    eventQueueInstance = new EventQueue();
  }
  return eventQueueInstance;
}

/**
 * Event Replay Manager
 * 
 * Handles replaying queued events when connection is restored.
 * Requirements: 5.28
 */
export class EventReplayManager {
  private eventQueue: EventQueue;
  private sendFunction: (events: OctopusEvent[]) => Promise<boolean>;
  private isReplaying = false;
  private batchSize = 50; // Max events per batch (Requirements: 5.20)

  constructor(
    eventQueue: EventQueue,
    sendFunction: (events: OctopusEvent[]) => Promise<boolean>
  ) {
    this.eventQueue = eventQueue;
    this.sendFunction = sendFunction;
  }

  /**
   * Replay all queued events
   * Requirements: 5.28
   * 
   * @returns Number of events successfully replayed
   */
  async replayAll(): Promise<number> {
    if (this.isReplaying) {
      console.log('[EventReplayManager] Replay already in progress');
      return 0;
    }

    this.isReplaying = true;
    let totalReplayed = 0;

    try {
      const pendingEvents = await this.eventQueue.getPendingEvents();
      
      if (pendingEvents.length === 0) {
        console.log('[EventReplayManager] No events to replay');
        return 0;
      }

      console.log(`[EventReplayManager] Starting replay of ${pendingEvents.length} events`);

      // Process events in batches
      for (let i = 0; i < pendingEvents.length; i += this.batchSize) {
        const batch = pendingEvents.slice(i, i + this.batchSize);
        
        try {
          const success = await this.sendFunction(batch);
          
          if (success) {
            await this.eventQueue.markSent(batch.length);
            totalReplayed += batch.length;
            console.log(`[EventReplayManager] Batch sent successfully, ${totalReplayed}/${pendingEvents.length}`);
          } else {
            await this.eventQueue.markRetry(batch.length);
            console.warn('[EventReplayManager] Batch send failed, will retry later');
            break; // Stop replay on failure
          }
        } catch (error) {
          console.error('[EventReplayManager] Error sending batch:', error);
          await this.eventQueue.markRetry(batch.length);
          break; // Stop replay on error
        }
      }

      console.log(`[EventReplayManager] Replay complete, ${totalReplayed} events sent`);
      return totalReplayed;
    } finally {
      this.isReplaying = false;
    }
  }

  /**
   * Check if replay is in progress
   */
  isReplayInProgress(): boolean {
    return this.isReplaying;
  }

  /**
   * Set the batch size for replay
   */
  setBatchSize(size: number): void {
    this.batchSize = Math.min(Math.max(1, size), 50); // Clamp between 1 and 50
  }
}
