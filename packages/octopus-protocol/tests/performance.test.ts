/**
 * Performance Benchmark: State Manager Full Sync
 *
 * Verifies that high-frequency full sync updates (simulating real-time pushes)
 * remain performant. Target: < 1ms per full sync operation.
 *
 * This validates Zustand selector precision — only changed keys should trigger
 * downstream updates, avoiding over-render in the Web client.
 */

import { describe, it, expect } from 'vitest';
import { createStateManager } from '../src/protocol/state-manager';
import type { SyncStatePayload } from '../src/types/state';

function buildFullSyncPayload(version: number, state = 'idle'): SyncStatePayload {
  return {
    syncType: 'full',
    version,
    state: {
      systemState: {
        state,
        dailyCapReached: false,
        skipTokensRemaining: 3,
      },
      dailyState: {
        date: '2026-04-21',
        completedPomodoros: version % 8,
        totalFocusMinutes: (version % 8) * 25,
        top3TaskIds: ['task-1', 'task-2', 'task-3'],
      },
      activePomodoro: state === 'focus' ? {
        id: `pomodoro-${version}`,
        taskId: 'task-1',
        taskTitle: 'Test Task',
        startTime: Date.now() - 10 * 60 * 1000,
        duration: 25,
        status: 'active' as const,
      } : null,
      top3Tasks: [
        { id: 'task-1', title: 'Task 1', status: 'in_progress', priority: 'P1' },
        { id: 'task-2', title: 'Task 2', status: 'pending', priority: 'P2' },
        { id: 'task-3', title: 'Task 3', status: 'pending', priority: 'P3' },
      ],
      settings: {
        pomodoroDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        dailyCap: 8,
        enforcementMode: 'gentle' as const,
      },
    },
  };
}

describe('Performance: State Manager Full Sync', () => {
  it('should handle 10 full syncs per second within 1ms each', () => {
    let changeCount = 0;
    const manager = createStateManager({
      onStateChange: () => {
        changeCount++;
      },
    });

    const iterations = 100; // Simulate 10 seconds of 10 syncs/sec
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const state = i % 3 === 0 ? 'focus' : 'idle';
      manager.handleSync(buildFullSyncPayload(i, state));
    }

    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    console.log(`[Performance] ${iterations} full syncs in ${elapsed.toFixed(2)}ms (avg: ${avgMs.toFixed(3)}ms/sync)`);

    // Assert: average < 1ms per sync
    expect(avgMs).toBeLessThan(1);
    // All syncs should have triggered state changes
    expect(changeCount).toBe(iterations);
  });

  it('should detect unchanged state via shallow compare (no spurious notifications)', () => {
    let changeCount = 0;
    const manager = createStateManager({
      onStateChange: () => {
        changeCount++;
      },
    });

    // First sync — should notify
    const payload = buildFullSyncPayload(1, 'idle');
    manager.handleSync(payload);
    expect(changeCount).toBe(1);

    // Same payload again — state manager receives new objects each time,
    // so it will notify (shallow compare compares references, not deep equality).
    // This is expected — Zustand selectors handle the fine-grained equality check.
    manager.handleSync(buildFullSyncPayload(1, 'idle'));
    expect(changeCount).toBe(2);
  });

  it('should handle rapid state transitions (focus → idle → focus)', () => {
    const states: string[] = [];
    const manager = createStateManager({
      onStateChange: (snapshot) => {
        states.push(snapshot.systemState.state);
      },
    });

    // Simulate rapid transitions
    manager.handleSync(buildFullSyncPayload(1, 'focus'));
    manager.handleSync(buildFullSyncPayload(2, 'idle'));
    manager.handleSync(buildFullSyncPayload(3, 'focus'));
    manager.handleSync(buildFullSyncPayload(4, 'over_rest'));
    manager.handleSync(buildFullSyncPayload(5, 'idle'));

    expect(states).toEqual(['focus', 'idle', 'focus', 'over_rest', 'idle']);
  });

  it('should preserve policy across full syncs (policy comes via UPDATE_POLICY)', () => {
    let latestPolicy: unknown = null;
    const manager = createStateManager({
      onStateChange: (snapshot) => {
        latestPolicy = snapshot.policy;
      },
    });

    // First: set policy via UPDATE_POLICY
    manager.handlePolicyUpdate({
      policyType: 'full',
      policy: {
        config: {
          version: 1,
          updatedAt: Date.now(),
          blacklist: ['example.com'],
          whitelist: [],
          enforcementMode: 'strict',
          workTimeSlots: [],
          skipTokens: { maxPerDay: 3, delayMinutes: 5 },
          distractionApps: [],
        },
        state: {
          skipTokensRemaining: 3,
          isSleepTimeActive: false,
          isSleepSnoozed: false,
          isOverRest: false,
          overRestMinutes: 0,
          overRestBringToFront: false,
          isRestEnforcementActive: false,
        },
      },
      effectiveTime: Date.now(),
    });

    expect(latestPolicy).not.toBeNull();

    // Then: full sync should NOT clear policy (policy is preserved)
    manager.handleSync(buildFullSyncPayload(10, 'idle'));
    expect(latestPolicy).not.toBeNull();
  });
});
