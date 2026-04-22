/**
 * Socket Broadcast Service
 * 
 * Provides a service layer for broadcasting WebSocket messages.
 * This service can be used by other services to trigger real-time updates.
 * 
 * Requirements: 5.6, 5.7, 6.7
 */

import type { ExecuteCommand } from '@/server/socket';
import type { DataChangeEntity, DataChangeAction } from '@vibeflow/octopus-protocol';

// Broadcast function types
type PolicyUpdateBroadcaster = (userId: string) => Promise<void>;
type ExecuteCommandBroadcaster = (userId: string, command: ExecuteCommand) => void;
type EntertainmentModeChangeBroadcaster = (userId: string, payload: { isActive: boolean; sessionId: string | null; endTime: number | null }) => void;
type MCPEventBroadcaster = (userId: string, event: MCPEventPayload) => void;
type DataChangeBroadcaster = (userId: string, entity: DataChangeEntity, action: DataChangeAction, ids: string[], sourceClientId?: string) => void;

// MCP Event payload type
export interface MCPEventPayload {
  id: string;
  type: string;
  userId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

// Registered broadcasters (set by socket-init when server starts)
let policyUpdateBroadcaster: PolicyUpdateBroadcaster | null = null;
let executeCommandBroadcaster: ExecuteCommandBroadcaster | null = null;
let entertainmentModeChangeBroadcaster: EntertainmentModeChangeBroadcaster | null = null;
let mcpEventBroadcaster: MCPEventBroadcaster | null = null;
let dataChangeBroadcaster: DataChangeBroadcaster | null = null;

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
 * Register the entertainment mode change broadcaster
 * Called by socket-init when the server starts
 * Requirements: 8.6
 */
export function registerEntertainmentModeChangeBroadcaster(broadcaster: EntertainmentModeChangeBroadcaster): void {
  entertainmentModeChangeBroadcaster = broadcaster;
}

/**
 * Register the MCP event broadcaster
 * Called by socket-init when the server starts
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export function registerMCPEventBroadcaster(broadcaster: MCPEventBroadcaster): void {
  mcpEventBroadcaster = broadcaster;
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
 * Broadcast entertainment mode state change to all connected clients
 * Requirements: 8.6
 */
export function broadcastEntertainmentModeChange(
  userId: string,
  payload: { isActive: boolean; sessionId: string | null; endTime: number | null }
): void {
  if (entertainmentModeChangeBroadcaster) {
    entertainmentModeChangeBroadcaster(userId, payload);
  } else {
    console.log(`[SocketBroadcast] Entertainment mode change queued (server not ready): ${userId} -> ${payload.isActive}`);
  }
}

/**
 * Broadcast MCP event to all subscribed agents
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export function broadcastMCPEvent(userId: string, event: MCPEventPayload): void {
  if (mcpEventBroadcaster) {
    mcpEventBroadcaster(userId, event);
  } else {
    console.log(`[SocketBroadcast] MCP event queued (server not ready): ${userId} -> ${event.type}`);
  }
}

/**
 * Register the data change broadcaster
 * Called by socket-init when the server starts
 */
export function registerDataChangeBroadcaster(broadcaster: DataChangeBroadcaster): void {
  dataChangeBroadcaster = broadcaster;
}

/**
 * Broadcast a DATA_CHANGE notification to all connected clients for a user.
 * Tells clients that a data entity was modified so they can refetch.
 * The timestamp field enables future incremental sync (方案 3).
 */
export function broadcastDataChange(
  userId: string,
  entity: DataChangeEntity,
  action: DataChangeAction,
  ids: string[],
  sourceClientId?: string,
): void {
  if (dataChangeBroadcaster) {
    console.log(`[SocketBroadcast] DATA_CHANGE: ${entity}.${action} ids=${ids.join(',')} user=${userId}`);
    dataChangeBroadcaster(userId, entity, action, ids, sourceClientId);
  } else {
    console.log(`[SocketBroadcast] DATA_CHANGE broadcaster not registered! ${entity}.${action} user=${userId}`);
  }
}

/**
 * Check if broadcasters are registered
 */
export function isBroadcastReady(): boolean {
  return policyUpdateBroadcaster !== null;
}

export const socketBroadcastService = {
  registerPolicyUpdateBroadcaster,
  registerExecuteCommandBroadcaster,
  registerEntertainmentModeChangeBroadcaster,
  registerMCPEventBroadcaster,
  registerDataChangeBroadcaster,
  broadcastPolicyUpdate,
  sendExecuteCommand,
  broadcastIdleAlert,
  broadcastEntertainmentModeChange,
  broadcastMCPEvent,
  broadcastDataChange,
  isBroadcastReady,
};

export default socketBroadcastService;
