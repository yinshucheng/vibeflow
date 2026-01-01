/**
 * Socket Broadcast Service
 * 
 * Provides a service layer for broadcasting WebSocket messages.
 * This service can be used by other services to trigger real-time updates.
 * 
 * Requirements: 5.6, 5.7, 6.7
 */

import type { SystemState, ExecuteCommand } from '@/server/socket';

// Broadcast function types
type StateChangeBroadcaster = (userId: string, state: SystemState) => void;
type PolicyUpdateBroadcaster = (userId: string) => Promise<void>;
type ExecuteCommandBroadcaster = (userId: string, command: ExecuteCommand) => void;

// Registered broadcasters (set by socket-init when server starts)
let stateChangeBroadcaster: StateChangeBroadcaster | null = null;
let policyUpdateBroadcaster: PolicyUpdateBroadcaster | null = null;
let executeCommandBroadcaster: ExecuteCommandBroadcaster | null = null;

/**
 * Register the state change broadcaster
 * Called by socket-init when the server starts
 */
export function registerStateChangeBroadcaster(broadcaster: StateChangeBroadcaster): void {
  stateChangeBroadcaster = broadcaster;
}

/**
 * Register the policy update broadcaster
 * Called by socket-init when the server starts
 */
export function registerPolicyUpdateBroadcaster(broadcaster: PolicyUpdateBroadcaster): void {
  policyUpdateBroadcaster = broadcaster;
}

/**
 * Register the execute command broadcaster
 * Called by socket-init when the server starts
 */
export function registerExecuteCommandBroadcaster(broadcaster: ExecuteCommandBroadcaster): void {
  executeCommandBroadcaster = broadcaster;
}

/**
 * Broadcast a state change to all connected clients for a user
 * Requirements: 6.7
 */
export function broadcastStateChange(userId: string, state: SystemState): void {
  if (stateChangeBroadcaster) {
    stateChangeBroadcaster(userId, state);
  } else {
    console.log(`[SocketBroadcast] State change queued (server not ready): ${userId} -> ${state}`);
  }
}

/**
 * Broadcast a policy update to all connected clients for a user
 * Requirements: 6.7
 */
export async function broadcastPolicyUpdate(userId: string): Promise<void> {
  if (policyUpdateBroadcaster) {
    await policyUpdateBroadcaster(userId);
  } else {
    console.log(`[SocketBroadcast] Policy update queued (server not ready): ${userId}`);
  }
}

/**
 * Send an execute command to all connected clients for a user
 * Requirements: 5.6, 5.7
 */
export function sendExecuteCommand(userId: string, command: ExecuteCommand): void {
  if (executeCommandBroadcaster) {
    executeCommandBroadcaster(userId, command);
  } else {
    console.log(`[SocketBroadcast] Execute command queued (server not ready): ${userId} -> ${command.action}`);
  }
}

/**
 * Send idle alert to Browser Sentinel
 * Requirements: 5.6, 5.7
 */
export function broadcastIdleAlert(
  userId: string,
  params: {
    idleSeconds: number;
    threshold: number;
    actions: string[];
    message?: string;
  }
): void {
  sendExecuteCommand(userId, {
    action: 'IDLE_ALERT',
    params,
  });
}

/**
 * Check if broadcasters are registered
 */
export function isBroadcastReady(): boolean {
  return stateChangeBroadcaster !== null && policyUpdateBroadcaster !== null;
}

export const socketBroadcastService = {
  registerStateChangeBroadcaster,
  registerPolicyUpdateBroadcaster,
  registerExecuteCommandBroadcaster,
  broadcastStateChange,
  broadcastPolicyUpdate,
  sendExecuteCommand,
  broadcastIdleAlert,
  isBroadcastReady,
};

export default socketBroadcastService;
