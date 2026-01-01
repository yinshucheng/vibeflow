import type { PolicyCache, SystemState, EnforcementMode, EnhancedUrlCheckResult } from '../types/index.js';

const STORAGE_KEY = 'policyCache';

const DEFAULT_POLICY: PolicyCache = {
  globalState: 'PLANNING',
  blacklist: [],
  whitelist: [],
  sessionWhitelist: [],
  lastSync: 0,
  // Enhanced defaults (Requirements 4.1, 6.1)
  enforcementMode: 'gentle',
  workTimeSlots: [],
  skipTokensRemaining: 3,
  skipTokenDailyLimit: 3,
  skipTokenMaxDelay: 15,
  browserRedirectReplace: true,
  isAuthenticated: false,
  dashboardUrl: 'http://localhost:3000',
};

export class PolicyCacheManager {
  private cache: PolicyCache = { ...DEFAULT_POLICY };
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY]) {
        this.cache = { ...DEFAULT_POLICY, ...result[STORAGE_KEY] };
      }
      this.initialized = true;
      console.log('[PolicyCache] Initialized:', this.cache);
    } catch (error) {
      console.error('[PolicyCache] Failed to initialize:', error);
      this.cache = { ...DEFAULT_POLICY };
      this.initialized = true;
    }
  }

  async updatePolicy(policy: Partial<PolicyCache>): Promise<void> {
    this.cache = {
      ...this.cache,
      ...policy,
      lastSync: Date.now(),
    };

    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.cache });
      console.log('[PolicyCache] Updated:', this.cache);
    } catch (error) {
      console.error('[PolicyCache] Failed to save:', error);
    }
  }

  async updateState(state: SystemState): Promise<void> {
    await this.updatePolicy({ globalState: state });
  }

  getPolicy(): PolicyCache {
    return { ...this.cache };
  }

  getState(): SystemState {
    return this.cache.globalState;
  }

  getBlacklist(): string[] {
    return [...this.cache.blacklist];
  }

  getWhitelist(): string[] {
    return [...this.cache.whitelist, ...this.cache.sessionWhitelist];
  }

  async addSessionWhitelist(url: string): Promise<void> {
    const hostname = this.extractHostname(url);
    if (!this.cache.sessionWhitelist.includes(hostname)) {
      this.cache.sessionWhitelist.push(hostname);
      await this.updatePolicy({ sessionWhitelist: this.cache.sessionWhitelist });
    }
  }

  async clearSessionWhitelist(): Promise<void> {
    await this.updatePolicy({ sessionWhitelist: [] });
  }

  private extractHostname(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Check if a URL should be blocked based on current policy
   * @returns 'allow' | 'block' | 'soft_block'
   */
  shouldBlock(url: string): 'allow' | 'block' | 'soft_block' {
    // Only block during FOCUS state
    if (this.cache.globalState !== 'FOCUS') {
      return 'allow';
    }

    const hostname = this.extractHostname(url);
    
    // Skip internal URLs
    if (this.isInternalUrl(url)) {
      return 'allow';
    }

    // Check whitelist first (including session whitelist)
    const allWhitelist = [...this.cache.whitelist, ...this.cache.sessionWhitelist];
    if (this.matchesPatterns(hostname, allWhitelist)) {
      return 'allow';
    }

    // Check blacklist
    if (this.matchesPatterns(hostname, this.cache.blacklist)) {
      return 'block';
    }

    // Unknown URL - soft block for intervention
    return 'soft_block';
  }

  private isInternalUrl(url: string): boolean {
    return (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url.startsWith('moz-extension://') ||
      url === ''
    );
  }

  private matchesPatterns(hostname: string, patterns: string[]): boolean {
    const lowerHostname = hostname.toLowerCase();
    
    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();
      
      // Exact match
      if (lowerHostname === lowerPattern) {
        return true;
      }

      // Wildcard match (*.example.com)
      if (lowerPattern.startsWith('*.')) {
        const domain = lowerPattern.slice(2);
        return lowerHostname === domain || lowerHostname.endsWith('.' + domain);
      }

      // Subdomain match (example.com matches www.example.com)
      if (lowerHostname.endsWith('.' + lowerPattern)) {
        return true;
      }

      // Contains match for simple patterns
      if (!lowerPattern.includes('.') && lowerHostname.includes(lowerPattern)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Check if cache is stale (older than 5 minutes)
   */
  isStale(): boolean {
    const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    return Date.now() - this.cache.lastSync > STALE_THRESHOLD;
  }

  /**
   * Check if currently within configured work hours
   * Requirements: 6.1
   */
  isWithinWorkHours(): boolean {
    const slots = this.cache.workTimeSlots;
    if (!slots || slots.length === 0) {
      return false;
    }

    const enabledSlots = slots.filter(slot => slot.enabled);
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

  /**
   * Parse time string (HH:mm) to minutes since midnight
   */
  private parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Get enforcement mode
   * Requirements: 4.1
   */
  getEnforcementMode(): EnforcementMode {
    return this.cache.enforcementMode;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.cache.isAuthenticated;
  }

  /**
   * Get remaining skip tokens
   * Requirements: 5.4
   */
  getSkipTokensRemaining(): number {
    return this.cache.skipTokensRemaining;
  }

  /**
   * Get dashboard URL
   */
  getDashboardUrl(): string {
    return this.cache.dashboardUrl || 'http://localhost:3000';
  }

  /**
   * Get browser redirect replace setting
   * Requirements: 6.6
   */
  shouldReplaceTab(): boolean {
    return this.cache.browserRedirectReplace;
  }

  /**
   * Enhanced URL blocking check with work time and mode awareness
   * Requirements: 4.3, 6.1
   */
  shouldBlockEnhanced(url: string, isPomodoroActive: boolean = false): EnhancedUrlCheckResult {
    const baseResult: EnhancedUrlCheckResult = {
      action: 'allow',
      enforcementMode: this.cache.enforcementMode,
      isWithinWorkHours: this.isWithinWorkHours(),
      isPomodoroActive,
      skipTokensRemaining: this.cache.skipTokensRemaining,
    };

    // Skip internal URLs
    if (this.isInternalUrl(url)) {
      return baseResult;
    }

    // Only block during work hours when no pomodoro is active (Requirements 6.1)
    if (!baseResult.isWithinWorkHours) {
      return baseResult;
    }

    // If pomodoro is active, allow navigation (user is working)
    if (isPomodoroActive) {
      return baseResult;
    }

    const hostname = this.extractHostname(url);

    // Check whitelist first (including session whitelist)
    const allWhitelist = [...this.cache.whitelist, ...this.cache.sessionWhitelist];
    if (this.matchesPatterns(hostname, allWhitelist)) {
      return baseResult;
    }

    // Check blacklist
    if (this.matchesPatterns(hostname, this.cache.blacklist)) {
      baseResult.blockedUrl = url;
      
      // Strict mode: immediate block (Requirements 4.3)
      if (this.cache.enforcementMode === 'strict') {
        baseResult.action = 'block';
      } else {
        // Gentle mode: soft block with warning (Requirements 4.6, 6.7)
        baseResult.action = 'soft_block';
      }
      return baseResult;
    }

    // Unknown URL during work hours without pomodoro - soft block for intervention
    baseResult.action = 'soft_block';
    baseResult.blockedUrl = url;
    return baseResult;
  }

  /**
   * Consume a skip token locally (will be synced to server)
   * Requirements: 5.2, 5.3
   */
  consumeSkipToken(): boolean {
    if (this.cache.skipTokensRemaining <= 0) {
      return false;
    }
    this.cache.skipTokensRemaining--;
    chrome.storage.local.set({ [STORAGE_KEY]: this.cache }).catch(console.error);
    return true;
  }

  /**
   * Update skip tokens from server
   */
  updateSkipTokens(remaining: number): void {
    this.cache.skipTokensRemaining = remaining;
    chrome.storage.local.set({ [STORAGE_KEY]: this.cache }).catch(console.error);
  }
}

// Singleton instance
export const policyCache = new PolicyCacheManager();
