import type {
  ActivityLog,
  TimelineEvent,
  BlockEvent,
  InterruptionEvent,
  BrowserActivityPayload,
  ActivityCategory,
  NavigationType,
  InteractionType,
} from '../types/index.js';

const STORAGE_KEY = 'pendingActivityLogs';
const TIMELINE_STORAGE_KEY = 'pendingTimelineEvents';
const ENHANCED_ACTIVITY_KEY = 'pendingEnhancedActivities';
const SYNC_INTERVAL = 60000; // 1 minute
const MIN_DURATION = 3; // Minimum 3 seconds to log
const IDLE_THRESHOLD = 30000; // 30 seconds of no interaction = idle

/**
 * Enhanced tab activity state with detailed tracking
 * Requirements: 5.6, 5.7, 5.8, 5.9
 */
export interface EnhancedTabActivity {
  tabId: number;
  url: string;
  title: string;
  domain: string;
  
  // Time tracking
  startTime: number;
  lastActiveTime: number;
  totalActiveTime: number;
  totalIdleTime: number;
  isActive: boolean;
  
  // User engagement metrics (Requirements: 5.6, 5.7)
  scrollDepth: number;
  interactionCount: number;
  interactions: InteractionRecord[];
  
  // Media state (Requirements: 5.11)
  isMediaPlaying: boolean;
  mediaPlayStartTime: number | null;
  totalMediaPlayTime: number;
  
  // Navigation context (Requirements: 5.10)
  referrer: string | null;
  navigationType: NavigationType;
  
  // Search tracking (Requirements: 5.12)
  searchQuery: string | null;
  searchEngine: string | null;
  
  // Idle tracking state
  lastInteractionTime: number;
  idleStartTime: number | null;
}

/**
 * Interaction record for tracking user engagement
 */
export interface InteractionRecord {
  type: InteractionType;
  timestamp: number;
  target?: string;
}

// Legacy interface for backward compatibility
export interface TabActivity {
  tabId: number;
  url: string;
  title: string;
  startTime: number;
  lastActiveTime: number;
  totalActiveTime: number;
  isActive: boolean;
}

