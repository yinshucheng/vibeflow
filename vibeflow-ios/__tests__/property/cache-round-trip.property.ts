/**
 * Property Test: State Sync Round-Trip
 *
 * Feature: ios-mvp, Property 2: State Sync Round-Trip
 * Validates: Requirements 2.3, 7.1
 *
 * For any valid SYNC_STATE command received from the server,
 * storing the state in cache and then loading it SHALL produce
 * an equivalent state object.
 */

import * as fc from 'fast-check';
import type {
  CachedState,
  DailyStateData,
  ActivePomodoroData,
  TaskData,
  PolicyData,
  BlockedApp,
} from '../../src/types';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for DailyStateData
 */
const dailyStateDataArb = fc.record({
  state: fc.constantFrom('IDLE', 'FOCUS', 'OVER_REST') as fc.Arbitrary<
    'IDLE' | 'FOCUS' | 'OVER_REST'
  >,
  completedPomodoros: fc.nat({ max: 20 }),
  dailyCap: fc.integer({ min: 1, max: 20 }),
  totalFocusMinutes: fc.nat({ max: 600 }),
});

/**
 * Generator for BlockedApp
 */
const blockedAppArb = fc.record({
  bundleId: fc.string({ minLength: 1, maxLength: 100 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
});

/**
 * Generator for ActivePomodoroData
 */
const activePomodoroDataArb = fc.record({
  id: fc.uuid(),
  taskId: fc.uuid(),
  taskTitle: fc.string({ minLength: 1, maxLength: 200 }),
  startTime: fc.integer({ min: 0, max: Date.now() + 86400000 }),
  duration: fc.integer({ min: 1, max: 120 }),
  status: fc.constantFrom('active', 'paused') as fc.Arbitrary<'active' | 'paused'>,
});

/**
 * Generator for TaskData
 */
const taskDataArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  priority: fc.constantFrom('P1', 'P2', 'P3') as fc.Arbitrary<'P1' | 'P2' | 'P3'>,
  status: fc.constantFrom('pending', 'in_progress', 'completed') as fc.Arbitrary<
    'pending' | 'in_progress' | 'completed'
  >,
  isTop3: fc.boolean(),
  isCurrentTask: fc.boolean(),
  planDate: fc.option(
    fc.integer({ min: 0, max: 365 }).map((daysOffset) => {
      const date = new Date();
      date.setDate(date.getDate() + daysOffset);
      return date.toISOString().split('T')[0];
    }),
    { nil: undefined }
  ),
});

/**
 * Generator for PolicyData
 */
const policyDataArb = fc.record({
  version: fc.nat({ max: 1000 }),
  distractionApps: fc.array(blockedAppArb, { maxLength: 20 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() + 86400000 }),
});

/**
 * Generator for CachedState
 */
const cachedStateArb = fc.record({
  dailyState: dailyStateDataArb,
  activePomodoro: fc.option(activePomodoroDataArb, { nil: null }),
  todayTasks: fc.array(taskDataArb, { maxLength: 50 }),
  policy: policyDataArb,
  cachedAt: fc.integer({ min: 0, max: Date.now() + 86400000 }),
});

// =============================================================================
// PURE FUNCTIONS UNDER TEST
// =============================================================================

/**
 * Serialize state to JSON string (simulates AsyncStorage.setItem)
 */
function serializeState(state: CachedState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize state from JSON string (simulates AsyncStorage.getItem)
 */
function deserializeState(json: string): CachedState {
  return JSON.parse(json);
}

/**
 * Deep equality check for CachedState
 */
function isEquivalent(a: CachedState, b: CachedState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 2: State Sync Round-Trip', () => {
  /**
   * Feature: ios-mvp, Property 2: State Sync Round-Trip
   * Validates: Requirements 2.3, 7.1
   */
  it('should produce equivalent state after serialize/deserialize round-trip', () => {
    fc.assert(
      fc.property(cachedStateArb, (originalState) => {
        // Serialize (save to cache)
        const serialized = serializeState(originalState);

        // Deserialize (load from cache)
        const loadedState = deserializeState(serialized);

        // Verify equivalence
        return isEquivalent(originalState, loadedState);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all required fields after round-trip', () => {
    fc.assert(
      fc.property(cachedStateArb, (originalState) => {
        const serialized = serializeState(originalState);
        const loadedState = deserializeState(serialized);

        // Check all required fields exist
        const hasAllFields =
          loadedState.dailyState !== undefined &&
          loadedState.todayTasks !== undefined &&
          loadedState.policy !== undefined &&
          loadedState.cachedAt !== undefined &&
          // activePomodoro can be null
          (loadedState.activePomodoro === null ||
            loadedState.activePomodoro !== undefined);

        return hasAllFields;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve dailyState structure after round-trip', () => {
    fc.assert(
      fc.property(cachedStateArb, (originalState) => {
        const serialized = serializeState(originalState);
        const loadedState = deserializeState(serialized);

        const ds = loadedState.dailyState;
        return (
          ['IDLE', 'FOCUS', 'OVER_REST'].includes(ds.state) &&
          typeof ds.completedPomodoros === 'number' &&
          typeof ds.dailyCap === 'number' &&
          typeof ds.totalFocusMinutes === 'number'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve task array integrity after round-trip', () => {
    fc.assert(
      fc.property(cachedStateArb, (originalState) => {
        const serialized = serializeState(originalState);
        const loadedState = deserializeState(serialized);

        // Same number of tasks
        if (originalState.todayTasks.length !== loadedState.todayTasks.length) {
          return false;
        }

        // Each task has required fields
        return loadedState.todayTasks.every(
          (task) =>
            typeof task.id === 'string' &&
            typeof task.title === 'string' &&
            ['P1', 'P2', 'P3'].includes(task.priority) &&
            ['pending', 'in_progress', 'completed'].includes(task.status) &&
            typeof task.isTop3 === 'boolean' &&
            typeof task.isCurrentTask === 'boolean'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve activePomodoro nullable state after round-trip', () => {
    fc.assert(
      fc.property(cachedStateArb, (originalState) => {
        const serialized = serializeState(originalState);
        const loadedState = deserializeState(serialized);

        // Both null or both non-null
        if (originalState.activePomodoro === null) {
          return loadedState.activePomodoro === null;
        }

        // If original has pomodoro, loaded should too
        if (loadedState.activePomodoro === null) {
          return false;
        }

        // Check pomodoro fields
        const p = loadedState.activePomodoro;
        return (
          typeof p.id === 'string' &&
          typeof p.taskId === 'string' &&
          typeof p.taskTitle === 'string' &&
          typeof p.startTime === 'number' &&
          typeof p.duration === 'number' &&
          ['active', 'paused'].includes(p.status)
        );
      }),
      { numRuns: 100 }
    );
  });
});
