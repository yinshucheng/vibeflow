/**
 * Policy Cache Module
 * 
 * Caches enforcement policy locally for offline mode operation.
 * When the desktop app loses connection to the server, it continues
 * enforcing focus using the cached policy.
 * 
 * Requirements: 9.1, 9.2
 */

import Store from 'electron-store';
import type { DesktopPolicy, PolicyTimeSlot, PolicySkipTokenConfig, PolicyDistractionApp, PolicySleepTime, PolicyAdhocFocusSession, PolicyOverRest } from '../types';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Cached policy with metadata
 */
export interface CachedPolicy {
  /** The actual policy data */
  policy: DesktopPolicy;
  /** When the policy was cached */
  cachedAt: number;
  /** When the policy was last synced from server */
  lastSyncedAt: number;
  /** Whether the cache is considered stale */
  isStale: boolean;
}

/**
 * Policy cache configuration
 */
export interface PolicyCacheConfig {
  /** How long before cache is considered stale (ms) - default: 5 minutes */
  staleThresholdMs: number;
  /** Maximum age of cache before it's considered invalid (ms) - default: 24 hours */
  maxCacheAgeMs: number;
}

/**
 * Policy cache state
 */
export interface PolicyCacheState {
  /** Whether cache has been initialized */
  isInitialized: boolean;
  /** Whether cache has valid policy */
  hasValidPolicy: boolean;
  /** Whether cache is stale */
  isStale: boolean;
  /** When policy was last cached */
  lastCachedAt: number | null;
  /** When policy was last synced from server */
  lastSyncedAt: number | null;
  /** Current policy version */
  policyVersion: number | null;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'policyCache';
const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Default policy for when no cached policy exists
 * Requirements: 9.2
 */
const DEFAULT_POLICY: DesktopPolicy = {
  version: 0,
  enforcementMode: 'gentle',
  blacklist: [],
  whitelist: [],
  workTimeSlots: [],
  skipTokens: {
    remaining: 3,
    maxPerDay: 3,
    delayMinutes: 15,
  },
  distractionApps: [],
  updatedAt: 0,
};

// =============================================================================
// Policy Cache Manager
// =============================================================================

/**
 * PolicyCacheManager
 * 
 * Manages local caching of enforcement policy for offline operation.
 * Uses electron-store for persistent storage.
 * 
 * Requirements: 9.1, 9.2
 */
export class PolicyCacheManager {
  private store: Store<{ [STORAGE_KEY]: CachedPolicy | null }>;
  private config: PolicyCacheConfig;
  private cachedPolicy: CachedPolicy | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<PolicyCacheConfig> = {}) {
    this.config = {
      staleThresholdMs: config.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS,
      maxCacheAgeMs: config.maxCacheAgeMs ?? DEFAULT_MAX_CACHE_AGE_MS,
    };

    this.store = new Store<{ [STORAGE_KEY]: CachedPolicy | null }>({
      name: 'vibeflow-policy-cache',
      defaults: {
        [STORAGE_KEY]: null,
      },
    });
  }

  /**
   * Initialize the cache by loading from persistent storage
   */
  initialize(): void {
    if (this.initialized) return;

    try {
      const stored = this.store.get(STORAGE_KEY);
      if (stored && this.isValidCache(stored)) {
        this.cachedPolicy = {
          ...stored,
          isStale: this.isStaleCache(stored),
        };
        console.log('[PolicyCache] Initialized with cached policy, version:', stored.policy.version);
      } else {
        console.log('[PolicyCache] No valid cached policy found, using defaults');
        this.cachedPolicy = null;
      }
      this.initialized = true;
    } catch (error) {
      console.error('[PolicyCache] Failed to initialize:', error);
      this.cachedPolicy = null;
      this.initialized = true;
    }
  }

  /**
   * Update the cached policy from server
   * Requirements: 9.2
   */
  updatePolicy(policy: DesktopPolicy): void {
    const now = Date.now();
    
    this.cachedPolicy = {
      policy,
      cachedAt: now,
      lastSyncedAt: now,
      isStale: false,
    };

    try {
      this.store.set(STORAGE_KEY, this.cachedPolicy);
      console.log('[PolicyCache] Policy updated, version:', policy.version);
    } catch (error) {
      console.error('[PolicyCache] Failed to persist policy:', error);
    }
  }

  /**
   * Get the cached policy
   * Returns default policy if no valid cache exists
   * Requirements: 9.1, 9.2
   */
  getPolicy(): DesktopPolicy {
    if (!this.initialized) {
      this.initialize();
    }

    if (this.cachedPolicy && this.isValidCache(this.cachedPolicy)) {
      return this.cachedPolicy.policy;
    }

    return DEFAULT_POLICY;
  }

