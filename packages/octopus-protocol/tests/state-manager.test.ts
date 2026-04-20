import { describe, it, expect, vi } from 'vitest';
import { createStateManager } from '../src/protocol/state-manager';
import type { SyncStatePayload, UpdatePolicyPayload, FullState, Policy } from '../src/types';
import type { StateSnapshot } from '../src/protocol/state-manager';

const mockFullState: FullState = {
  systemState: { state: 'focus', dailyCapReached: false, skipTokensRemaining: 2 },
  dailyState: { date: '2026-04-20', completedPomodoros: 3, totalFocusMinutes: 75, top3TaskIds: ['t1'] },
  activePomodoro: { id: 'p1', taskId: 't1', taskTitle: 'Test Task', startTime: Date.now(), duration: 25 * 60, status: 'active' },
  top3Tasks: [{ id: 't1', title: 'Test Task', status: 'todo', priority: 'P1' }],
  settings: { pomodoroDuration: 25, shortBreakDuration: 5, longBreakDuration: 15, dailyCap: 8, enforcementMode: 'strict' },
};

const mockPolicy: Policy = {
  config: {
    version: 1, updatedAt: Date.now(), blacklist: [], whitelist: [],
    enforcementMode: 'strict', workTimeSlots: [],
    skipTokens: { maxPerDay: 3, delayMinutes: 5 }, distractionApps: [],
  },
  state: {
    skipTokensRemaining: 3, isSleepTimeActive: false, isSleepSnoozed: false,
    isOverRest: false, overRestMinutes: 0, overRestBringToFront: false,
    isRestEnforcementActive: false,
  },
};

