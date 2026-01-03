/**
 * Entertainment Manager for Browser Sentinel
 * 
 * Manages entertainment mode state, site matching, and quota tracking.
 * Works with the server-side entertainment service for quota synchronization.
 * 
 * Requirements: 2.1, 2.3, 2.5, 2.6, 2.7, 5.2, 5.3
 */

import type { WorkTimeSlot } from '../types/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface EntertainmentBlacklistEntry {
  domain: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

export interface EntertainmentWhitelistEntry {
  pattern: string;
  description?: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

export interface EntertainmentConfig {
  blacklist: EntertainmentBlacklistEntry[];
  whitelist: EntertainmentWhitelistEntry[];
  quotaMinutes: number;
  cooldownMinutes: number;
  lastSync: number;
}

export interface EntertainmentState {
  isActive: boolean;
  sessionId: string | null;
  startTime: number | null;
  endTime: number | null;
  quotaUsedToday: number;      // minutes
  lastSessionEndTime: number | null;
  sitesVisitedThisSession: string[];
}

export interface EntertainmentStatus {
  isActive: boolean;
  sessionId: string | null;
  startTime: number | null;
  endTime: number | null;
  quotaTotal: number;      // minutes
  quotaUsed: number;       // minutes
  quotaRemaining: number;  // minutes
  cooldownEndTime: number | null;
  lastSessionEndTime: number | null;
  isWithinWorkTime: boolean;
  canStart: boolean;
  cannotStartReason: EntertainmentCannotStartReason | null;
}

export type EntertainmentCannotStartReason = 
  | 'within_work_time' 
  | 'quota_exhausted' 
  | 'cooldown_active' 
  | 'session_already_active';

export interface EntertainmentStartCheck {
  canStart: boolean;
  reason?: EntertainmentCannotStartReason;
  cooldownRemaining?: number;  // minutes
  quotaRemaining?: number;     // minutes
}

export interface EntertainmentStartResult {
  success: boolean;
  sessionId?: string;
  endTime?: number;  // Unix timestamp
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_CONFIG = 'entertainmentConfig';
const STORAGE_KEY_STATE = 'entertainmentState';
const DEFAULT_QUOTA_MINUTES = 120;
const DEFAULT_COOLDOWN_MINUTES = 30;
const DAILY_RESET_HOUR = 4; // 04:00 AM

/**
 * Preset entertainment blacklist domains
 * Requirements: 2.4
 */
export const PRESET_ENTERTAINMENT_BLACKLIST: string[] = [
  'twitter.com',
  'x.com',
  'weibo.com',
  'youtube.com',
  'bilibili.com',
  'tiktok.com',
  'douyin.com',
  'instagram.com',
  'facebook.com',
  'reddit.com',
  'twitch.tv',
];

/**
 * Preset entertainment whitelist patterns
 * Requirements: 2.6
 */
export const PRESET_ENTERTAINMENT_WHITELIST: string[] = [
  'weibo.com/fav/*',
  'twitter.com/i/bookmarks',
  'bilibili.com/video/*',
  'bilibili.com/search/*',
];

// ============================================================================
// Entertainment Manager Class
// ============================================================================

/**
 * Callback type for sending entertainment mode events
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
export type EntertainmentModeEventCallback = (payload: {
  action: 'start' | 'stop';
  sessionId: string;
  timestamp: number;
  quotaUsedBefore: number;
  quotaUsedAfter?: number;
  duration?: number;
  sitesVisited?: string[];
  reason?: 'manual' | 'quota_exhausted' | 'work_time_start';
}) => void;

/**
 * Callback type for when entertainment mode auto-ends
 * Requirements: 5.5, 5.6, 5.10
 */
export type EntertainmentAutoEndCallback = (reason: 'quota_exhausted' | 'work_time_start') => void;

export class EntertainmentManager {
  private config: EntertainmentConfig;
  private state: EntertainmentState;
  private workTimeSlots: WorkTimeSlot[] = [];
  private initialized = false;
  private sendEventCallback: EntertainmentModeEventCallback | null = null;
  private autoEndCallback: EntertainmentAutoEndCallback | null = null;
  
