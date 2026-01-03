/**
 * Event Batcher
 * 
 * Batches events for efficient network transmission, with configurable
 * batch size limits and flush intervals.
 * 
 * Requirements: 5.5, 5.20
 */

import type { OctopusBaseEvent } from '../types/index.js';

// Configuration defaults
const DEFAULT_BATCH_SIZE = 50;  // Max 50 events per batch (Requirements: 5.20)
const DEFAULT_FLUSH_INTERVAL_MS = 60000;  // 1 minute (Requirements: 5.5)
const MAX_PENDING_EVENTS = 1000;  // Max events to store offline (Requirements: 5.29)
const STORAGE_KEY = 'pendingBatchedEvents';

/**
 * Batch send result
 */
export interface BatchSendResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  error?: string;
}

/**
 * Event batcher configuration
 */
export interface EventBatcherConfig {
  batchSize?: number;
  flushIntervalMs?: number;
  maxPendingEvents?: number;
  onSend?: (events: OctopusBaseEvent[]) => Promise<void>;
  onError?: (error: Error, events: OctopusBaseEvent[]) => void;
}

export class EventBatcher {
  private pendingEvents: OctopusBaseEvent[] = [];
  private batchSize: number;
  private flushIntervalMs: number;
  private maxPendingEvents: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sendCallback: ((events: OctopusBaseEvent[]) => Promise<void>) | null = null;
  private errorCallback: ((error: Error, events: OctopusBaseEvent[]) => void) | null = null;
  private isFlushing = false;
  private initialized = false;

  constructor(config: EventBatcherConfig = {}) {
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = config.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;
    this.maxPendingEvents = config.maxPendingEvents || MAX_PENDING_EVENTS;
    this.sendCallback = config.onSend || null;
    this.errorCallback = config.onError || null;
  }

  /**
   * Initialize the event batcher
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load pending events from storage
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
        this.pendingEvents = result[STORAGE_KEY];
        console.log('[EventBatcher] Loaded', this.pendingEvents.length, 'pending events from storage');
      }
    } catch (error) {
      console.error('[EventBatcher] Failed to load pending events:', error);
    }

    this.startFlushTimer();
    this.initialized = true;
    console.log('[EventBatcher] Initialized with batch size:', this.batchSize);
  }

  /**
   * Set the send callback
   */
  setSendCallback(callback: (events: OctopusBaseEvent[]) => Promise<void>): void {
    this.sendCallback = callback;
  }

  /**
   * Set the error callback
   */
  setErrorCallback(callback: (error: Error, events: OctopusBaseEvent[]) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Add an event to the batch
   * Requirements: 5.20
   */
  add(event: OctopusBaseEvent): void {
    // Enforce max pending events limit (Requirements: 5.29)
    if (this.pendingEvents.length >= this.maxPendingEvents) {
      // Remove oldest events to make room
      const removeCount = Math.max(1, Math.floor(this.maxPendingEvents * 0.1));
      this.pendingEvents.splice(0, removeCount);
      console.warn('[EventBatcher] Dropped', removeCount, 'oldest events due to limit');
    }

    this.pendingEvents.push(event);
    this.savePendingEvents();

    // Auto-flush if batch is full
    if (this.pendingEvents.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Add multiple events to the batch
   */
  addBatch(events: OctopusBaseEvent[]): void {
    for (const event of events) {
      this.add(event);
    }
  }

  /**
   * Force flush all pending events
   * Requirements: 5.5
   */
  async flush(): Promise<BatchSendResult> {
    if (this.isFlushing || this.pendingEvents.length === 0) {
      return { success: true, sentCount: 0, failedCount: 0 };
    }

    if (!this.sendCallback) {
      return { 
        success: false, 
        sentCount: 0, 
        failedCount: this.pendingEvents.length,
        error: 'No send callback configured'
      };
    }

    this.isFlushing = true;
    let totalSent = 0;
    let totalFailed = 0;

    try {
      // Send in batches of batchSize
      while (this.pendingEvents.length > 0) {
        const batch = this.pendingEvents.slice(0, this.batchSize);
        
        try {
          await this.sendCallback(batch);
          
          // Remove sent events
          this.pendingEvents.splice(0, batch.length);
          totalSent += batch.length;
          
          console.log('[EventBatcher] Sent batch of', batch.length, 'events');
        } catch (error) {
          // Batch failed - keep events for retry
          totalFailed += batch.length;
          
          if (this.errorCallback) {
            this.errorCallback(error as Error, batch);
          }
          
          console.error('[EventBatcher] Failed to send batch:', error);
          break; // Stop trying to send more batches
        }
      }

      await this.savePendingEvents();

      return {
        success: totalFailed === 0,
        sentCount: totalSent,
        failedCount: totalFailed,
      };
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Get the number of pending events
   */
  getPendingCount(): number {
    return this.pendingEvents.length;
  }

  /**
   * Get all pending events (for debugging/inspection)
   */
  getPendingEvents(): OctopusBaseEvent[] {
    return [...this.pendingEvents];
  }

  /**
   * Set the batch size
   * Requirements: 5.20
   */
  setBatchSize(size: number): void {
    this.batchSize = Math.min(size, DEFAULT_BATCH_SIZE); // Enforce max of 50
    console.log('[EventBatcher] Batch size set to:', this.batchSize);
  }

  /**
   * Set the flush interval
   * Requirements: 5.5
   */
  setFlushInterval(ms: number): void {
    this.flushIntervalMs = ms;
    
    // Restart timer with new interval
    this.stopFlushTimer();
    this.startFlushTimer();
    
    console.log('[EventBatcher] Flush interval set to:', ms, 'ms');
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  /**
   * Stop the periodic flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Save pending events to storage
   */
  private async savePendingEvents(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.pendingEvents });
    } catch (error) {
      console.error('[EventBatcher] Failed to save pending events:', error);
    }
  }

  /**
   * Clear all pending events
   */
  async clear(): Promise<void> {
    this.pendingEvents = [];
    await this.savePendingEvents();
    console.log('[EventBatcher] Cleared all pending events');
  }

  /**
   * Destroy the batcher and cleanup
   */
  destroy(): void {
    this.stopFlushTimer();
    this.flush(); // Try to send remaining events
    this.initialized = false;
  }

  /**
   * Get batcher statistics
   */
  getStats(): {
    pendingCount: number;
    batchSize: number;
    flushIntervalMs: number;
    maxPendingEvents: number;
    isFlushing: boolean;
  } {
    return {
      pendingCount: this.pendingEvents.length,
      batchSize: this.batchSize,
      flushIntervalMs: this.flushIntervalMs,
      maxPendingEvents: this.maxPendingEvents,
      isFlushing: this.isFlushing,
    };
  }
}

// Singleton instance with default configuration
export const eventBatcher = new EventBatcher();

/**
 * Create a new event batcher with custom configuration
 */
export function createEventBatcher(config: EventBatcherConfig): EventBatcher {
  return new EventBatcher(config);
}
