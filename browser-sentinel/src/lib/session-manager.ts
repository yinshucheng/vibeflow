/**
 * Session Manager
 * 
 * Manages browsing sessions with start/end timestamps, aggregates domain-level
 * activity data, and detects rapid tab switching patterns.
 * 
 * Requirements: 5.13, 5.14, 5.15, 5.17
 */

import type {
  BrowserSessionPayload,
  DomainBreakdownEntry,
  ActivityCategory,
} from '../types/index.js';

// Configuration
const RAPID_SWITCH_THRESHOLD_MS = 3000; // 3 seconds
const SESSION_STORAGE_KEY = 'currentSession';
const SESSION_HISTORY_KEY = 'sessionHistory';
const MAX_SESSION_HISTORY = 50;

/**
 * Domain activity data for aggregation
 */
interface DomainActivity {
  domain: string;
  totalDuration: number;
  activeDuration: number;
  category: ActivityCategory;
  visitCount: number;
  lastVisitTime: number;
}

/**
 * Tab switch record for pattern detection
 */
interface TabSwitchRecord {
  timestamp: number;
  fromDomain: string;
  toDomain: string;
  timeSinceLastSwitch: number;
}

/**
 * Session state
 */
interface SessionState {
  sessionId: string;
  startTime: number;
  lastActivityTime: number;
  isBrowserFocused: boolean;
  focusStartTime: number | null;
  totalFocusedTime: number;
  domainActivities: Map<string, DomainActivity>;
  tabSwitches: TabSwitchRecord[];
  rapidSwitchCount: number;
  currentDomain: string | null;
  currentDomainStartTime: number | null;
}

/**
 * Session summary for reporting
 */
export interface SessionSummary {
  sessionId: string;
  startTime: number;
  duration: number;
  activeDuration: number;
  tabSwitchCount: number;
  rapidSwitchCount: number;
  uniqueDomains: string[];
  productivityScore: number;
  domainBreakdown: DomainBreakdownEntry[];
}

export class SessionManager {
  private session: SessionState | null = null;
  private lastTabSwitchTime: number = 0;
  private sessionEventCallback: ((event: BrowserSessionPayload) => Promise<void>) | null = null;

  /**
   * Initialize the session manager
   */
  async initialize(): Promise<void> {
    // Try to restore session from storage
    try {
      const result = await chrome.storage.local.get([SESSION_STORAGE_KEY]);
      if (result[SESSION_STORAGE_KEY]) {
        const savedSession = result[SESSION_STORAGE_KEY];
        // Restore session if it's less than 30 minutes old
        if (Date.now() - savedSession.lastActivityTime < 30 * 60 * 1000) {
          this.session = {
            ...savedSession,
            domainActivities: new Map(Object.entries(savedSession.domainActivities || {})),
          };
          console.log('[SessionManager] Restored session:', this.session?.sessionId);
        }
      }
    } catch (error) {
      console.error('[SessionManager] Failed to restore session:', error);
    }
  }

