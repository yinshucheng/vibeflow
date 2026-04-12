import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Feature: ios-mvp
 * Property 2: State Sync Round-Trip
 * Validates: Requirements 2.3, 7.1
 *
 * For any valid SYNC_STATE command received from the server, storing the state
 * in cache and then loading it SHALL produce an equivalent state object.
 */

// =============================================================================
// TYPE DEFINITIONS (matching vibeflow-ios/src/types/index.ts)
// =============================================================================

interface DailyStateData {
  state: 'IDLE' | 'FOCUS' | 'OVER_REST';
  completedPomodoros: number;
  dailyCap: number;
  totalFocusMinutes: number;
}

interface ActivePomodoroData {
  id: string;
  taskId: string;
  taskTitle: string;
  startTime: number;
  duration: number;
  status: 'active' | 'paused';
}

interface TaskData {
  id: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  status: 'pending' | 'in_progress' | 'completed';
  isTop3: boolean;
  isCurrentTask: boolean;
  planDate?: string;
}

interface BlockedApp {
  bundleId: string;
  name: string;
}

interface PolicyData {
  version: number;
  distractionApps: BlockedApp[];
  updatedAt: number;
}

interface CachedState {
  dailyState: DailyStateData;
  activePomodoro: ActivePomodoroData | null;
  todayTasks: TaskData[];
  policy: PolicyData;
  cachedAt: number;
}

// =============================================================================
// MOCK ASYNC STORAGE
// =============================================================================

class MockAsyncStorage {
  private storage: Map<string, string> = new Map();

  async setItem(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async removeItem(key: string): Promise<void> {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

// =============================================================================
// CACHE SERVICE IMPLEMENTATION (matching vibeflow-ios/src/services/cache.service.ts)
// =============================================================================

const CACHE_KEY = '@vibeflow/cached_state';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function isExpired(cachedAt: number, now: number = Date.now()): boolean {
  return now - cachedAt > CACHE_EXPIRY_MS;
}

function createCachedState(
  dailyState: DailyStateData,
  activePomodoro: ActivePomodoroData | null,
  todayTasks: TaskData[],
  policy: PolicyData
): CachedState {
  return {
    dailyState,
    activePomodoro,
    todayTasks,
    policy,
    cachedAt: Date.now(),
  };
}

function isValidCachedState(obj: unknown): obj is CachedState {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const state = obj as Record<string, unknown>;

  if (!state.dailyState || typeof state.dailyState !== 'object') {
    return false;
  }

  if (!Array.isArray(state.todayTasks)) {
    return false;
  }

  if (!state.policy || typeof state.policy !== 'object') {
    return false;
  }

  if (typeof state.cachedAt !== 'number') {
    return false;
  }

  if (state.activePomodoro !== null && typeof state.activePomodoro !== 'object') {
    return false;
  }

  return true;
}

class MockCacheService {
  constructor(private storage: MockAsyncStorage) {}

  async saveState(state: CachedState): Promise<void> {
    const jsonValue = JSON.stringify(state);
    await this.storage.setItem(CACHE_KEY, jsonValue);
  }

  async loadState(): Promise<CachedState | null> {
    const jsonValue = await this.storage.getItem(CACHE_KEY);

    if (jsonValue === null) {
      return null;
    }

    const parsed = JSON.parse(jsonValue);

    if (!isValidCachedState(parsed)) {
      await this.clearCache();
      return null;
    }

    if (isExpired(parsed.cachedAt)) {
      await this.clearCache();
      return null;
    }

    return parsed;
  }

  isExpired = isExpired;

  async clearCache(): Promise<void> {
    await this.storage.removeItem(CACHE_KEY);
  }

  createCachedState = createCachedState;
}

// =============================================================================
// GENERATORS
// =============================================================================

const dailyStateArb = fc.constantFrom<'IDLE' | 'FOCUS' | 'OVER_REST'>(
  'IDLE',
  'FOCUS',
  'OVER_REST'
);

const dailyStateDataArb = fc.record({
  state: dailyStateArb,
  completedPomodoros: fc.integer({ min: 0, max: 20 }),
  dailyCap: fc.integer({ min: 1, max: 20 }),
  totalFocusMinutes: fc.integer({ min: 0, max: 1440 }),
});

const pomodoroStatusArb = fc.constantFrom<'active' | 'paused'>('active', 'paused');

const activePomodoroDataArb = fc.record({
  id: fc.uuid(),
  taskId: fc.uuid(),
  taskTitle: fc.string({ minLength: 1, maxLength: 100 }),
  startTime: fc.integer({ min: 1700000000000, max: 1800000000000 }),
  duration: fc.integer({ min: 10, max: 120 }),
  status: pomodoroStatusArb,
});

const priorityArb = fc.constantFrom<'P1' | 'P2' | 'P3'>('P1', 'P2', 'P3');

const taskStatusArb = fc.constantFrom<'pending' | 'in_progress' | 'completed'>(
  'pending',
  'in_progress',
  'completed'
);

const taskDataArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  priority: priorityArb,
  status: taskStatusArb,
  isTop3: fc.boolean(),
  isCurrentTask: fc.boolean(),
  planDate: fc.option(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }).map(
      (d) => d.toISOString().split('T')[0]
    ),
    { nil: undefined }
  ),
});

