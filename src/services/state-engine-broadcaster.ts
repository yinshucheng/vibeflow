/**
 * State Engine Broadcaster Registry
 *
 * Isolated module for late-bound broadcaster functions.
 * Exists as a separate file to avoid CJS module dual-instance issues
 * when state-engine.service.ts is imported via different paths
 * (barrel vs direct).
 */

type FullStateBroadcaster = (userId: string) => Promise<void>;
type PolicyUpdateBroadcaster = (userId: string) => Promise<void>;

let fullStateBroadcaster: FullStateBroadcaster | null = null;
let policyUpdateBroadcaster: PolicyUpdateBroadcaster | null = null;

export function registerFullStateBroadcaster(broadcaster: FullStateBroadcaster): void {
  fullStateBroadcaster = broadcaster;
}

export function registerStateEnginePolicyBroadcaster(broadcaster: PolicyUpdateBroadcaster): void {
  policyUpdateBroadcaster = broadcaster;
}

export async function broadcastFullState(userId: string): Promise<void> {
  if (fullStateBroadcaster) {
    await fullStateBroadcaster(userId);
  } else {
    console.log(`[StateEngine] broadcastFullState queued (server not ready): ${userId}`);
  }
}

export async function broadcastPolicyUpdate(userId: string): Promise<void> {
  if (policyUpdateBroadcaster) {
    await policyUpdateBroadcaster(userId);
  } else {
    console.log(`[StateEngine] broadcastPolicyUpdate queued (server not ready): ${userId}`);
  }
}