  // Timer for quota monitoring (Requirements: 5.5, 5.6)
  private quotaMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private workTimeMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private readonly QUOTA_CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
  private readonly WORK_TIME_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

  constructor() {
    this.config = this.getDefaultConfig();
    this.state = this.getDefaultState();
  }

  /**
   * Set callback for sending entertainment mode events
   * Requirements: 12.1, 12.2, 12.3, 12.4
   */
  setSendEventCallback(callback: EntertainmentModeEventCallback): void {
    this.sendEventCallback = callback;
  }

  /**
   * Set callback for when entertainment mode auto-ends
   * Requirements: 5.5, 5.6, 5.10
   */
  setAutoEndCallback(callback: EntertainmentAutoEndCallback): void {
    this.autoEndCallback = callback;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the entertainment manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const result = await chrome.storage.local.get([STORAGE_KEY_CONFIG, STORAGE_KEY_STATE]);
      
      if (result[STORAGE_KEY_CONFIG]) {
        this.config = { ...this.getDefaultConfig(), ...result[STORAGE_KEY_CONFIG] };
      }
      
      if (result[STORAGE_KEY_STATE]) {
        this.state = { ...this.getDefaultState(), ...result[STORAGE_KEY_STATE] };
      }

      // Check if we need to reset for a new day
      await this.checkDailyReset();

      this.initialized = true;
      console.log('[EntertainmentManager] Initialized');
    } catch (error) {
      console.error('[EntertainmentManager] Failed to initialize:', error);
      this.initialized = true;
    }
  }

  private getDefaultConfig(): EntertainmentConfig {
    return {
      blacklist: PRESET_ENTERTAINMENT_BLACKLIST.map(domain => ({
        domain,
        isPreset: true,
        enabled: true,
        addedAt: Date.now(),
      })),
      whitelist: PRESET_ENTERTAINMENT_WHITELIST.map(pattern => ({
        pattern,
        isPreset: true,
        enabled: true,
        addedAt: Date.now(),
      })),
      quotaMinutes: DEFAULT_QUOTA_MINUTES,
      cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
      lastSync: 0,
    };
  }

  private getDefaultState(): EntertainmentState {
    return {
      isActive: false,
      sessionId: null,
      startTime: null,
      endTime: null,
      quotaUsedToday: 0,
      lastSessionEndTime: null,
      sitesVisitedThisSession: [],
    };
  }

  // ==========================================================================
  // Configuration Management
  // ==========================================================================

  /**
   * Update configuration from server sync
   */
  async updateConfig(newConfig: Partial<EntertainmentConfig>): Promise<void> {
    this.config = {
      ...this.config,
      ...newConfig,
      lastSync: Date.now(),
    };
    await this.saveConfig();
  }

  /**
   * Update work time slots (from policy sync)
   */
  setWorkTimeSlots(slots: WorkTimeSlot[]): void {
    this.workTimeSlots = slots;
  }

  /**
   * Get current configuration
   */
  getConfig(): EntertainmentConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Entertainment Mode Control
  // ==========================================================================

  /**
   * Check if entertainment mode can be started
   * Requirements: 5.2, 5.3
   */
  canStartEntertainment(): EntertainmentStartCheck {
    // Check if already active
    if (this.state.isActive) {
      return {
        canStart: false,
        reason: 'session_already_active',
        quotaRemaining: this.getQuotaRemaining(),
      };
    }

    // Check work time
    if (this.isWithinWorkTime()) {
      return {
        canStart: false,
        reason: 'within_work_time',
        quotaRemaining: this.getQuotaRemaining(),
      };
    }

    // Check quota
    const quotaRemaining = this.getQuotaRemaining();
    if (quotaRemaining <= 0) {
      return {
        canStart: false,
        reason: 'quota_exhausted',
        quotaRemaining: 0,
      };
    }

    // Check cooldown
    const cooldownRemaining = this.getCooldownRemaining();
    if (cooldownRemaining > 0) {
      return {
        canStart: false,
        reason: 'cooldown_active',
        cooldownRemaining,
        quotaRemaining,
      };
    }

    return {
      canStart: true,
      quotaRemaining,
    };
  }

