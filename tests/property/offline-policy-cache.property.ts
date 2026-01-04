import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Feature: desktop-production-resilience
 * Property 12: Offline Mode Policy Caching
 * Validates: Requirements 9.1, 9.2
 * 
 * For any period when the client is offline, the enforcement policy SHALL be
 * retrieved from local cache and enforcement SHALL continue.
 */

// =============================================================================
// MOCK POLICY CACHE IMPLEMENTATION
// Since the actual PolicyCacheManager uses electron-store which requires
// Electron runtime, we test the core logic with a mock implementation
// =============================================================================

interface PolicyTimeSlot {
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface PolicySkipTokenConfig {
  remaining: number;
  maxPerDay: number;
  delayMinutes: number;
}

interface PolicyDistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
}

interface DesktopPolicy {
  version: number;
  enforcementMode: 'strict' | 'gentle';
  workTimeSlots: PolicyTimeSlot[];
  skipTokens: PolicySkipTokenConfig;
  distractionApps: PolicyDistractionApp[];
  updatedAt: number;
}

interface CachedPolicy {
  policy: DesktopPolicy;
  cachedAt: number;
  lastSyncedAt: number;
  isStale: boolean;
}

interface PolicyCacheConfig {
  staleThresholdMs: number;
  maxCacheAgeMs: number;
}

const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const DEFAULT_POLICY: DesktopPolicy = {
  version: 0,
  enforcementMode: 'gentle',
  workTimeSlots: [],
  skipTokens: {
    remaining: 3,
    maxPerDay: 3,
    delayMinutes: 15,
  },
  distractionApps: [],
  updatedAt: 0,
};

/**
 * Mock PolicyCacheManager for testing core logic
 */
class MockPolicyCacheManager {
  private config: PolicyCacheConfig;
  private cachedPolicy: CachedPolicy | null = null;
  private storage: Map<string, unknown> = new Map();

  constructor(config: Partial<PolicyCacheConfig> = {}) {
    this.config = {
      staleThresholdMs: config.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS,
      maxCacheAgeMs: config.maxCacheAgeMs ?? DEFAULT_MAX_CACHE_AGE_MS,
    };
  }

  initialize(): void {
    const stored = this.storage.get('policyCache') as CachedPolicy | undefined;
    if (stored && this.isValidCache(stored)) {
      this.cachedPolicy = {
        ...stored,
        isStale: this.isStaleCache(stored),
      };
    } else {
      this.cachedPolicy = null;
    }
  }

  updatePolicy(policy: DesktopPolicy): void {
    const now = Date.now();
    this.cachedPolicy = {
      policy,
      cachedAt: now,
      lastSyncedAt: now,
      isStale: false,
    };
    this.storage.set('policyCache', this.cachedPolicy);
  }

  getPolicy(): DesktopPolicy {
    if (this.cachedPolicy && this.isValidCache(this.cachedPolicy)) {
      return this.cachedPolicy.policy;
    }
    return DEFAULT_POLICY;
  }

  getCachedPolicy(): CachedPolicy | null {
    if (this.cachedPolicy) {
      this.cachedPolicy.isStale = this.isStaleCache(this.cachedPolicy);
    }
    return this.cachedPolicy;
  }

  isStale(): boolean {
    if (!this.cachedPolicy) return true;
    return this.isStaleCache(this.cachedPolicy);
  }

  hasValidPolicy(): boolean {
    return this.cachedPolicy !== null && this.isValidCache(this.cachedPolicy);
  }

  clearCache(): void {
    this.cachedPolicy = null;
    this.storage.delete('policyCache');
  }

  getEnforcementMode(): 'strict' | 'gentle' {
    return this.getPolicy().enforcementMode;
  }

  getWorkTimeSlots(): PolicyTimeSlot[] {
    return this.getPolicy().workTimeSlots;
  }

  getSkipTokenConfig(): PolicySkipTokenConfig {
    return this.getPolicy().skipTokens;
  }

  getDistractionApps(): PolicyDistractionApp[] {
    return this.getPolicy().distractionApps;
  }

  isWithinWorkHours(currentTime?: Date): boolean {
    const slots = this.getWorkTimeSlots();
    if (!slots || slots.length === 0) {
      return false;
    }

    const now = currentTime ?? new Date();
    const currentDay = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return slots.some(slot => {
      if (slot.dayOfWeek !== currentDay) return false;
      const startMinutes = slot.startHour * 60 + slot.startMinute;
      const endMinutes = slot.endHour * 60 + slot.endMinute;
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    });
  }

  // Simulate time passing for testing
  simulateTimePassing(ms: number): void {
    if (this.cachedPolicy) {
      this.cachedPolicy.cachedAt -= ms;
      this.cachedPolicy.lastSyncedAt -= ms;
      this.storage.set('policyCache', this.cachedPolicy);
    }
  }

  private isValidCache(cached: CachedPolicy): boolean {
    const age = Date.now() - cached.cachedAt;
    return age < this.config.maxCacheAgeMs;
  }

