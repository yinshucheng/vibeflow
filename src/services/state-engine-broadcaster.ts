/**
 * State Engine Broadcaster Registry
 *
 * Uses globalThis to ensure a single shared state across Next.js webpack
 * modules and Node.js native modules in the same process.
 * This is necessary because Next.js App Router's route handlers are compiled
 * by webpack, creating separate module instances from the custom server code.
 */

type FullStateBroadcaster = (userId: string) => Promise<void>;
type PolicyUpdateBroadcaster = (userId: string) => Promise<void>;

interface BroadcasterState {
  fullState: FullStateBroadcaster | null;
  policyUpdate: PolicyUpdateBroadcaster | null;
}

const GLOBAL_KEY = '__vibeflow_state_engine_broadcasters__';

function getState(): BroadcasterState {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      fullState: null,
      policyUpdate: null,
    };
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as BroadcasterState;
}

export function registerFullStateBroadcaster(broadcaster: FullStateBroadcaster): void {
  getState().fullState = broadcaster;
}

export function registerStateEnginePolicyBroadcaster(broadcaster: PolicyUpdateBroadcaster): void {
  getState().policyUpdate = broadcaster;
}

export async function broadcastFullState(userId: string): Promise<void> {
  const { fullState } = getState();
  if (fullState) {
    console.log(`[StateEngine] broadcastFullState called for user ${userId}`);
    await fullState(userId);
  } else {
    console.log(`[StateEngine] broadcastFullState: broadcaster NOT registered! user=${userId}`);
  }
}

export async function broadcastPolicyUpdate(userId: string): Promise<void> {
  const { policyUpdate } = getState();
  if (policyUpdate) {
    await policyUpdate(userId);
  } else {
    console.log(`[StateEngine] broadcastPolicyUpdate queued (server not ready): ${userId}`);
  }
}
