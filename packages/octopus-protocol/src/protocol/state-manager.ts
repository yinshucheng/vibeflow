/**
 * State Manager — Unified state merge logic for all clients.
 *
 * Handles SYNC_STATE (full sync) and UPDATE_POLICY. All clients share the
 * same merge logic so state handling bugs are fixed once.
 *
 * Delta sync is deferred — current implementation is full-sync-only.
 */

import type {
  SystemState,
  DailyState,
  PomodoroState,
  TaskState,
  UserSettingsState,
  Policy,
  SyncStatePayload,
  UpdatePolicyPayload,
} from '../types';

export interface StateSnapshot {
  systemState: SystemState;
  activePomodoro: PomodoroState | null;
  dailyState: DailyState | null;
  top3Tasks: TaskState[];
  settings: UserSettingsState | null;
  policy: Policy | null;
}

export interface StateManagerConfig {
  /** Called after state changes — drive UI updates from here */
  onStateChange: (state: StateSnapshot, changedKeys: (keyof StateSnapshot)[]) => void;
  /** Restore state from persistent storage (Service Worker restart, app cold start) */
  loadFromStorage?: () => Promise<StateSnapshot | null>;
  /** Persist state (Service Worker sleep, app backgrounding) */
  saveToStorage?: (state: StateSnapshot) => Promise<void>;
}

const INITIAL_STATE: StateSnapshot = {
  systemState: { state: 'idle', dailyCapReached: false, skipTokensRemaining: 0 },
  activePomodoro: null,
  dailyState: null,
  top3Tasks: [],
  settings: null,
  policy: null,
};

/**
 * Create a state manager. Processes SYNC_STATE (full sync) and UPDATE_POLICY.
 *
 * All clients share the same merge logic — no more "iOS missed a field" bugs.
 */
export function createStateManager(config: StateManagerConfig) {
  let state: StateSnapshot = { ...INITIAL_STATE };

  /** Full sync received flag — controls offline queue flush timing */
  let fullSyncReceived = false;

  return {
    /** Restore state from persistent storage (call on cold start) */
    async initialize(): Promise<void> {
      if (config.loadFromStorage) {
        const stored = await config.loadFromStorage();
        if (stored) {
          state = stored;
        }
      }
    },

    /** Handle SYNC_STATE command — full sync overwrites local state */
    handleSync(payload: SyncStatePayload): void {
      console.log('[StateManager] handleSync called, payload.state:', !!payload.state);
      if (!payload.state) return;

      const changedKeys: (keyof StateSnapshot)[] = [];
      const fullState = payload.state;
      const newState: StateSnapshot = {
        systemState: fullState.systemState,
        activePomodoro: fullState.activePomodoro ?? null,
        dailyState: fullState.dailyState ?? null,
        top3Tasks: fullState.top3Tasks ?? state.top3Tasks,
        settings: fullState.settings ?? state.settings,
        policy: state.policy, // policy comes via UPDATE_POLICY, not SYNC_STATE
      };

      // Shallow compare: only mark keys that actually changed
      if (newState.systemState !== state.systemState) changedKeys.push('systemState');
      if (newState.activePomodoro !== state.activePomodoro) changedKeys.push('activePomodoro');
      if (newState.dailyState !== state.dailyState) changedKeys.push('dailyState');
      if (newState.top3Tasks !== state.top3Tasks) changedKeys.push('top3Tasks');
      if (newState.settings !== state.settings) changedKeys.push('settings');

      console.log('[StateManager] handleSync changedKeys:', changedKeys, 'old activePomodoro:', state.activePomodoro?.id, 'new:', newState.activePomodoro?.id);

      state = newState;
      fullSyncReceived = true;

      if (changedKeys.length > 0) {
        config.onStateChange(state, changedKeys);
      } else {
        console.log('[StateManager] handleSync: no changes detected, skipping onStateChange');
      }
      config.saveToStorage?.(state);
    },

    /** Handle UPDATE_POLICY command */
    handlePolicyUpdate(payload: UpdatePolicyPayload): void {
      state = { ...state, policy: payload.policy };
      config.onStateChange(state, ['policy']);
      config.saveToStorage?.(state);
    },

    /** Get current state snapshot */
    getState(): StateSnapshot {
      return state;
    },

    /** Whether full sync has been received since last reconnect (controls offline queue flush) */
    isFullSyncReceived(): boolean {
      return fullSyncReceived;
    },

    /** Call when reconnecting — resets full sync flag */
    onReconnecting(): void {
      fullSyncReceived = false;
    },
  };
}
