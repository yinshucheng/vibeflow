/**
 * State Manager — Unified state merge logic for all clients.
 *
 * Handles SYNC_STATE (full sync) and UPDATE_POLICY. All clients share the
 * same merge logic so state handling bugs are fixed once.
 *
 * Delta sync is deferred — current implementation is full-sync-only.
 */
import type { SystemState, DailyState, PomodoroState, TaskState, UserSettingsState, Policy, SyncStatePayload, UpdatePolicyPayload } from '../types';
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
/**
 * Create a state manager. Processes SYNC_STATE (full sync) and UPDATE_POLICY.
 *
 * All clients share the same merge logic — no more "iOS missed a field" bugs.
 */
export declare function createStateManager(config: StateManagerConfig): {
    /** Restore state from persistent storage (call on cold start) */
    initialize(): Promise<void>;
    /** Handle SYNC_STATE command — full sync overwrites local state */
    handleSync(payload: SyncStatePayload): void;
    /** Handle UPDATE_POLICY command */
    handlePolicyUpdate(payload: UpdatePolicyPayload): void;
    /** Get current state snapshot */
    getState(): StateSnapshot;
    /** Whether full sync has been received since last reconnect (controls offline queue flush) */
    isFullSyncReceived(): boolean;
    /** Call when reconnecting — resets full sync flag */
    onReconnecting(): void;
};
//# sourceMappingURL=state-manager.d.ts.map