  private isStaleCache(cached: CachedPolicy): boolean {
    const age = Date.now() - cached.lastSyncedAt;
    return age > this.config.staleThresholdMs;
  }
}

// =============================================================================
// GENERATORS
// =============================================================================

const enforcementModeArb = fc.constantFrom<'strict' | 'gentle'>('strict', 'gentle');

const timeSlotArb = fc.record({
  dayOfWeek: fc.integer({ min: 0, max: 6 }),
  startHour: fc.integer({ min: 0, max: 23 }),
  startMinute: fc.integer({ min: 0, max: 59 }),
  endHour: fc.integer({ min: 0, max: 23 }),
  endMinute: fc.integer({ min: 0, max: 59 }),
}).filter(slot => {
  // Ensure end time is after start time
  const startMinutes = slot.startHour * 60 + slot.startMinute;
  const endMinutes = slot.endHour * 60 + slot.endMinute;
  return endMinutes > startMinutes;
});

const skipTokenConfigArb = fc.record({
  remaining: fc.integer({ min: 0, max: 10 }),
  maxPerDay: fc.integer({ min: 1, max: 10 }),
  delayMinutes: fc.integer({ min: 1, max: 60 }),
});

const distractionAppArb = fc.record({
  bundleId: fc.string({ minLength: 5, maxLength: 50 }).filter(s => /^[a-zA-Z0-9.]+$/.test(s)),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  action: fc.constantFrom<'force_quit' | 'hide_window'>('force_quit', 'hide_window'),
});

const policyArb = fc.record({
  version: fc.integer({ min: 1, max: 1000 }),
  enforcementMode: enforcementModeArb,
  workTimeSlots: fc.array(timeSlotArb, { minLength: 0, maxLength: 5 }),
  skipTokens: skipTokenConfigArb,
  distractionApps: fc.array(distractionAppArb, { minLength: 0, maxLength: 10 }),
  updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
});

// =============================================================================
// TEST SETUP
// =============================================================================

let cacheManager: MockPolicyCacheManager;

beforeEach(() => {
  cacheManager = new MockPolicyCacheManager();
  cacheManager.initialize();
});

