/**
 * Action RPC — Unified USER_ACTION → ACTION_RESULT request/response.
 *
 * Clients call `send()` to dispatch a user action and get a promise that
 * resolves when the server responds with ACTION_RESULT. Handles timeouts
 * and connection-loss cleanup.
 */
import type { UserActionType, ActionResultPayload } from '../types';
export interface ActionRPCConfig {
    /** Timeout in ms (default 10000) */
    timeout?: number;
    /** Send event function — provided by each client's transport layer */
    sendEvent: (event: {
        eventType: 'USER_ACTION';
        payload: {
            actionType: UserActionType;
            optimisticId: string;
            data: Record<string, unknown>;
        };
    }) => void;
}
/**
 * Create an Action RPC handler. Pairs USER_ACTION requests with ACTION_RESULT responses.
 */
export declare function createActionRPC(config: ActionRPCConfig): {
    /** Send a user action and wait for the server's ACTION_RESULT */
    send(actionType: UserActionType, data: Record<string, unknown>): Promise<ActionResultPayload>;
    /** Route ACTION_RESULT from the command handler to the pending promise */
    handleResult(payload: ActionResultPayload): void;
    /** Clear all pending actions on disconnect */
    clearAll(): void;
    /** Number of pending actions (for diagnostics) */
    readonly pendingCount: number;
};
//# sourceMappingURL=action-rpc.d.ts.map