  /**
   * Set the callback for session events
   */
  setSessionEventCallback(callback: (event: BrowserSessionPayload) => Promise<void>): void {
    this.sessionEventCallback = callback;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start a new browsing session
   * Requirements: 5.13
   */
  startSession(): string {
    // End existing session if any
    if (this.session) {
      this.endSession();
    }

    const now = Date.now();
    const sessionId = this.generateSessionId();

    this.session = {
      sessionId,
      startTime: now,
      lastActivityTime: now,
      isBrowserFocused: true,
      focusStartTime: now,
      totalFocusedTime: 0,
      domainActivities: new Map(),
      tabSwitches: [],
      rapidSwitchCount: 0,
      currentDomain: null,
      currentDomainStartTime: null,
    };

    this.lastTabSwitchTime = 0;
    this.saveSession();

    console.log('[SessionManager] Started session:', sessionId);
    return sessionId;
  }

  /**
   * End the current session and generate summary
   * Requirements: 5.13
   */
  endSession(): BrowserSessionPayload | null {
    if (!this.session) return null;

    const now = Date.now();
    
    // Finalize current domain tracking
    this.finalizeDomainTracking(now);
    
    // Finalize focus time
    if (this.session.isBrowserFocused && this.session.focusStartTime) {
      this.session.totalFocusedTime += now - this.session.focusStartTime;
    }

    // Generate session payload
    const payload = this.generateSessionPayload(now);

    // Save to history
    this.saveSessionToHistory(payload);

    // Send to server if callback is set
    if (this.sessionEventCallback) {
      this.sessionEventCallback(payload).catch(error => {
        console.error('[SessionManager] Failed to send session event:', error);
      });
    }

    // Clear session
    const sessionId = this.session.sessionId;
    this.session = null;
    this.clearSessionStorage();

    console.log('[SessionManager] Ended session:', sessionId);
    return payload;
  }

  /**
   * Get the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.session?.sessionId || null;
  }

  /**
   * Record a tab switch event
   * Requirements: 5.3, 5.17
   */
  recordTabSwitch(
    fromTabId: number,
    toTabId: number,
    fromUrl: string,
    toUrl: string
  ): void {
    if (!this.session) {
      this.startSession();
    }

    const now = Date.now();
    const fromDomain = this.extractDomain(fromUrl);
    const toDomain = this.extractDomain(toUrl);

    // Calculate time since last switch
    const timeSinceLastSwitch = this.lastTabSwitchTime > 0 
      ? now - this.lastTabSwitchTime 
      : Infinity;

    // Check for rapid switching
    const isRapidSwitch = timeSinceLastSwitch < RAPID_SWITCH_THRESHOLD_MS;
    if (isRapidSwitch) {
      this.session!.rapidSwitchCount++;
    }

    // Record the switch
    const switchRecord: TabSwitchRecord = {
      timestamp: now,
      fromDomain,
      toDomain,
      timeSinceLastSwitch,
    };

    this.session!.tabSwitches.push(switchRecord);
    this.lastTabSwitchTime = now;

    // Update domain tracking
    this.finalizeDomainTracking(now);
    this.startDomainTracking(toDomain, now);

    // Update activity time
    this.session!.lastActivityTime = now;
    this.saveSession();

    console.log('[SessionManager] Tab switch:', fromDomain, '->', toDomain, 
      isRapidSwitch ? '(rapid)' : '');
  }

  /**
   * Record browser focus change
   * Requirements: 5.16
   */
  recordBrowserFocus(isFocused: boolean): void {
    if (!this.session) return;

    const now = Date.now();

    if (isFocused && !this.session.isBrowserFocused) {
      // Browser gained focus
      this.session.focusStartTime = now;
    } else if (!isFocused && this.session.isBrowserFocused) {
      // Browser lost focus
      if (this.session.focusStartTime) {
        this.session.totalFocusedTime += now - this.session.focusStartTime;
        this.session.focusStartTime = null;
      }
    }

    this.session.isBrowserFocused = isFocused;
    this.session.lastActivityTime = now;
    this.saveSession();
  }

  /**
   * Record domain visit with duration
   * Requirements: 5.14
   */
  recordDomainActivity(
    domain: string,
    duration: number,
    activeDuration: number,
    category: ActivityCategory
  ): void {
    if (!this.session) {
      this.startSession();
    }

    const existing = this.session!.domainActivities.get(domain);
    
    if (existing) {
      existing.totalDuration += duration;
      existing.activeDuration += activeDuration;
      existing.visitCount++;
      existing.lastVisitTime = Date.now();
    } else {
      this.session!.domainActivities.set(domain, {
        domain,
        totalDuration: duration,
        activeDuration,
        category,
        visitCount: 1,
        lastVisitTime: Date.now(),
      });
    }

    this.session!.lastActivityTime = Date.now();
    this.saveSession();
  }

  /**
   * Get session summary without ending the session
   */
  getSessionSummary(): SessionSummary | null {
    if (!this.session) return null;

    const now = Date.now();
    const duration = Math.floor((now - this.session.startTime) / 1000);
    
    let activeDuration = Math.floor(this.session.totalFocusedTime / 1000);
    if (this.session.isBrowserFocused && this.session.focusStartTime) {
      activeDuration += Math.floor((now - this.session.focusStartTime) / 1000);
    }

    const domainBreakdown = this.generateDomainBreakdown();
    const productivityScore = this.calculateProductivityScore(domainBreakdown);

    return {
      sessionId: this.session.sessionId,
      startTime: this.session.startTime,
      duration,
      activeDuration,
      tabSwitchCount: this.session.tabSwitches.length,
      rapidSwitchCount: this.session.rapidSwitchCount,
      uniqueDomains: Array.from(this.session.domainActivities.keys()),
      productivityScore,
      domainBreakdown,
    };
  }

  /**
   * Detect if rapid tab switching is occurring
   * Requirements: 5.17
   */
  detectRapidSwitching(): boolean {
    if (!this.session) return false;

    // Check last 10 switches
    const recentSwitches = this.session.tabSwitches.slice(-10);
    if (recentSwitches.length < 3) return false;

    // Count rapid switches in recent history
    const rapidCount = recentSwitches.filter(
      s => s.timeSinceLastSwitch < RAPID_SWITCH_THRESHOLD_MS
    ).length;

    // If more than 50% are rapid switches, flag it
    return rapidCount / recentSwitches.length > 0.5;
  }

  /**
   * Get rapid switch count for current session
   */
  getRapidSwitchCount(): number {
    return this.session?.rapidSwitchCount || 0;
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
   * Start tracking time for a domain
   */
  private startDomainTracking(domain: string, timestamp: number): void {
    if (!this.session) return;
    
    this.session.currentDomain = domain;
    this.session.currentDomainStartTime = timestamp;
  }

  /**
   * Finalize tracking for current domain
   */
  private finalizeDomainTracking(timestamp: number): void {
    if (!this.session || !this.session.currentDomain || !this.session.currentDomainStartTime) {
      return;
    }

    const duration = Math.floor((timestamp - this.session.currentDomainStartTime) / 1000);
    if (duration > 0) {
      const existing = this.session.domainActivities.get(this.session.currentDomain);
      if (existing) {
        existing.totalDuration += duration;
        existing.activeDuration += duration; // Assume active if tracking
        existing.visitCount++;
        existing.lastVisitTime = timestamp;
      } else {
        this.session.domainActivities.set(this.session.currentDomain, {
          domain: this.session.currentDomain,
          totalDuration: duration,
          activeDuration: duration,
          category: this.categorizeDomain(this.session.currentDomain),
          visitCount: 1,
          lastVisitTime: timestamp,
        });
      }
    }

    this.session.currentDomain = null;
    this.session.currentDomainStartTime = null;
  }

  /**
   * Categorize a domain
   */
  private categorizeDomain(domain: string): ActivityCategory {
    const productivePatterns = [
      'github.com', 'gitlab.com', 'stackoverflow.com', 'docs.',
      'developer.', 'localhost', 'notion.so', 'linear.app',
      'figma.com', 'vercel.com', 'aws.amazon.com',
    ];

    const distractingPatterns = [
      'youtube.com', 'twitter.com', 'x.com', 'facebook.com',
      'instagram.com', 'tiktok.com', 'reddit.com', 'netflix.com',
      'twitch.tv', 'discord.com',
    ];

    if (productivePatterns.some(p => domain.includes(p))) {
      return 'productive';
    }
    if (distractingPatterns.some(p => domain.includes(p))) {
      return 'distracting';
    }
    return 'neutral';
  }

  /**
   * Generate domain breakdown for session
   * Requirements: 5.14, 5.15
   */
  private generateDomainBreakdown(): DomainBreakdownEntry[] {
    if (!this.session) return [];

    return Array.from(this.session.domainActivities.values())
      .map(activity => ({
        domain: activity.domain,
        duration: activity.totalDuration,
        activeDuration: activity.activeDuration,
        category: activity.category,
        visitCount: activity.visitCount,
      }))
      .sort((a, b) => b.duration - a.duration);
  }

  /**
   * Calculate productivity score for session
   * Requirements: 5.15
   */
  private calculateProductivityScore(breakdown: DomainBreakdownEntry[]): number {
    if (breakdown.length === 0) return 50;

    let productiveTime = 0;
    let distractingTime = 0;
    let totalTime = 0;

    for (const entry of breakdown) {
      totalTime += entry.duration;
      if (entry.category === 'productive') {
        productiveTime += entry.duration;
      } else if (entry.category === 'distracting') {
        distractingTime += entry.duration;
      }
    }

    if (totalTime === 0) return 50;

    // Score based on productive vs distracting ratio
    const productiveRatio = productiveTime / totalTime;
    const distractingRatio = distractingTime / totalTime;

    // Base score: 50 + (productive% * 50) - (distracting% * 50)
    let score = 50 + (productiveRatio * 50) - (distractingRatio * 50);

    // Penalize rapid switching
    if (this.session && this.session.rapidSwitchCount > 5) {
      score -= Math.min(20, this.session.rapidSwitchCount * 2);
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate session payload for reporting
   */
  private generateSessionPayload(endTime: number): BrowserSessionPayload {
    const session = this.session!;
    const domainBreakdown = this.generateDomainBreakdown();
    
    let productiveTime = 0;
    let distractingTime = 0;
    let neutralTime = 0;

    for (const entry of domainBreakdown) {
      if (entry.category === 'productive') {
        productiveTime += entry.duration;
      } else if (entry.category === 'distracting') {
        distractingTime += entry.duration;
      } else {
        neutralTime += entry.duration;
      }
    }

    const totalDuration = Math.floor((endTime - session.startTime) / 1000);
    let activeDuration = Math.floor(session.totalFocusedTime / 1000);
    if (session.isBrowserFocused && session.focusStartTime) {
      activeDuration += Math.floor((endTime - session.focusStartTime) / 1000);
    }

    return {
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime,
      totalDuration,
      activeDuration,
      domainBreakdown,
      tabSwitchCount: session.tabSwitches.length,
      rapidTabSwitches: session.rapidSwitchCount,
      uniqueDomainsVisited: session.domainActivities.size,
      productiveTime,
      distractingTime,
      neutralTime,
      productivityScore: this.calculateProductivityScore(domainBreakdown),
    };
  }

  /**
   * Save session to storage
   */
  private async saveSession(): Promise<void> {
    if (!this.session) return;

    try {
      // Convert Map to object for storage
      const sessionData = {
        ...this.session,
        domainActivities: Object.fromEntries(this.session.domainActivities),
      };
      await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: sessionData });
    } catch (error) {
      console.error('[SessionManager] Failed to save session:', error);
    }
  }

  /**
   * Clear session from storage
   */
  private async clearSessionStorage(): Promise<void> {
    try {
      await chrome.storage.local.remove(SESSION_STORAGE_KEY);
    } catch (error) {
      console.error('[SessionManager] Failed to clear session storage:', error);
    }
  }

  /**
   * Save session to history
   */
  private async saveSessionToHistory(payload: BrowserSessionPayload): Promise<void> {
    try {
      const result = await chrome.storage.local.get([SESSION_HISTORY_KEY]);
      const history: BrowserSessionPayload[] = result[SESSION_HISTORY_KEY] || [];
      
      // Add new session and trim to max size
      history.unshift(payload);
      if (history.length > MAX_SESSION_HISTORY) {
        history.length = MAX_SESSION_HISTORY;
      }

      await chrome.storage.local.set({ [SESSION_HISTORY_KEY]: history });
    } catch (error) {
      console.error('[SessionManager] Failed to save session to history:', error);
    }
  }

  /**
   * Get session history
   */
  async getSessionHistory(): Promise<BrowserSessionPayload[]> {
    try {
      const result = await chrome.storage.local.get([SESSION_HISTORY_KEY]);
      return result[SESSION_HISTORY_KEY] || [];
    } catch (error) {
      console.error('[SessionManager] Failed to get session history:', error);
      return [];
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
