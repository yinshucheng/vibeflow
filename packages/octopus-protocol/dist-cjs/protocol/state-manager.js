"use strict";
/**
 * State Manager — Unified state merge logic for all clients.
 *
 * Handles SYNC_STATE (full sync) and UPDATE_POLICY. All clients share the
 * same merge logic so state handling bugs are fixed once.
 *
 * Delta sync is deferred — current implementation is full-sync-only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStateManager = createStateManager;
const INITIAL_STATE = {
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
function createStateManager(config) {
    let state = { ...INITIAL_STATE };
    /** Full sync received flag — controls offline queue flush timing */
    let fullSyncReceived = false;
    return {
        /** Restore state from persistent storage (call on cold start) */
        async initialize() {
            if (config.loadFromStorage) {
                const stored = await config.loadFromStorage();
                if (stored) {
                    state = stored;
                }
            }
        },
        /** Handle SYNC_STATE command — full sync overwrites local state */
        handleSync(payload) {
            if (!payload.state)
                return;
            const changedKeys = [];
            const fullState = payload.state;
            const newState = {
                systemState: fullState.systemState,
                activePomodoro: fullState.activePomodoro ?? null,
                dailyState: fullState.dailyState ?? null,
                top3Tasks: fullState.top3Tasks ?? state.top3Tasks,
                settings: fullState.settings ?? state.settings,
                policy: state.policy, // policy comes via UPDATE_POLICY, not SYNC_STATE
            };
            // Shallow compare: only mark keys that actually changed
            if (newState.systemState !== state.systemState)
                changedKeys.push('systemState');
            if (newState.activePomodoro !== state.activePomodoro)
                changedKeys.push('activePomodoro');
            if (newState.dailyState !== state.dailyState)
                changedKeys.push('dailyState');
            if (newState.top3Tasks !== state.top3Tasks)
                changedKeys.push('top3Tasks');
            if (newState.settings !== state.settings)
                changedKeys.push('settings');
            state = newState;
            fullSyncReceived = true;
            if (changedKeys.length > 0) {
                config.onStateChange(state, changedKeys);
            }
            config.saveToStorage?.(state);
        },
        /** Handle UPDATE_POLICY command */
        handlePolicyUpdate(payload) {
            state = { ...state, policy: payload.policy };
            config.onStateChange(state, ['policy']);
            config.saveToStorage?.(state);
        },
        /** Get current state snapshot */
        getState() {
            return state;
        },
        /** Whether full sync has been received since last reconnect (controls offline queue flush) */
        isFullSyncReceived() {
            return fullSyncReceived;
        },
        /** Call when reconnecting — resets full sync flag */
        onReconnecting() {
            fullSyncReceived = false;
        },
    };
}
//# sourceMappingURL=state-manager.js.map