afterEach(() => {
  cacheManager.clearCache();
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 12: Offline Mode Policy Caching', () => {
  /**
   * Feature: desktop-production-resilience, Property 12: Offline Mode Policy Caching
   * Validates: Requirements 9.1, 9.2
   *
   * For any period when the client is offline, the enforcement policy SHALL be
   * retrieved from local cache and enforcement SHALL continue.
   */

  it('should cache policy when updated from server', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy (simulating server sync)
        cacheManager.updatePolicy(policy);
        
        // Verify policy is cached
        expect(cacheManager.hasValidPolicy()).toBe(true);
        
        // Verify cached policy matches
        const cached = cacheManager.getPolicy();
        expect(cached.version).toBe(policy.version);
        expect(cached.enforcementMode).toBe(policy.enforcementMode);
        expect(cached.workTimeSlots).toEqual(policy.workTimeSlots);
        expect(cached.skipTokens).toEqual(policy.skipTokens);
        expect(cached.distractionApps).toEqual(policy.distractionApps);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return cached policy when offline (no new updates)', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy (simulating server sync)
        cacheManager.updatePolicy(policy);
        
        // Simulate going offline (no new updates)
        // The cached policy should still be available
        const cachedPolicy = cacheManager.getPolicy();
        
        // Verify we get the same policy back
        expect(cachedPolicy.version).toBe(policy.version);
        expect(cachedPolicy.enforcementMode).toBe(policy.enforcementMode);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return default policy when no cache exists', async () => {
    // Clear any existing cache
    cacheManager.clearCache();
    
    // Get policy without any cached data
    const policy = cacheManager.getPolicy();
    
    // Should return default policy
    expect(policy.version).toBe(0);
    expect(policy.enforcementMode).toBe('gentle');
    expect(policy.workTimeSlots).toEqual([]);
    expect(policy.skipTokens.remaining).toBe(3);
    expect(policy.distractionApps).toEqual([]);
  });

  it('should mark cache as stale after threshold', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy
        cacheManager.updatePolicy(policy);
        
        // Initially not stale
        expect(cacheManager.isStale()).toBe(false);
        
        // Simulate time passing beyond stale threshold (5 minutes + 1 second)
        cacheManager.simulateTimePassing(DEFAULT_STALE_THRESHOLD_MS + 1000);
        
        // Should now be stale
        expect(cacheManager.isStale()).toBe(true);
        
        // But policy should still be valid and retrievable
        expect(cacheManager.hasValidPolicy()).toBe(true);
        const cached = cacheManager.getPolicy();
        expect(cached.version).toBe(policy.version);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should invalidate cache after max age', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy
        cacheManager.updatePolicy(policy);
        
        // Initially valid
        expect(cacheManager.hasValidPolicy()).toBe(true);
        
        // Simulate time passing beyond max cache age (24 hours + 1 second)
        cacheManager.simulateTimePassing(DEFAULT_MAX_CACHE_AGE_MS + 1000);
        
        // Should no longer be valid
        expect(cacheManager.hasValidPolicy()).toBe(false);
        
        // Should return default policy
        const cached = cacheManager.getPolicy();
        expect(cached.version).toBe(0);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve enforcement mode in cache', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy
        cacheManager.updatePolicy(policy);
        
        // Get enforcement mode from cache
        const mode = cacheManager.getEnforcementMode();
        
        // Should match original policy
        expect(mode).toBe(policy.enforcementMode);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve work time slots in cache', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy
        cacheManager.updatePolicy(policy);
        
        // Get work time slots from cache
        const slots = cacheManager.getWorkTimeSlots();
        
        // Should match original policy
        expect(slots).toEqual(policy.workTimeSlots);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve skip token config in cache', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy
        cacheManager.updatePolicy(policy);
        
        // Get skip token config from cache
        const config = cacheManager.getSkipTokenConfig();
        
        // Should match original policy
        expect(config).toEqual(policy.skipTokens);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve distraction apps in cache', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        // Update policy
        cacheManager.updatePolicy(policy);
        
        // Get distraction apps from cache
        const apps = cacheManager.getDistractionApps();
        
        // Should match original policy
        expect(apps).toEqual(policy.distractionApps);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should correctly determine work hours from cached policy', async () => {
    // Create a policy with a work time slot for today
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Create a slot that includes current time
    const activeSlot: PolicyTimeSlot = {
      dayOfWeek: currentDay,
      startHour: Math.max(0, currentHour - 1),
      startMinute: 0,
      endHour: Math.min(23, currentHour + 1),
      endMinute: 59,
    };
    
    const policy: DesktopPolicy = {
      version: 1,
      enforcementMode: 'gentle',
      workTimeSlots: [activeSlot],
      skipTokens: { remaining: 3, maxPerDay: 3, delayMinutes: 15 },
      distractionApps: [],
      updatedAt: Date.now(),
    };
    
    // Update policy
    cacheManager.updatePolicy(policy);
    
    // Should be within work hours
    expect(cacheManager.isWithinWorkHours(now)).toBe(true);
    
    // Create a time outside work hours
    const outsideTime = new Date(now);
    outsideTime.setHours(activeSlot.endHour + 2);
    
    // Should not be within work hours
    expect(cacheManager.isWithinWorkHours(outsideTime)).toBe(false);
  });

  it('should update cache when new policy is received', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, policyArb, async (policy1, policy2) => {
        // Ensure policies have different versions
        const p1 = { ...policy1, version: 1 };
        const p2 = { ...policy2, version: 2 };
        
        // Update with first policy
        cacheManager.updatePolicy(p1);
        expect(cacheManager.getPolicy().version).toBe(1);
        
        // Update with second policy
        cacheManager.updatePolicy(p2);
        expect(cacheManager.getPolicy().version).toBe(2);
        
        // Verify all fields are updated
        const cached = cacheManager.getPolicy();
        expect(cached.enforcementMode).toBe(p2.enforcementMode);
        expect(cached.workTimeSlots).toEqual(p2.workTimeSlots);
        expect(cached.skipTokens).toEqual(p2.skipTokens);
        expect(cached.distractionApps).toEqual(p2.distractionApps);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should track cache metadata correctly', async () => {
    await fc.assert(
      fc.asyncProperty(policyArb, async (policy) => {
        const beforeUpdate = Date.now();
        
        // Update policy
        cacheManager.updatePolicy(policy);
        
        const afterUpdate = Date.now();
        
        // Get cached policy with metadata
        const cached = cacheManager.getCachedPolicy();
        
        expect(cached).not.toBeNull();
        if (cached) {
          // Cached at should be within the update window
          expect(cached.cachedAt).toBeGreaterThanOrEqual(beforeUpdate);
          expect(cached.cachedAt).toBeLessThanOrEqual(afterUpdate);
          
          // Last synced at should be the same as cached at for fresh cache
          expect(cached.lastSyncedAt).toBe(cached.cachedAt);
          
          // Should not be stale immediately after update
          expect(cached.isStale).toBe(false);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle empty work time slots gracefully', async () => {
    const policy: DesktopPolicy = {
      version: 1,
      enforcementMode: 'gentle',
      workTimeSlots: [],
      skipTokens: { remaining: 3, maxPerDay: 3, delayMinutes: 15 },
      distractionApps: [],
      updatedAt: Date.now(),
    };
    
    cacheManager.updatePolicy(policy);
    
    // Should not be within work hours when no slots defined
    expect(cacheManager.isWithinWorkHours()).toBe(false);
  });

  it('should handle empty distraction apps gracefully', async () => {
    const policy: DesktopPolicy = {
      version: 1,
      enforcementMode: 'strict',
      workTimeSlots: [],
      skipTokens: { remaining: 3, maxPerDay: 3, delayMinutes: 15 },
      distractionApps: [],
      updatedAt: Date.now(),
    };
    
    cacheManager.updatePolicy(policy);
    
    // Should return empty array
    expect(cacheManager.getDistractionApps()).toEqual([]);
  });
});