  /**
   * Start entertainment mode
   * Requirements: 5.2, 5.3, 12.1, 12.2
   */
  async startEntertainment(): Promise<EntertainmentStartResult> {
    const check = this.canStartEntertainment();
    
    if (!check.canStart) {
      const errorMessages: Record<EntertainmentCannotStartReason, string> = {
        session_already_active: 'Entertainment mode is already active',
        within_work_time: '仅在非工作时间可用',
        quota_exhausted: '今日配额已用完',
        cooldown_active: `冷却中，还需等待 ${check.cooldownRemaining} 分钟`,
      };

      return {
        success: false,
        error: errorMessages[check.reason!],
      };
    }

    const sessionId = this.generateSessionId();
    const startTime = Date.now();
    const endTime = startTime + (check.quotaRemaining! * 60 * 1000);
    const quotaUsedBefore = this.state.quotaUsedToday;

    this.state = {
      ...this.state,
      isActive: true,
      sessionId,
      startTime,
      endTime,
      sitesVisitedThisSession: [],
    };

    await this.saveState();

    // Start monitoring for quota exhaustion and work time start (Requirements: 5.5, 5.6, 5.3)
    this.startMonitoring();

    // Send ENTERTAINMENT_MODE start event (Requirements: 12.1, 12.2)
    if (this.sendEventCallback) {
      this.sendEventCallback({
        action: 'start',
        sessionId,
        timestamp: startTime,
        quotaUsedBefore,
      });
    }

    return {
      success: true,
      sessionId,
      endTime,
    };
  }

  /**
   * Stop entertainment mode
   * Requirements: 5.9, 5.14, 12.3, 12.4
   * @param reason - The reason for stopping (manual, quota_exhausted, work_time_start)
   */
  async stopEntertainment(reason: 'manual' | 'quota_exhausted' | 'work_time_start' = 'manual'): Promise<void> {
    if (!this.state.isActive || !this.state.startTime) {
      return;
    }

    // Stop monitoring timers
    this.stopMonitoring();

    const endTime = Date.now();
    const durationMs = endTime - this.state.startTime;
    const durationMinutes = Math.ceil(durationMs / 60000);
    const durationSeconds = Math.floor(durationMs / 1000);
    const quotaUsedBefore = this.state.quotaUsedToday;
    const quotaUsedAfter = quotaUsedBefore + durationMinutes;
    const sessionId = this.state.sessionId!;
    const sitesVisited = [...this.state.sitesVisitedThisSession];

    this.state = {
      ...this.state,
      isActive: false,
      sessionId: null,
      startTime: null,
      endTime: null,
      quotaUsedToday: quotaUsedAfter,
      lastSessionEndTime: endTime,
      sitesVisitedThisSession: [],
    };

    await this.saveState();

    // Send ENTERTAINMENT_MODE stop event (Requirements: 12.3, 12.4)
    if (this.sendEventCallback) {
      this.sendEventCallback({
        action: 'stop',
        sessionId,
        timestamp: endTime,
        quotaUsedBefore,
        quotaUsedAfter,
        duration: durationSeconds,
        sitesVisited,
        reason,
      });
    }
  }

  // ==========================================================================
  // Quota and Work Time Monitoring (Requirements: 5.5, 5.6, 5.3)
  // ==========================================================================

  /**
   * Start monitoring quota usage and work time
   * Called when entertainment mode starts
   * Requirements: 5.5, 5.6, 5.3
   */
  private startMonitoring(): void {
    // Stop any existing monitors
    this.stopMonitoring();

    // Start quota monitoring (Requirements: 5.5, 5.6)
    this.quotaMonitorInterval = setInterval(() => {
      this.checkQuotaExhaustion();
    }, this.QUOTA_CHECK_INTERVAL_MS);

    // Start work time monitoring (Requirements: 5.3)
    this.workTimeMonitorInterval = setInterval(() => {
      this.checkWorkTimeStart();
    }, this.WORK_TIME_CHECK_INTERVAL_MS);

    console.log('[EntertainmentManager] Started quota and work time monitoring');
  }

