"use strict";
/**
 * Action RPC — Unified USER_ACTION → ACTION_RESULT request/response.
 *
 * Clients call `send()` to dispatch a user action and get a promise that
 * resolves when the server responds with ACTION_RESULT. Handles timeouts
 * and connection-loss cleanup.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createActionRPC = createActionRPC;
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Create an Action RPC handler. Pairs USER_ACTION requests with ACTION_RESULT responses.
 */
function createActionRPC(config) {
    const pending = new Map();
    return {
        /** Send a user action and wait for the server's ACTION_RESULT */
        send(actionType, data) {
            const optimisticId = generateId();
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(optimisticId);
                    reject(new Error(`Action ${actionType} timed out`));
                }, config.timeout ?? 10000);
                pending.set(optimisticId, { resolve, reject, timer });
                config.sendEvent({
                    eventType: 'USER_ACTION',
                    payload: { actionType, optimisticId, data },
                });
            });
        },
        /** Route ACTION_RESULT from the command handler to the pending promise */
        handleResult(payload) {
            const entry = pending.get(payload.optimisticId);
            if (entry) {
                clearTimeout(entry.timer);
                pending.delete(payload.optimisticId);
                entry.resolve(payload);
            }
        },
        /** Clear all pending actions on disconnect */
        clearAll() {
            pending.forEach((entry) => {
                clearTimeout(entry.timer);
                entry.reject(new Error('Connection lost'));
            });
            pending.clear();
        },
        /** Number of pending actions (for diagnostics) */
        get pendingCount() {
            return pending.size;
        },
    };
}
//# sourceMappingURL=action-rpc.js.map