const blockedAppArb = fc.record({
  bundleId: fc
    .string({ minLength: 5, maxLength: 50 })
    .filter((s) => /^[a-zA-Z0-9.]+$/.test(s)),
  name: fc.string({ minLength: 1, maxLength: 30 }),
});

const policyDataArb = fc.record({
  version: fc.integer({ min: 1, max: 1000 }),
  distractionApps: fc.array(blockedAppArb, { minLength: 0, maxLength: 10 }),
  updatedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
});

const cachedStateArb = fc.record({
  dailyState: dailyStateDataArb,
  activePomodoro: fc.option(activePomodoroDataArb, { nil: null }),
  todayTasks: fc.array(taskDataArb, { minLength: 0, maxLength: 20 }),
  policy: policyDataArb,
  cachedAt: fc.integer({ min: Date.now() - 1000, max: Date.now() + 1000 }),
});

// =============================================================================
// TEST SETUP
// =============================================================================

let mockStorage: MockAsyncStorage;
let cacheService: MockCacheService;

beforeEach(() => {
  mockStorage = new MockAsyncStorage();
  cacheService = new MockCacheService(mockStorage);
});

afterEach(() => {
  mockStorage.clear();
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 2: State Sync Round-Trip', () => {
  /**
   * Feature: ios-mvp, Property 2: State Sync Round-Trip
   * Validates: Requirements 2.3, 7.1
   *
   * For any valid SYNC_STATE command received from the server, storing the state
   * in cache and then loading it SHALL produce an equivalent state object.
   */

  it('should produce equivalent state after save and load round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(cachedStateArb, async (originalState) => {
        // Save state to cache
        await cacheService.saveState(originalState);

        // Load state from cache
        const loadedState = await cacheService.loadState();

        // Verify loaded state is not null
        expect(loadedState).not.toBeNull();

        if (loadedState) {
          // Verify dailyState round-trip
          expect(loadedState.dailyState.state).toBe(originalState.dailyState.state);
          expect(loadedState.dailyState.completedPomodoros).toBe(
            originalState.dailyState.completedPomodoros
          );
          expect(loadedState.dailyState.dailyCap).toBe(originalState.dailyState.dailyCap);
          expect(loadedState.dailyState.totalFocusMinutes).toBe(
            originalState.dailyState.totalFocusMinutes
          );

          // Verify activePomodoro round-trip
          if (originalState.activePomodoro === null) {
            expect(loadedState.activePomodoro).toBeNull();
          } else {
            expect(loadedState.activePomodoro).not.toBeNull();
            expect(loadedState.activePomodoro?.id).toBe(originalState.activePomodoro.id);
            expect(loadedState.activePomodoro?.taskId).toBe(originalState.activePomodoro.taskId);
            expect(loadedState.activePomodoro?.taskTitle).toBe(
              originalState.activePomodoro.taskTitle
            );
            expect(loadedState.activePomodoro?.startTime).toBe(
              originalState.activePomodoro.startTime
            );
            expect(loadedState.activePomodoro?.duration).toBe(
              originalState.activePomodoro.duration
            );
            expect(loadedState.activePomodoro?.status).toBe(originalState.activePomodoro.status);
          }

          // Verify todayTasks round-trip
          expect(loadedState.todayTasks.length).toBe(originalState.todayTasks.length);
          for (let i = 0; i < originalState.todayTasks.length; i++) {
            expect(loadedState.todayTasks[i].id).toBe(originalState.todayTasks[i].id);
            expect(loadedState.todayTasks[i].title).toBe(originalState.todayTasks[i].title);
            expect(loadedState.todayTasks[i].priority).toBe(originalState.todayTasks[i].priority);
            expect(loadedState.todayTasks[i].status).toBe(originalState.todayTasks[i].status);
            expect(loadedState.todayTasks[i].isTop3).toBe(originalState.todayTasks[i].isTop3);
            expect(loadedState.todayTasks[i].isCurrentTask).toBe(
              originalState.todayTasks[i].isCurrentTask
            );
            expect(loadedState.todayTasks[i].planDate).toBe(originalState.todayTasks[i].planDate);
          }

          // Verify policy round-trip
          expect(loadedState.policy.version).toBe(originalState.policy.version);
          expect(loadedState.policy.updatedAt).toBe(originalState.policy.updatedAt);
          expect(loadedState.policy.distractionApps.length).toBe(
            originalState.policy.distractionApps.length
          );
          for (let i = 0; i < originalState.policy.distractionApps.length; i++) {
            expect(loadedState.policy.distractionApps[i].bundleId).toBe(
              originalState.policy.distractionApps[i].bundleId
            );
            expect(loadedState.policy.distractionApps[i].name).toBe(
              originalState.policy.distractionApps[i].name
            );
          }

          // Verify cachedAt round-trip
          expect(loadedState.cachedAt).toBe(originalState.cachedAt);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve deep equality after round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(cachedStateArb, async (originalState) => {
        // Save state to cache
        await cacheService.saveState(originalState);

        // Load state from cache
        const loadedState = await cacheService.loadState();

        // Verify deep equality
        expect(loadedState).toEqual(originalState);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle state with null activePomodoro', async () => {
    await fc.assert(
      fc.asyncProperty(
        dailyStateDataArb,
        fc.array(taskDataArb, { minLength: 0, maxLength: 10 }),
        policyDataArb,
        async (dailyState, todayTasks, policy) => {
          const originalState: CachedState = {
            dailyState,
            activePomodoro: null,
            todayTasks,
            policy,
            cachedAt: Date.now(),
          };

          await cacheService.saveState(originalState);
          const loadedState = await cacheService.loadState();

          expect(loadedState).not.toBeNull();
          expect(loadedState?.activePomodoro).toBeNull();
          expect(loadedState?.dailyState).toEqual(dailyState);
          expect(loadedState?.todayTasks).toEqual(todayTasks);
          expect(loadedState?.policy).toEqual(policy);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle state with active pomodoro', async () => {
    await fc.assert(
      fc.asyncProperty(
        dailyStateDataArb,
        activePomodoroDataArb,
        fc.array(taskDataArb, { minLength: 0, maxLength: 10 }),
        policyDataArb,
        async (dailyState, activePomodoro, todayTasks, policy) => {
          const originalState: CachedState = {
            dailyState,
            activePomodoro,
            todayTasks,
            policy,
            cachedAt: Date.now(),
          };

          await cacheService.saveState(originalState);
          const loadedState = await cacheService.loadState();

          expect(loadedState).not.toBeNull();
          expect(loadedState?.activePomodoro).not.toBeNull();
          expect(loadedState?.activePomodoro).toEqual(activePomodoro);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty task list', async () => {
    await fc.assert(
      fc.asyncProperty(
        dailyStateDataArb,
        fc.option(activePomodoroDataArb, { nil: null }),
        policyDataArb,
        async (dailyState, activePomodoro, policy) => {
          const originalState: CachedState = {
            dailyState,
            activePomodoro,
            todayTasks: [],
            policy,
            cachedAt: Date.now(),
          };

          await cacheService.saveState(originalState);
          const loadedState = await cacheService.loadState();

          expect(loadedState).not.toBeNull();
          expect(loadedState?.todayTasks).toEqual([]);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty distraction apps list', async () => {
    await fc.assert(
      fc.asyncProperty(
        dailyStateDataArb,
        fc.option(activePomodoroDataArb, { nil: null }),
        fc.array(taskDataArb, { minLength: 0, maxLength: 10 }),
        async (dailyState, activePomodoro, todayTasks) => {
          const policy: PolicyData = {
            version: 1,
            distractionApps: [],
            updatedAt: Date.now(),
          };

          const originalState: CachedState = {
            dailyState,
            activePomodoro,
            todayTasks,
            policy,
            cachedAt: Date.now(),
          };

          await cacheService.saveState(originalState);
          const loadedState = await cacheService.loadState();

          expect(loadedState).not.toBeNull();
          expect(loadedState?.policy.distractionApps).toEqual([]);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null for expired cache', async () => {
    await fc.assert(
      fc.asyncProperty(cachedStateArb, async (originalState) => {
        // Create state with expired cachedAt (more than 24 hours ago)
        const expiredState: CachedState = {
          ...originalState,
          cachedAt: Date.now() - CACHE_EXPIRY_MS - 1000,
        };

        await cacheService.saveState(expiredState);
        const loadedState = await cacheService.loadState();

        // Should return null for expired cache
        expect(loadedState).toBeNull();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return null when no cache exists', async () => {
    const loadedState = await cacheService.loadState();
    expect(loadedState).toBeNull();
  });

  it('should overwrite previous cache on save', async () => {
    await fc.assert(
      fc.asyncProperty(cachedStateArb, cachedStateArb, async (state1, state2) => {
        // Save first state
        await cacheService.saveState(state1);

        // Save second state (should overwrite)
        await cacheService.saveState(state2);

        // Load should return second state
        const loadedState = await cacheService.loadState();

        expect(loadedState).toEqual(state2);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