  /**
   * Stop monitoring timers
   */
  private stopMonitoring(): void {
    if (this.quotaMonitorInterval) {
      clearInterval(this.quotaMonitorInterval);
      this.quotaMonitorInterval = null;
    }
    if (this.workTimeMonitorInterval) {
      clearInterval(this.workTimeMonitorInterval);
      this.workTimeMonitorInterval = null;
    }
  }

  /**
   * Check if quota is exhausted and auto-end if so
   * Requirements: 5.5, 5.6
   */
  private async checkQuotaExhaustion(): Promise<void> {
    if (!this.state.isActive) return;

    const quotaRemaining = this.getQuotaRemaining();
    
    if (quotaRemaining <= 0) {
      console.log('[EntertainmentManager] Quota exhausted, auto-ending entertainment mode');
      await this.stopEntertainment('quota_exhausted');
      
      // Notify via callback (for tab closure, etc.)
      if (this.autoEndCallback) {
        this.autoEndCallback('quota_exhausted');
      }
    }
  }

  /**
   * Check if work time has started and auto-end if so
   * Requirements: 5.3
   */
  private async checkWorkTimeStart(): Promise<void> {
    if (!this.state.isActive) return;

    if (this.isWithinWorkTime()) {
      console.log('[EntertainmentManager] Work time started, auto-ending entertainment mode');
      await this.stopEntertainment('work_time_start');
      
      // Notify via callback (for tab closure, etc.)
      if (this.autoEndCallback) {
        this.autoEndCallback('work_time_start');
      }
    }
  }

  /**
   * Get the scheduled end time for the current session
   * Returns null if no session is active
   */
  getScheduledEndTime(): number | null {
    if (!this.state.isActive || !this.state.startTime) {
      return null;
    }
    
    const quotaRemaining = this.getQuotaRemaining();
    return Date.now() + (quotaRemaining * 60 * 1000);
  }

  /**
   * Get current entertainment status
   */
  getStatus(): EntertainmentStatus {
    const quotaRemaining = this.getQuotaRemaining();
    const cooldownEndTime = this.getCooldownEndTime();
    const check = this.canStartEntertainment();

    return {
      isActive: this.state.isActive,
      sessionId: this.state.sessionId,
      startTime: this.state.startTime,
      endTime: this.state.endTime,
      quotaTotal: this.config.quotaMinutes,
      quotaUsed: this.state.quotaUsedToday,
      quotaRemaining,
      cooldownEndTime,
      lastSessionEndTime: this.state.lastSessionEndTime,
      isWithinWorkTime: this.isWithinWorkTime(),
      canStart: check.canStart,
      cannotStartReason: check.reason || null,
    };
  }

  // ==========================================================================
  // Site Matching Logic
  // ==========================================================================

  /**
   * Check if a URL is an entertainment site (matches blacklist)
   * Requirements: 2.1, 2.3
   */
  isEntertainmentSite(url: string): boolean {
    const hostname = this.extractHostname(url);
    if (!hostname) return false;

    const enabledBlacklist = this.config.blacklist
      .filter(entry => entry.enabled)
      .map(entry => entry.domain);

    return this.matchesDomainPatterns(hostname, enabledBlacklist);
  }

  /**
   * Check if a URL is whitelisted (allowed even if domain is blacklisted)
   * Requirements: 2.5, 2.6, 2.7
   */
  isWhitelisted(url: string): boolean {
    const enabledWhitelist = this.config.whitelist
      .filter(entry => entry.enabled)
      .map(entry => entry.pattern);

    return this.matchesUrlPatterns(url, enabledWhitelist);
  }

  /**
   * Check if a URL should be blocked as entertainment
   * Returns true if URL is entertainment site AND not whitelisted
   * Requirements: 2.1, 2.5, 2.7
   */
  shouldBlockAsEntertainment(url: string): boolean {
    // If whitelisted, never block
    if (this.isWhitelisted(url)) {
      return false;
    }

    // Block if it's an entertainment site
    return this.isEntertainmentSite(url);
  }

