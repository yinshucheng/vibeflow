/**
 * Octopus Protocol SDK — Shared protocol logic for all clients.
 *
 * Re-exports all SDK modules.
 */
export { createCommandHandler } from './command-handler';
export type { CommandHandlers } from './command-handler';
export { createStateManager } from './state-manager';
export type { StateSnapshot, StateManagerConfig } from './state-manager';
export { createActionRPC } from './action-rpc';
export type { ActionRPCConfig } from './action-rpc';
export { createEventBuilder } from './event-builder';
export type { EventBuilderConfig } from './event-builder';
export { createHeartbeat } from './heartbeat';
export type { HeartbeatConfig, HeartbeatHandle } from './heartbeat';
//# sourceMappingURL=index.d.ts.map