describe('createStateManager', () => {
  it('initializes with default empty state', () => {
    const sm = createStateManager({ onStateChange: vi.fn() });
    const state = sm.getState();
    expect(state.systemState.state).toBe('idle');
    expect(state.activePomodoro).toBeNull();
    expect(state.dailyState).toBeNull();
    expect(state.policy).toBeNull();
  });

  describe('handleSync (full sync)', () => {
    it('overwrites local state with full sync payload', () => {
      const onStateChange = vi.fn();
      const sm = createStateManager({ onStateChange });

      const payload: SyncStatePayload = { syncType: 'full', version: 1, state: mockFullState };
      sm.handleSync(payload);

      const state = sm.getState();
      expect(state.systemState.state).toBe('focus');
      expect(state.activePomodoro?.id).toBe('p1');
      expect(state.dailyState?.completedPomodoros).toBe(3);
      expect(state.top3Tasks).toHaveLength(1);
      expect(state.settings?.pomodoroDuration).toBe(25);
    });

    it('calls onStateChange with changed keys', () => {
      const onStateChange = vi.fn();
      const sm = createStateManager({ onStateChange });

      sm.handleSync({ syncType: 'full', version: 1, state: mockFullState });

      expect(onStateChange).toHaveBeenCalledTimes(1);
      const [, changedKeys] = onStateChange.mock.calls[0];
      expect(changedKeys).toContain('systemState');
      expect(changedKeys).toContain('activePomodoro');
      expect(changedKeys).toContain('dailyState');
    });

    it('does not call onStateChange when payload has no state', () => {
      const onStateChange = vi.fn();
      const sm = createStateManager({ onStateChange });

      sm.handleSync({ syncType: 'full', version: 2 });
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('preserves policy through full sync (policy comes via UPDATE_POLICY)', () => {
      const onStateChange = vi.fn();
      const sm = createStateManager({ onStateChange });

      // Set policy first
      sm.handlePolicyUpdate({ policyType: 'full', policy: mockPolicy, effectiveTime: Date.now() });

      // Full sync should NOT overwrite policy
      sm.handleSync({ syncType: 'full', version: 1, state: mockFullState });

      expect(sm.getState().policy).toBe(mockPolicy);
    });

    it('sets fullSyncReceived flag', () => {
      const sm = createStateManager({ onStateChange: vi.fn() });
      expect(sm.isFullSyncReceived()).toBe(false);

      sm.handleSync({ syncType: 'full', version: 1, state: mockFullState });
      expect(sm.isFullSyncReceived()).toBe(true);
    });

    it('calls saveToStorage when configured', () => {
      const saveToStorage = vi.fn().mockResolvedValue(undefined);
      const sm = createStateManager({ onStateChange: vi.fn(), saveToStorage });

      sm.handleSync({ syncType: 'full', version: 1, state: mockFullState });
      expect(saveToStorage).toHaveBeenCalledTimes(1);
    });

    it('skips notification when nothing changed (same reference)', () => {
      const onStateChange = vi.fn();
      const sm = createStateManager({ onStateChange });

      // First sync
      sm.handleSync({ syncType: 'full', version: 1, state: mockFullState });
      expect(onStateChange).toHaveBeenCalledTimes(1);

      // Same reference again — shallow compare detects no change
      sm.handleSync({ syncType: 'full', version: 2, state: mockFullState });
      // onStateChange NOT called because all references are identical
      expect(onStateChange).toHaveBeenCalledTimes(1);
    });

    it('reports changes when nested objects are new references', () => {
      const onStateChange = vi.fn();
      const sm = createStateManager({ onStateChange });

      sm.handleSync({ syncType: 'full', version: 1, state: mockFullState });
      expect(onStateChange).toHaveBeenCalledTimes(1);

      // New nested references trigger change (simulates real server behavior)
      const updatedState: FullState = {
        ...mockFullState,
        systemState: { ...mockFullState.systemState },
        dailyState: { ...mockFullState.dailyState },
      };
      sm.handleSync({ syncType: 'full', version: 2, state: updatedState });
      expect(onStateChange).toHaveBeenCalledTimes(2);
      const changedKeys = onStateChange.mock.calls[1][1];
      expect(changedKeys).toContain('systemState');
      expect(changedKeys).toContain('dailyState');
    });
  });

  describe('handlePolicyUpdate', () => {
    it('updates policy and notifies', () => {
      const onStateChange = vi.fn();
      const sm = createStateManager({ onStateChange });

      const payload: UpdatePolicyPayload = { policyType: 'full', policy: mockPolicy, effectiveTime: Date.now() };
      sm.handlePolicyUpdate(payload);

      expect(sm.getState().policy).toBe(mockPolicy);
      expect(onStateChange).toHaveBeenCalledWith(expect.anything(), ['policy']);
    });
  });

  describe('initialize', () => {
    it('restores state from storage', async () => {
      const stored: StateSnapshot = {
        systemState: { state: 'focus', dailyCapReached: false, skipTokensRemaining: 1 },
        activePomodoro: { id: 'p2', taskId: 't2', startTime: Date.now(), duration: 1500, status: 'active' },
        dailyState: null,
        top3Tasks: [],
        settings: null,
        policy: null,
      };

      const sm = createStateManager({
        onStateChange: vi.fn(),
        loadFromStorage: async () => stored,
      });

      await sm.initialize();
      expect(sm.getState().systemState.state).toBe('focus');
      expect(sm.getState().activePomodoro?.id).toBe('p2');
    });

    it('keeps default state when storage returns null', async () => {
      const sm = createStateManager({
        onStateChange: vi.fn(),
        loadFromStorage: async () => null,
      });

      await sm.initialize();
      expect(sm.getState().systemState.state).toBe('idle');
    });

    it('keeps default state when no loadFromStorage configured', async () => {
      const sm = createStateManager({ onStateChange: vi.fn() });
      await sm.initialize();
      expect(sm.getState().systemState.state).toBe('idle');
    });
  });

  describe('reconnection flow', () => {
    it('resets fullSyncReceived on reconnecting', () => {
      const sm = createStateManager({ onStateChange: vi.fn() });

      sm.handleSync({ syncType: 'full', version: 1, state: mockFullState });
      expect(sm.isFullSyncReceived()).toBe(true);

      sm.onReconnecting();
      expect(sm.isFullSyncReceived()).toBe(false);

      sm.handleSync({ syncType: 'full', version: 2, state: mockFullState });
      expect(sm.isFullSyncReceived()).toBe(true);
    });
  });
});