  /**
   * Record a visited entertainment site during active session
   */
  async recordVisitedSite(url: string): Promise<void> {
    if (!this.state.isActive) return;

    const hostname = this.extractHostname(url);
    if (!hostname) return;

    if (!this.state.sitesVisitedThisSession.includes(hostname)) {
      this.state.sitesVisitedThisSession.push(hostname);
      await this.saveState();
    }
  }

  // ==========================================================================
  // Quota and Cooldown Management
  // ==========================================================================

  /**
   * Get remaining quota in minutes
   */
  getQuotaRemaining(): number {
    let used = this.state.quotaUsedToday;

    // If session is active, add current session duration
    if (this.state.isActive && this.state.startTime) {
      const currentDuration = Math.ceil((Date.now() - this.state.startTime) / 60000);
      used += currentDuration;
    }

    return Math.max(0, this.config.quotaMinutes - used);
  }

  /**
   * Get cooldown remaining in minutes
   */
  getCooldownRemaining(): number {
    if (!this.state.lastSessionEndTime) return 0;

    const cooldownEndTime = this.state.lastSessionEndTime + (this.config.cooldownMinutes * 60 * 1000);
    const remaining = cooldownEndTime - Date.now();

    return Math.max(0, Math.ceil(remaining / 60000));
  }

  /**
   * Get cooldown end time (Unix timestamp) or null if not in cooldown
   */
  getCooldownEndTime(): number | null {
    if (!this.state.lastSessionEndTime) return null;

    const cooldownEndTime = this.state.lastSessionEndTime + (this.config.cooldownMinutes * 60 * 1000);
    
    if (Date.now() >= cooldownEndTime) return null;

    return cooldownEndTime;
  }

  /**
   * Update quota usage from server sync
   */
  async updateQuotaUsage(usedMinutes: number): Promise<void> {
    this.state.quotaUsedToday = usedMinutes;
    await this.saveState();
  }

  /**
   * Reset daily quota (called at 04:00 AM)
   * Requirements: 5.7
   * 
   * This method:
   * 1. Resets quota used to 0
   * 2. Clears cooldown status (lastSessionEndTime)
   * 3. Saves the updated state
   */
  async resetDailyQuota(): Promise<void> {
    // If there's an active session, stop it first
    if (this.state.isActive) {
      await this.stopEntertainment('manual');
    }
    
    this.state = {
      ...this.state,
      quotaUsedToday: 0,
      lastSessionEndTime: null, // Clear cooldown for new day
      sitesVisitedThisSession: [],
    };
    await this.saveState();
    
    console.log('[EntertainmentManager] Daily quota reset complete');
  }

  // ==========================================================================
  // Cross-Device Quota Sync (Requirements: 5.11, 8.7)
  // ==========================================================================

  /**
   * Sync quota from server when browser extension connects
   * Requirements: 5.11, 8.7
   * 
   * This method fetches the current quota status from the server
   * and updates the local state to match.
   */
  async syncQuotaFromServer(serverStatus: {
    quotaUsed: number;
    quotaTotal: number;
    cooldownEndTime: number | null;
    lastSessionEndTime: number | null;
    isActive: boolean;
    sessionId: string | null;
    startTime: number | null;
    endTime: number | null;
  }): Promise<void> {
    console.log('[EntertainmentManager] Syncing quota from server:', serverStatus);
    
    // Update local state with server values
    this.state = {
      ...this.state,
      quotaUsedToday: serverStatus.quotaUsed,
      lastSessionEndTime: serverStatus.lastSessionEndTime,
      isActive: serverStatus.isActive,
      sessionId: serverStatus.sessionId,
      startTime: serverStatus.startTime,
      endTime: serverStatus.endTime,
    };
    
    // Update config with server quota total
    this.config = {
      ...this.config,
      quotaMinutes: serverStatus.quotaTotal,
      lastSync: Date.now(),
    };
    
    await this.saveState();
    await this.saveConfig();
    
    // If session is active on server, start monitoring
    if (serverStatus.isActive) {
      this.startMonitoring();
    }
    
    console.log('[EntertainmentManager] Quota synced from server, used:', serverStatus.quotaUsed);
  }