  /**
   * Get the full cached policy with metadata
   */
  getCachedPolicy(): CachedPolicy | null {
    if (!this.initialized) {
      this.initialize();
    }

    if (this.cachedPolicy) {
      // Update stale status
      this.cachedPolicy.isStale = this.isStaleCache(this.cachedPolicy);
    }

    return this.cachedPolicy;
  }

  /**
   * Get current cache state
   */
  getState(): PolicyCacheState {
    if (!this.initialized) {
      this.initialize();
    }

    const cached = this.cachedPolicy;
    const isValid = cached !== null && this.isValidCache(cached);

    return {
      isInitialized: this.initialized,
      hasValidPolicy: isValid,
      isStale: cached ? this.isStaleCache(cached) : true,
      lastCachedAt: cached?.cachedAt ?? null,
      lastSyncedAt: cached?.lastSyncedAt ?? null,
      policyVersion: cached?.policy.version ?? null,
    };
  }

  /**
   * Check if cache is stale (older than threshold)
   */
  isStale(): boolean {
    if (!this.cachedPolicy) return true;
    return this.isStaleCache(this.cachedPolicy);
  }

  /**
   * Check if cache has valid policy
   */
  hasValidPolicy(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.cachedPolicy !== null && this.isValidCache(this.cachedPolicy);
  }

  /**
   * Clear the cached policy
   */
  clearCache(): void {
    this.cachedPolicy = null;
    try {
      this.store.delete(STORAGE_KEY);
      console.log('[PolicyCache] Cache cleared');
    } catch (error) {
      console.error('[PolicyCache] Failed to clear cache:', error);
    }
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<PolicyCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): PolicyCacheConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // Policy Accessor Methods (for offline enforcement)
  // ===========================================================================

  /**
   * Get enforcement mode from cached policy
   */
  getEnforcementMode(): 'strict' | 'gentle' {
    return this.getPolicy().enforcementMode;
  }

  /**
   * Get work time slots from cached policy
   */
  getWorkTimeSlots(): PolicyTimeSlot[] {
    return this.getPolicy().workTimeSlots;
  }

  /**
   * Get skip token config from cached policy
   */
  getSkipTokenConfig(): PolicySkipTokenConfig {
    return this.getPolicy().skipTokens;
  }

  /**
   * Get distraction apps from cached policy
   */
  getDistractionApps(): PolicyDistractionApp[] {
    return this.getPolicy().distractionApps;
  }

  /**
   * Get sleep time config from cached policy
   */
  getSleepTimeConfig(): PolicySleepTime | undefined {
    return this.getPolicy().sleepTime;
  }

  /**
   * Get ad-hoc focus session from cached policy
   */
  getAdhocFocusSession(): PolicyAdhocFocusSession | undefined {
    return this.getPolicy().adhocFocusSession;
  }

  /**
   * Get over rest config from cached policy
   */
  getOverRestConfig(): PolicyOverRest | undefined {
    return this.getPolicy().overRest;
  }

  /**
   * Check if currently within work hours based on cached policy
   */
  isWithinWorkHours(): boolean {
    const slots = this.getWorkTimeSlots();
    if (!slots || slots.length === 0) {
      return false;
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0-6 (Sunday = 0)
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return slots.some(slot => {
      if (slot.dayOfWeek !== currentDay) return false;
      
      const startMinutes = slot.startHour * 60 + slot.startMinute;
      const endMinutes = slot.endHour * 60 + slot.endMinute;
      
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    });
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check if cached policy is valid (not too old)
   */
  private isValidCache(cached: CachedPolicy): boolean {
    const age = Date.now() - cached.cachedAt;
    return age < this.config.maxCacheAgeMs;
  }

  /**
   * Check if cached policy is stale (needs refresh)
   */
  private isStaleCache(cached: CachedPolicy): boolean {
    const age = Date.now() - cached.lastSyncedAt;
    return age > this.config.staleThresholdMs;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let policyCacheInstance: PolicyCacheManager | null = null;

/**
 * Get the policy cache singleton
 */
export function getPolicyCache(): PolicyCacheManager {
  if (!policyCacheInstance) {
    policyCacheInstance = new PolicyCacheManager();
    policyCacheInstance.initialize();
  }
  return policyCacheInstance;
}

/**
 * Initialize policy cache with custom config
 */
export function initializePolicyCache(config: Partial<PolicyCacheConfig> = {}): PolicyCacheManager {
  if (policyCacheInstance) {
    policyCacheInstance.updateConfig(config);
  } else {
    policyCacheInstance = new PolicyCacheManager(config);
    policyCacheInstance.initialize();
  }
  return policyCacheInstance;
}

/**
 * Reset policy cache singleton (for testing)
 */
export function resetPolicyCache(): void {
  if (policyCacheInstance) {
    policyCacheInstance.clearCache();
    policyCacheInstance = null;
  }
}

export { PolicyCacheManager as default };