export class ActivityTracker {
  private activities: Map<number, EnhancedTabActivity> = new Map();
  private pendingLogs: ActivityLog[] = [];
  private pendingTimelineEvents: TimelineEvent[] = [];
  private pendingEnhancedActivities: BrowserActivityPayload[] = [];
  private syncCallback: ((logs: ActivityLog[]) => Promise<void>) | null = null;
  private timelineEventCallback: ((events: TimelineEvent[]) => Promise<void>) | null = null;
  private blockEventCallback: ((event: BlockEvent) => Promise<void>) | null = null;
  private interruptionEventCallback: ((event: InterruptionEvent) => Promise<void>) | null = null;
  private enhancedActivityCallback: ((activities: BrowserActivityPayload[]) => Promise<void>) | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private currentPomodoroId: string | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load pending logs from storage
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEY,
        TIMELINE_STORAGE_KEY,
        ENHANCED_ACTIVITY_KEY,
        'currentPomodoroId'
      ]);
      if (result[STORAGE_KEY]) {
        this.pendingLogs = result[STORAGE_KEY];
      }
      if (result[TIMELINE_STORAGE_KEY]) {
        this.pendingTimelineEvents = result[TIMELINE_STORAGE_KEY];
      }
      if (result[ENHANCED_ACTIVITY_KEY]) {
        this.pendingEnhancedActivities = result[ENHANCED_ACTIVITY_KEY];
      }
      if (result.currentPomodoroId) {
        this.currentPomodoroId = result.currentPomodoroId;
      }
    } catch (error) {
      console.error('[ActivityTracker] Failed to load pending logs:', error);
    }

    // Start idle checking
    this.startIdleChecking();

    this.initialized = true;
    console.log('[ActivityTracker] Initialized with', this.pendingLogs.length, 'pending logs,',
      this.pendingTimelineEvents.length, 'pending timeline events, and',
      this.pendingEnhancedActivities.length, 'pending enhanced activities');
  }

  /**
   * Set the callback for syncing logs to server
   */
  setSyncCallback(callback: (logs: ActivityLog[]) => Promise<void>): void {
    this.syncCallback = callback;
  }

  /**
   * Set the callback for syncing timeline events to server
   */
  setTimelineEventCallback(callback: (events: TimelineEvent[]) => Promise<void>): void {
    this.timelineEventCallback = callback;
  }

  /**
   * Set the callback for sending block events to server
   */
  setBlockEventCallback(callback: (event: BlockEvent) => Promise<void>): void {
    this.blockEventCallback = callback;
  }

  /**
   * Set the callback for sending interruption events to server
   */
  setInterruptionEventCallback(callback: (event: InterruptionEvent) => Promise<void>): void {
    this.interruptionEventCallback = callback;
  }

  /**
   * Set the callback for syncing enhanced activity events to server
   */
  setEnhancedActivityCallback(callback: (activities: BrowserActivityPayload[]) => Promise<void>): void {
    this.enhancedActivityCallback = callback;
  }

  /**
   * Set the current pomodoro ID for tracking interruptions
   */
  setCurrentPomodoroId(pomodoroId: string | null): void {
    this.currentPomodoroId = pomodoroId;
    chrome.storage.local.set({ currentPomodoroId: pomodoroId });
  }

  /**
   * Get the current pomodoro ID
   */
  getCurrentPomodoroId(): string | null {
    return this.currentPomodoroId;
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      this.syncToServer();
    }, SYNC_INTERVAL);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Start idle checking timer
   * Requirements: 5.8
   */
  private startIdleChecking(): void {
    if (this.idleCheckTimer) return;

    this.idleCheckTimer = setInterval(() => {
      this.checkIdleState();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop idle checking timer
   */
  private stopIdleChecking(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }

  /**
   * Check and update idle state for all active tabs
   * Requirements: 5.8
   */
  private checkIdleState(): void {
    const now = Date.now();
    
    for (const [tabId, activity] of this.activities) {
      if (!activity.isActive) continue;
      
      const timeSinceLastInteraction = now - activity.lastInteractionTime;
      
      if (timeSinceLastInteraction >= IDLE_THRESHOLD) {
        // Tab is now idle
        if (activity.idleStartTime === null) {
          activity.idleStartTime = activity.lastInteractionTime + IDLE_THRESHOLD;
        }
        // Accumulate idle time
        const idleDuration = now - activity.idleStartTime;
        activity.totalIdleTime = idleDuration;
      }
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Start tracking a tab with enhanced data
   * Requirements: 5.6, 5.7, 5.8, 5.9
   */
  startTracking(
    tabId: number,
    url: string,
    title: string,
    referrer?: string,
    navigationType?: NavigationType
  ): void {
    // Skip internal URLs
    if (this.isInternalUrl(url)) {
      return;
    }

    const now = Date.now();
    const existing = this.activities.get(tabId);

    if (existing && existing.url === url) {
      // Same URL, just mark as active
      existing.isActive = true;
      existing.lastActiveTime = now;
      existing.lastInteractionTime = now;
      existing.idleStartTime = null;
      return;
    }

    // Different URL or new tab - finalize previous if exists
    if (existing) {
      this.finalizeActivity(tabId);
    }

    const domain = this.extractDomain(url);

    // Start new enhanced tracking
    this.activities.set(tabId, {
      tabId,
      url,
      title,
      domain,
      startTime: now,
      lastActiveTime: now,
      totalActiveTime: 0,
      totalIdleTime: 0,
      isActive: true,
      scrollDepth: 0,
      interactionCount: 0,
      interactions: [],
      isMediaPlaying: false,
      mediaPlayStartTime: null,
      totalMediaPlayTime: 0,
      referrer: referrer || null,
      navigationType: navigationType || 'other',
      searchQuery: null,
      searchEngine: null,
      lastInteractionTime: now,
      idleStartTime: null,
    });

    console.log('[ActivityTracker] Started tracking:', url);
  }

  /**
   * Stop tracking a tab (tab closed or URL changed)
   */
  stopTracking(tabId: number): ActivityLog | null {
    return this.finalizeActivity(tabId);
  }

  /**
   * Pause tracking (tab became inactive)
   * Requirements: 5.9
   */
  pauseTracking(tabId: number): void {
    const activity = this.activities.get(tabId);
    if (activity && activity.isActive) {
      const now = Date.now();
      
      // Calculate active time (excluding idle time)
      const sessionDuration = now - activity.lastActiveTime;
      const idleInSession = activity.idleStartTime 
        ? now - activity.idleStartTime 
        : 0;
      activity.totalActiveTime += Math.max(0, sessionDuration - idleInSession);
      
      // Finalize media play time if playing
      if (activity.isMediaPlaying && activity.mediaPlayStartTime) {
        activity.totalMediaPlayTime += now - activity.mediaPlayStartTime;
        activity.mediaPlayStartTime = null;
      }
      
      activity.isActive = false;
    }
  }

  /**
   * Resume tracking (tab became active again)
   * Requirements: 5.9
   */
  resumeTracking(tabId: number): void {
    const activity = this.activities.get(tabId);
    if (activity && !activity.isActive) {
      const now = Date.now();
      activity.isActive = true;
      activity.lastActiveTime = now;
      activity.lastInteractionTime = now;
      activity.idleStartTime = null;
      
      // Resume media tracking if it was playing
      if (activity.isMediaPlaying) {
        activity.mediaPlayStartTime = now;
      }
    }
  }

  /**
   * Update tab title
   */
  updateTitle(tabId: number, title: string): void {
    const activity = this.activities.get(tabId);
    if (activity) {
      activity.title = title;
    }
  }

  /**
   * Update scroll depth for a tab
   * Requirements: 5.6
   */
  updateScrollDepth(tabId: number, depth: number): void {
    const activity = this.activities.get(tabId);
    if (activity) {
      // Keep the maximum scroll depth reached
      activity.scrollDepth = Math.max(activity.scrollDepth, Math.min(100, Math.max(0, depth)));
      this.recordInteractionInternal(tabId, 'scroll');
    }
  }

  /**
   * Record a user interaction
   * Requirements: 5.7
   */
  recordInteraction(tabId: number, type: InteractionType, target?: string): void {
    this.recordInteractionInternal(tabId, type, target);
  }

  /**
   * Internal method to record interaction and update idle state
   */
  private recordInteractionInternal(tabId: number, type: InteractionType, target?: string): void {
    const activity = this.activities.get(tabId);
    if (!activity) return;

    const now = Date.now();
    
    // If we were idle, accumulate the idle time
    if (activity.idleStartTime !== null) {
      activity.totalIdleTime += now - activity.idleStartTime;
      activity.idleStartTime = null;
    }
    
    activity.lastInteractionTime = now;
    activity.interactionCount++;
    
    // Keep last 100 interactions to avoid memory bloat
    if (activity.interactions.length < 100) {
      activity.interactions.push({
        type,
        timestamp: now,
        target,
      });
    }
  }

  /**
   * Update media playback state
   * Requirements: 5.11
   */
  updateMediaState(tabId: number, isPlaying: boolean): void {
    const activity = this.activities.get(tabId);
    if (!activity) return;

    const now = Date.now();

    if (isPlaying && !activity.isMediaPlaying) {
      // Media started playing
      activity.isMediaPlaying = true;
      activity.mediaPlayStartTime = now;
      this.recordInteractionInternal(tabId, 'video_play');
    } else if (!isPlaying && activity.isMediaPlaying) {
      // Media stopped playing
      if (activity.mediaPlayStartTime) {
        activity.totalMediaPlayTime += now - activity.mediaPlayStartTime;
      }
      activity.isMediaPlaying = false;
      activity.mediaPlayStartTime = null;
      this.recordInteractionInternal(tabId, 'video_pause');
    }
  }

  /**
   * Set search query information for a tab
   * Requirements: 5.12
   */
  setSearchQuery(tabId: number, query: string, engine: string): void {
    const activity = this.activities.get(tabId);
    if (activity) {
      activity.searchQuery = query;
      activity.searchEngine = engine;
    }
  }

  /**
   * Finalize activity and create log entries
   */
  private finalizeActivity(tabId: number): ActivityLog | null {
    const activity = this.activities.get(tabId);
    if (!activity) return null;

    const now = Date.now();
    
    // Calculate final durations
    let activeDuration = activity.totalActiveTime;
    let idleDuration = activity.totalIdleTime;
    
    if (activity.isActive) {
      const sessionDuration = now - activity.lastActiveTime;
      const idleInSession = activity.idleStartTime 
        ? now - activity.idleStartTime 
        : 0;
      activeDuration += Math.max(0, sessionDuration - idleInSession);
      idleDuration += idleInSession;
    }

    // Finalize media play time
    let mediaPlayDuration = activity.totalMediaPlayTime;
    if (activity.isMediaPlaying && activity.mediaPlayStartTime) {
      mediaPlayDuration += now - activity.mediaPlayStartTime;
    }

    // Total duration
    const totalDuration = now - activity.startTime;
    const totalDurationSeconds = Math.floor(totalDuration / 1000);
    const activeDurationSeconds = Math.floor(activeDuration / 1000);
    const idleDurationSeconds = Math.floor(idleDuration / 1000);
    const mediaPlayDurationSeconds = Math.floor(mediaPlayDuration / 1000);

    // Remove from tracking
    this.activities.delete(tabId);

    // Skip if duration is too short
    if (totalDurationSeconds < MIN_DURATION) {
      return null;
    }

    // Create legacy activity log for backward compatibility
    const log: ActivityLog = {
      url: activity.url,
      title: activity.title,
      startTime: activity.startTime,
      duration: totalDurationSeconds,
      category: this.categorizeUrl(activity.url),
    };

    this.pendingLogs.push(log);
    this.savePendingLogs();

    // Create enhanced activity payload
    const enhancedPayload: BrowserActivityPayload = {
      url: activity.url,
      title: activity.title,
      domain: activity.domain,
      startTime: activity.startTime,
      endTime: now,
      duration: totalDurationSeconds,
      activeDuration: activeDurationSeconds,
      idleTime: idleDurationSeconds,
      category: this.categorizeUrl(activity.url),
      productivityScore: this.calculateProductivityScore(activity),
      scrollDepth: activity.scrollDepth,
      interactionCount: activity.interactionCount,
      isMediaPlaying: activity.isMediaPlaying,
      mediaPlayDuration: mediaPlayDurationSeconds,
      referrer: activity.referrer || undefined,
      navigationType: activity.navigationType,
      searchQuery: activity.searchQuery || undefined,
      searchEngine: activity.searchEngine as BrowserActivityPayload['searchEngine'],
    };

    this.pendingEnhancedActivities.push(enhancedPayload);
    this.savePendingEnhancedActivities();

    console.log('[ActivityTracker] Logged activity:', log.url, 
      'total:', totalDurationSeconds, 's',
      'active:', activeDurationSeconds, 's',
      'idle:', idleDurationSeconds, 's',
      'scroll:', activity.scrollDepth, '%',
      'interactions:', activity.interactionCount);
    
    return log;
  }

  /**
   * Calculate productivity score based on activity metrics
   */
  private calculateProductivityScore(activity: EnhancedTabActivity): number {
    const category = this.categorizeUrl(activity.url);
    
    // Base score by category
    let score = category === 'productive' ? 80 : category === 'distracting' ? 20 : 50;
    
    // Adjust based on engagement (scroll depth and interactions indicate focus)
    if (activity.scrollDepth > 50) score += 5;
    if (activity.interactionCount > 10) score += 5;
    
    // Penalize high idle time ratio
    const totalTime = activity.totalActiveTime + activity.totalIdleTime;
    if (totalTime > 0) {
      const idleRatio = activity.totalIdleTime / totalTime;
      if (idleRatio > 0.5) score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Categorize URL based on common patterns
   */
  private categorizeUrl(url: string): ActivityCategory {
    try {
      const hostname = new URL(url).hostname.toLowerCase();

      // Productive patterns
      const productivePatterns = [
        'github.com',
        'gitlab.com',
        'stackoverflow.com',
        'docs.',
        'developer.',
        'localhost',
        'notion.so',
        'linear.app',
        'figma.com',
        'vercel.com',
        'aws.amazon.com',
        'console.cloud.google.com',
      ];

      // Distracting patterns
      const distractingPatterns = [
        'youtube.com',
        'twitter.com',
        'x.com',
        'facebook.com',
        'instagram.com',
        'tiktok.com',
        'reddit.com',
        'netflix.com',
        'twitch.tv',
        'discord.com',
      ];

      if (productivePatterns.some(p => hostname.includes(p))) {
        return 'productive';
      }

      if (distractingPatterns.some(p => hostname.includes(p))) {
        return 'distracting';
      }

      return 'neutral';
    } catch {
      return 'neutral';
    }
  }

  /**
   * Check if URL is internal (should not be tracked)
   */
  private isInternalUrl(url: string): boolean {
    return (
      !url ||
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url.startsWith('moz-extension://') ||
      url.startsWith('file://')
    );
  }

  /**
   * Save pending logs to storage
   */
  private async savePendingLogs(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.pendingLogs });
    } catch (error) {
      console.error('[ActivityTracker] Failed to save pending logs:', error);
    }
  }

  /**
   * Save pending timeline events to storage
   */
  private async savePendingTimelineEvents(): Promise<void> {
    try {
      await chrome.storage.local.set({ [TIMELINE_STORAGE_KEY]: this.pendingTimelineEvents });
    } catch (error) {
      console.error('[ActivityTracker] Failed to save pending timeline events:', error);
    }
  }

  /**
   * Save pending enhanced activities to storage
   */
  private async savePendingEnhancedActivities(): Promise<void> {
    try {
      await chrome.storage.local.set({ [ENHANCED_ACTIVITY_KEY]: this.pendingEnhancedActivities });
    } catch (error) {
      console.error('[ActivityTracker] Failed to save pending enhanced activities:', error);
    }
  }


  /**
   * Record a block event (Requirements: 7.4)
   */
  async recordBlockEvent(
    url: string,
    blockType: 'hard_block' | 'soft_block',
    userAction?: 'proceeded' | 'returned'
  ): Promise<void> {
    const event: BlockEvent = {
      url,
      timestamp: Date.now(),
      blockType,
      userAction,
      pomodoroId: this.currentPomodoroId || undefined,
    };

    console.log('[ActivityTracker] Recording block event:', event);

    // Try to send immediately if callback is set
    if (this.blockEventCallback) {
      try {
        await this.blockEventCallback(event);
        console.log('[ActivityTracker] Block event sent successfully');
      } catch (error) {
        console.error('[ActivityTracker] Failed to send block event:', error);
        // Queue as timeline event for later sync
        this.queueBlockAsTimelineEvent(event);
      }
    } else {
      // Queue as timeline event for later sync
      this.queueBlockAsTimelineEvent(event);
    }
  }

  /**
   * Queue a block event as a timeline event for later sync
   */
  private queueBlockAsTimelineEvent(event: BlockEvent): void {
    let domain = 'Unknown site';
    try {
      domain = new URL(event.url).hostname;
    } catch {
      domain = event.url;
    }

    const timelineEvent: TimelineEvent = {
      type: 'block',
      startTime: event.timestamp,
      duration: 0,
      title: `Blocked: ${domain}`,
      metadata: {
        url: event.url,
        blockType: event.blockType,
        userAction: event.userAction,
        pomodoroId: event.pomodoroId,
      },
    };

    this.pendingTimelineEvents.push(timelineEvent);
    this.savePendingTimelineEvents();
  }

  /**
   * Record an interruption event (Requirements: 7.4)
   */
  async recordInterruptionEvent(
    source: 'blocked_site' | 'tab_switch' | 'idle' | 'manual',
    duration: number,
    details?: { url?: string; idleSeconds?: number }
  ): Promise<void> {
    if (!this.currentPomodoroId) {
      console.log('[ActivityTracker] No active pomodoro, skipping interruption event');
      return;
    }

    const event: InterruptionEvent = {
      timestamp: Date.now(),
      duration,
      source,
      pomodoroId: this.currentPomodoroId,
      details,
    };

    console.log('[ActivityTracker] Recording interruption event:', event);

    // Try to send immediately if callback is set
    if (this.interruptionEventCallback) {
      try {
        await this.interruptionEventCallback(event);
        console.log('[ActivityTracker] Interruption event sent successfully');
      } catch (error) {
        console.error('[ActivityTracker] Failed to send interruption event:', error);
        // Queue as timeline event for later sync
        this.queueInterruptionAsTimelineEvent(event);
      }
    } else {
      // Queue as timeline event for later sync
      this.queueInterruptionAsTimelineEvent(event);
    }
  }

  /**
   * Queue an interruption event as a timeline event for later sync
   */
  private queueInterruptionAsTimelineEvent(event: InterruptionEvent): void {
    let title = 'Interruption';
    switch (event.source) {
      case 'blocked_site':
        title = `Blocked site access${event.details?.url ? `: ${new URL(event.details.url).hostname}` : ''}`;
        break;
      case 'tab_switch':
        title = 'Tab switch during focus';
        break;
      case 'idle':
        title = `Idle for ${event.details?.idleSeconds || event.duration} seconds`;
        break;
      case 'manual':
        title = 'Manual interruption';
        break;
    }

    const timelineEvent: TimelineEvent = {
      type: 'interruption',
      startTime: event.timestamp,
      duration: event.duration,
      title,
      metadata: {
        source: event.source,
        pomodoroId: event.pomodoroId,
        details: event.details,
      },
    };

    this.pendingTimelineEvents.push(timelineEvent);
    this.savePendingTimelineEvents();
  }

  /**
   * Record a generic timeline event
   */
  async recordTimelineEvent(event: TimelineEvent): Promise<void> {
    console.log('[ActivityTracker] Recording timeline event:', event);
    this.pendingTimelineEvents.push(event);
    await this.savePendingTimelineEvents();
  }

  /**
   * Sync pending logs to server
   */
  async syncToServer(): Promise<void> {
    // Sync activity logs
    if (this.pendingLogs.length > 0 && this.syncCallback) {
      const logsToSync = [...this.pendingLogs];
      
      try {
        await this.syncCallback(logsToSync);
        
        // Clear synced logs
        this.pendingLogs = this.pendingLogs.filter(
          log => !logsToSync.includes(log)
        );
        await this.savePendingLogs();
        
        console.log('[ActivityTracker] Synced', logsToSync.length, 'activity logs');
      } catch (error) {
        console.error('[ActivityTracker] Failed to sync activity logs:', error);
        // Keep logs for retry
      }
    }

    // Sync timeline events
    if (this.pendingTimelineEvents.length > 0 && this.timelineEventCallback) {
      const eventsToSync = [...this.pendingTimelineEvents];
      
      try {
        await this.timelineEventCallback(eventsToSync);
        
        // Clear synced events
        this.pendingTimelineEvents = this.pendingTimelineEvents.filter(
          event => !eventsToSync.includes(event)
        );
        await this.savePendingTimelineEvents();
        
        console.log('[ActivityTracker] Synced', eventsToSync.length, 'timeline events');
      } catch (error) {
        console.error('[ActivityTracker] Failed to sync timeline events:', error);
        // Keep events for retry
      }
    }

    // Sync enhanced activities
    if (this.pendingEnhancedActivities.length > 0 && this.enhancedActivityCallback) {
      const activitiesToSync = [...this.pendingEnhancedActivities];
      
      try {
        await this.enhancedActivityCallback(activitiesToSync);
        
        // Clear synced activities
        this.pendingEnhancedActivities = this.pendingEnhancedActivities.filter(
          activity => !activitiesToSync.includes(activity)
        );
        await this.savePendingEnhancedActivities();
        
        console.log('[ActivityTracker] Synced', activitiesToSync.length, 'enhanced activities');
      } catch (error) {
        console.error('[ActivityTracker] Failed to sync enhanced activities:', error);
        // Keep activities for retry
      }
    }
  }

  /**
   * Get pending logs count
   */
  getPendingCount(): number {
    return this.pendingLogs.length;
  }

  /**
   * Get all pending logs
   */
  getPendingLogs(): ActivityLog[] {
    return [...this.pendingLogs];
  }

  /**
   * Get all pending enhanced activities
   */
  getPendingEnhancedActivities(): BrowserActivityPayload[] {
    return [...this.pendingEnhancedActivities];
  }

  /**
   * Finalize all active tracking (e.g., on extension unload)
   */
  finalizeAll(): ActivityLog[] {
    const logs: ActivityLog[] = [];
    for (const tabId of this.activities.keys()) {
      const log = this.finalizeActivity(tabId);
      if (log) {
        logs.push(log);
      }
    }
    return logs;
  }

  /**
   * Get current tracking stats
   */
  getStats(): {
    activeCount: number;
    pendingLogs: number;
    pendingTimelineEvents: number;
    pendingEnhancedActivities: number;
    currentPomodoroId: string | null;
  } {
    return {
      activeCount: this.activities.size,
      pendingLogs: this.pendingLogs.length,
      pendingTimelineEvents: this.pendingTimelineEvents.length,
      pendingEnhancedActivities: this.pendingEnhancedActivities.length,
      currentPomodoroId: this.currentPomodoroId,
    };
  }

  /**
   * Get tracking stats for a specific tab
   */
  getTabStats(tabId: number): EnhancedTabActivity | null {
    return this.activities.get(tabId) || null;
  }

  /**
   * Get all active tab activities
   */
  getActiveActivities(): EnhancedTabActivity[] {
    return Array.from(this.activities.values());
  }
}

// Singleton instance
export const activityTracker = new ActivityTracker();
