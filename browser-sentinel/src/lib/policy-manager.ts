import type { PolicyCache, SystemState, UrlCheckResult, EnforcementMode, WorkTimeSlot, EnhancedUrlCheckResult } from '../types/index.js';

const STORAGE_KEY = 'policyCache';
const RULES_STORAGE_KEY = 'blockingRules';

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

/**
 * PolicyManager handles URL blocking logic and declarativeNetRequest rules
 */
export class PolicyManager {
  private policy: PolicyCache = { ...DEFAULT_POLICY };
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY]) {
        this.policy = { ...DEFAULT_POLICY, ...result[STORAGE_KEY] };
      }
      this.initialized = true;
      console.log('[PolicyManager] Initialized');
    } catch (error) {
      console.error('[PolicyManager] Failed to initialize:', error);
      this.initialized = true;
    }
  }

  /**
   * Update the policy from server sync
   */
  async updatePolicy(newPolicy: Partial<PolicyCache>): Promise<void> {
    this.policy = {
      ...this.policy,
      ...newPolicy,
      lastSync: Date.now(),
    };

    await this.savePolicy();
    await this.updateBlockingRules();
  }

  /**
   * Update system state
   */
  async updateState(state: SystemState): Promise<void> {
    this.policy.globalState = state;
    this.policy.lastSync = Date.now();

    // Clear session whitelist when leaving FOCUS
    if (state !== 'FOCUS') {
      this.policy.sessionWhitelist = [];
    }

    await this.savePolicy();
    await this.updateBlockingRules();
  }

  /**
   * Add URL to session whitelist (temporary for current pomodoro)
   */
  async addToSessionWhitelist(url: string): Promise<void> {
    const hostname = this.extractHostname(url);
    if (!this.policy.sessionWhitelist.includes(hostname)) {
      this.policy.sessionWhitelist.push(hostname);
      await this.savePolicy();
    }
  }

  /**
   * Clear session whitelist
   */
  async clearSessionWhitelist(): Promise<void> {
    this.policy.sessionWhitelist = [];
    await this.savePolicy();
  }

  /**
   * Check if a URL should be blocked
   */
  shouldBlock(url: string): UrlCheckResult {
    // Only block during FOCUS state
    if (this.policy.globalState !== 'FOCUS') {
      return 'allow';
    }

    // Skip internal URLs
    if (this.isInternalUrl(url)) {
      return 'allow';
    }

    const hostname = this.extractHostname(url);

    // Check whitelist first (including session whitelist)
    const allWhitelist = [...this.policy.whitelist, ...this.policy.sessionWhitelist];
    if (this.matchesPatterns(hostname, allWhitelist)) {
      return 'allow';
    }

    // Check blacklist
    if (this.matchesPatterns(hostname, this.policy.blacklist)) {
      return 'block';
    }

    // Unknown URL - soft block for intervention
    return 'soft_block';
  }

  /**
   * Get current policy
   */
  getPolicy(): PolicyCache {
    return { ...this.policy };
  }

  /**
   * Get current system state
   */
  getState(): SystemState {
    return this.policy.globalState;
  }

  /**
   * Check if policy is stale
   */
  isStale(): boolean {
    const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    return Date.now() - this.policy.lastSync > STALE_THRESHOLD;
  }

  /**
   * Check if currently within configured work hours
   * Requirements: 6.1
   */
  isWithinWorkHours(): boolean {
    const slots = this.policy.workTimeSlots;
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
    return this.policy.enforcementMode;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.policy.isAuthenticated;
  }

  /**
   * Get remaining skip tokens
   * Requirements: 5.4
   */
  getSkipTokensRemaining(): number {
    return this.policy.skipTokensRemaining;
  }

  /**
   * Get dashboard URL
   */
  getDashboardUrl(): string {
    return this.policy.dashboardUrl || 'http://localhost:3000';
  }

  /**
   * Get browser redirect replace setting
   * Requirements: 6.6
   */
  shouldReplaceTab(): boolean {
    return this.policy.browserRedirectReplace;
  }

  /**
   * Enhanced URL blocking check with work time and mode awareness
   * Requirements: 4.3, 6.1
   */
  shouldBlockEnhanced(url: string, isPomodoroActive: boolean = false): EnhancedUrlCheckResult {
    const baseResult: EnhancedUrlCheckResult = {
      action: 'allow',
      enforcementMode: this.policy.enforcementMode,
      isWithinWorkHours: this.isWithinWorkHours(),
      isPomodoroActive,
      skipTokensRemaining: this.policy.skipTokensRemaining,
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
    const allWhitelist = [...this.policy.whitelist, ...this.policy.sessionWhitelist];
    if (this.matchesPatterns(hostname, allWhitelist)) {
      return baseResult;
    }

    // Check blacklist
    if (this.matchesPatterns(hostname, this.policy.blacklist)) {
      baseResult.blockedUrl = url;
      
      // Strict mode: immediate block (Requirements 4.3)
      if (this.policy.enforcementMode === 'strict') {
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
    if (this.policy.skipTokensRemaining <= 0) {
      return false;
    }
    this.policy.skipTokensRemaining--;
    this.savePolicy();
    return true;
  }

  /**
   * Update skip tokens from server
   */
  updateSkipTokens(remaining: number): void {
    this.policy.skipTokensRemaining = remaining;
    this.savePolicy();
  }

  /**
   * Update Chrome's declarativeNetRequest rules
   */
  private async updateBlockingRules(): Promise<void> {
    try {
      // Get existing dynamic rules
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const existingIds = existingRules.map(rule => rule.id);

      // Only apply blocking rules during FOCUS state
      if (this.policy.globalState !== 'FOCUS') {
        // Remove all rules when not in FOCUS
        if (existingIds.length > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingIds,
          });
        }
        console.log('[PolicyManager] Cleared blocking rules (not in FOCUS)');
        return;
      }

      // Create rules for blacklisted domains
      const rules = this.createBlockingRules();

      // Update rules
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
        addRules: rules,
      });

      console.log('[PolicyManager] Updated blocking rules:', rules.length);
    } catch (error) {
      console.error('[PolicyManager] Failed to update blocking rules:', error);
    }
  }

  /**
   * Create declarativeNetRequest rules from blacklist
   */
  private createBlockingRules(): chrome.declarativeNetRequest.Rule[] {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    const screensaverUrl = chrome.runtime.getURL('screensaver.html');

    this.policy.blacklist.forEach((pattern, index) => {
      // Skip patterns that are in whitelist
      if (this.policy.whitelist.includes(pattern)) {
        return;
      }

      const urlFilter = this.patternToUrlFilter(pattern);
      
      rules.push({
        id: index + 1,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: {
            url: screensaverUrl,
          },
        },
        condition: {
          urlFilter,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
          excludedInitiatorDomains: this.policy.whitelist.map(w => 
            w.startsWith('*.') ? w.slice(2) : w
          ),
        },
      });
    });

    return rules;
  }

  /**
   * Convert pattern to declarativeNetRequest urlFilter format
   */
  private patternToUrlFilter(pattern: string): string {
    // Handle wildcard patterns
    if (pattern.startsWith('*.')) {
      // *.example.com -> ||example.com
      return `||${pattern.slice(2)}`;
    }
    
    // Regular domain -> ||domain
    return `||${pattern}`;
  }

  /**
   * Extract hostname from URL
   */
  private extractHostname(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Check if URL is internal (should not be blocked)
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
   * Check if hostname matches any pattern in the list
   */
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

      // Contains match for simple patterns (no dots)
      if (!lowerPattern.includes('.') && lowerHostname.includes(lowerPattern)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Save policy to storage
   */
  private async savePolicy(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.policy });
    } catch (error) {
      console.error('[PolicyManager] Failed to save policy:', error);
    }
  }

  /**
   * Get blocking statistics
   */
  async getBlockingStats(): Promise<{ rulesCount: number; blockedToday: number }> {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return {
      rulesCount: rules.length,
      blockedToday: 0, // Would need to track this separately
    };
  }
}

// Singleton instance
export const policyManager = new PolicyManager();
