/**
 * Realtime Store (Zustand)
 *
 * Single source of truth for all real-time server state pushed via WebSocket.
 * Driven by SDK createStateManager — ensures identical merge logic with iOS/Desktop/Extension.
 *
 * React Query is reserved for non-realtime data (task details, history, etc.).
 */

import { create } from 'zustand';
import {
  createStateManager,
  createCommandHandler,
  type StateSnapshot,
  type CommandHandlers,
} from '@vibeflow/octopus-protocol';
import type {
  ExecuteActionPayload,
  ShowUIPayload,
  DataChangePayload,
  DataChangeEntity,
} from '@vibeflow/octopus-protocol';
import { normalizeState } from '@/lib/state-utils';

// =============================================================================
// STORE STATE
// =============================================================================

export type SystemState = 'idle' | 'focus' | 'over_rest';

export interface RealtimeState {
  // Connection
  connected: boolean;

  // Protocol state (from SDK state manager)
  snapshot: StateSnapshot;
  systemState: SystemState;

  // Last execute command (for side effects)
  lastExecuteAction: ExecuteActionPayload | null;
  lastShowUI: ShowUIPayload | null;

  // Errors
  error: { code: string; message: string } | null;
}

export interface RealtimeActions {
  /** Internal: called by the state manager onStateChange callback */
  _applySnapshot: (snapshot: StateSnapshot, changedKeys: (keyof StateSnapshot)[]) => void;
  _setConnected: (connected: boolean) => void;
  _setError: (error: { code: string; message: string } | null) => void;
  _setExecuteAction: (payload: ExecuteActionPayload) => void;
  _setShowUI: (payload: ShowUIPayload) => void;
}

const INITIAL_SNAPSHOT: StateSnapshot = {
  systemState: { state: 'idle', dailyCapReached: false, skipTokensRemaining: 0 },
  activePomodoro: null,
  dailyState: null,
  top3Tasks: [],
  settings: null,
  policy: null,
};

// =============================================================================
// ZUSTAND STORE
// =============================================================================

export const useRealtimeStore = create<RealtimeState & RealtimeActions>()((set) => ({
  connected: false,
  snapshot: INITIAL_SNAPSHOT,
  systemState: 'idle',
  lastExecuteAction: null,
  lastShowUI: null,
  error: null,

  _applySnapshot: (snapshot, _changedKeys) => {
    set({
      snapshot,
      systemState: normalizeState(snapshot.systemState.state) as SystemState,
    });
  },

  _setConnected: (connected) => {
    set({ connected, ...(connected ? { error: null } : {}) });
  },

  _setError: (error) => {
    set({ error });
  },

  _setExecuteAction: (payload) => {
    set({ lastExecuteAction: payload });
  },

  _setShowUI: (payload) => {
    set({ lastShowUI: payload });
  },
}));

// =============================================================================
// SDK STATE MANAGER (module-level singleton)
// =============================================================================

export const stateManager = createStateManager({
  onStateChange: (snapshot, changedKeys) => {
    useRealtimeStore.getState()._applySnapshot(snapshot, changedKeys);
  },
});

// =============================================================================
// SDK COMMAND HANDLER (module-level singleton)
// =============================================================================

export const commandHandler = createCommandHandler({
  onStateSync: (payload) => {
    stateManager.handleSync(payload);
  },
  onPolicyUpdate: (payload) => {
    stateManager.handlePolicyUpdate(payload);
  },
  onExecuteAction: (payload) => {
    useRealtimeStore.getState()._setExecuteAction(payload);
  },
  onShowUI: (payload) => {
    useRealtimeStore.getState()._setShowUI(payload);
  },
  onActionResult: () => {
    // Web doesn't use ACTION_RESULT (tRPC handles request/response)
  },
  onDataChange: (payload) => {
    // Notify subscribers that a data entity changed
    dataChangeListeners.forEach((listener) => listener(payload));
  },
});

// =============================================================================
// DATA_CHANGE EVENT BUS
// =============================================================================

type DataChangeListener = (payload: DataChangePayload) => void;
const dataChangeListeners = new Set<DataChangeListener>();

/**
 * Subscribe to DATA_CHANGE events. Returns unsubscribe function.
 * Web components use this to invalidate React Query cache.
 */
export function onDataChange(listener: DataChangeListener): () => void {
  dataChangeListeners.add(listener);
  return () => dataChangeListeners.delete(listener);
}

// =============================================================================
// SELECTORS (precise subscriptions to avoid over-render)
// =============================================================================

export const useSystemState = () => useRealtimeStore((s) => s.systemState);
export const useActivePomodoro = () => useRealtimeStore((s) => s.snapshot.activePomodoro);
export const useDailyState = () => useRealtimeStore((s) => s.snapshot.dailyState);
export const useSettings = () => useRealtimeStore((s) => s.snapshot.settings);
export const usePolicy = () => useRealtimeStore((s) => s.snapshot.policy);
export const useTop3Tasks = () => useRealtimeStore((s) => s.snapshot.top3Tasks);
export const useRealtimeConnected = () => useRealtimeStore((s) => s.connected);
export const useRealtimeError = () => useRealtimeStore((s) => s.error);