  /**
   * Get current quota usage for syncing to server
   * Requirements: 5.11, 8.7
   * 
   * Returns the current quota usage in minutes, including any active session time.
   */
  getQuotaUsageForSync(): number {
    let used = this.state.quotaUsedToday;

    // If session is active, add current session duration
    if (this.state.isActive && this.state.startTime) {
      const currentDuration = Math.ceil((Date.now() - this.state.startTime) / 60000);
      used += currentDuration;
    }

    return used;
  }

  /**
   * Get the last sync timestamp
   */
  getLastSyncTime(): number {
    return this.config.lastSync;
  }

  /**
   * Update last sync timestamp
   */
  async updateLastSyncTime(): Promise<void> {
    this.config.lastSync = Date.now();
    await this.saveConfig();
  }

  // ==========================================================================
  // Work Time Checking
  // ==========================================================================

  /**
   * Check if currently within work time
   * Requirements: 5.2, 5.3
   */
  isWithinWorkTime(): boolean {
    if (!this.workTimeSlots || this.workTimeSlots.length === 0) {
      return false;
    }

    const enabledSlots = this.workTimeSlots.filter(slot => slot.enabled);
    if (enabledSlots.length === 0) {
      return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return enabledSlots.some(slot => {
      const startMinutes = this.parseTimeToMinutes(slot.startTime);
      const endMinutes = this.parseTimeToMinutes(slot.endTime);
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    });
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private extractHostname(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Check if hostname matches any domain pattern
   * Supports exact match and subdomain matching
   */
  private matchesDomainPatterns(hostname: string, patterns: string[]): boolean {
    const lowerHostname = hostname.toLowerCase();

    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();

      // Exact match
      if (lowerHostname === lowerPattern) {
        return true;
      }

      // Subdomain match (e.g., www.twitter.com matches twitter.com)
      if (lowerHostname.endsWith('.' + lowerPattern)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Check if URL matches any whitelist pattern
   * Supports glob-style patterns with * wildcard
   * Requirements: 2.5, 2.6
   */
  private matchesUrlPatterns(url: string, patterns: string[]): boolean {
    try {
      const urlObj = new URL(url);
      const urlWithoutProtocol = urlObj.hostname + urlObj.pathname;
      const lowerUrl = urlWithoutProtocol.toLowerCase();

      return patterns.some(pattern => {
        const lowerPattern = pattern.toLowerCase();
        return this.matchGlobPattern(lowerUrl, lowerPattern);
      });
    } catch {
      return false;
    }
  }

  /**
   * Match URL against glob pattern
   * Supports * as wildcard for any characters
   */
  private matchGlobPattern(url: string, pattern: string): boolean {
    // Convert glob pattern to regex
    // Escape special regex characters except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(url);
  }

  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Check if we need to reset for a new day (04:00 AM reset)
   */
  private async checkDailyReset(): Promise<void> {
    const lastReset = await this.getLastResetDate();
    const today = this.getTodayDate();

    if (lastReset < today.getTime()) {
      await this.resetDailyQuota();
      await this.setLastResetDate(today.getTime());
    }
  }

  private getTodayDate(): Date {
    const now = new Date();
    const today = new Date(now);
    
    if (now.getHours() < DAILY_RESET_HOUR) {
      today.setDate(today.getDate() - 1);
    }
    
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private async getLastResetDate(): Promise<number> {
    try {
      const result = await chrome.storage.local.get(['entertainmentLastReset']);
      return result.entertainmentLastReset || 0;
    } catch {
      return 0;
    }
  }

  private async setLastResetDate(timestamp: number): Promise<void> {
    try {
      await chrome.storage.local.set({ entertainmentLastReset: timestamp });
    } catch (error) {
      console.error('[EntertainmentManager] Failed to save last reset date:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_CONFIG]: this.config });
    } catch (error) {
      console.error('[EntertainmentManager] Failed to save config:', error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_STATE]: this.state });
    } catch (error) {
      console.error('[EntertainmentManager] Failed to save state:', error);
    }
  }
}

// Singleton instance
export const entertainmentManager = new EntertainmentManager();
