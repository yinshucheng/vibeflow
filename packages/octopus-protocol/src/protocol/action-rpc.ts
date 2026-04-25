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
  /** Send event function — provided by each client's transport layer. Return false if send failed (e.g., not connected) */
  sendEvent: (event: { eventType: 'USER_ACTION'; payload: { actionType: UserActionType; optimisticId: string; data: Record<string, unknown> } }) => boolean | void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an Action RPC handler. Pairs USER_ACTION requests with ACTION_RESULT responses.
 */
export function createActionRPC(config: ActionRPCConfig) {
  const pending = new Map<string, {
    resolve: (result: ActionResultPayload) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  return {
    /** Send a user action and wait for the server's ACTION_RESULT */
    send(actionType: UserActionType, data: Record<string, unknown>): Promise<ActionResultPayload> {
      const optimisticId = generateId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(optimisticId);
          reject(new Error(`Action ${actionType} timed out`));
        }, config.timeout ?? 10000);

        pending.set(optimisticId, { resolve, reject, timer });

        const sent = config.sendEvent({
          eventType: 'USER_ACTION',
          payload: { actionType, optimisticId, data },
        });

        // If sendEvent returns false, fail immediately instead of waiting for timeout
        if (sent === false) {
          clearTimeout(timer);
          pending.delete(optimisticId);
          reject(new Error(`Not connected`));
        }
      });
    },

    /** Route ACTION_RESULT from the command handler to the pending promise */
    handleResult(payload: ActionResultPayload): void {
      const entry = pending.get(payload.optimisticId);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(payload.optimisticId);
        entry.resolve(payload);
      }
    },

    /** Clear all pending actions on disconnect */
    clearAll(): void {
      pending.forEach((entry) => {
        clearTimeout(entry.timer);
        entry.reject(new Error('Connection lost'));
      });
      pending.clear();
    },

    /** Number of pending actions (for diagnostics) */
    get pendingCount(): number {
      return pending.size;
    },
  };
}
