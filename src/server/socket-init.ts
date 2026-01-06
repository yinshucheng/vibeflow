/**
 * Socket.io Server Initialization
 * 
 * This module provides utilities for initializing the Socket.io server
 * with a Next.js application. It can be used with a custom server setup.
 * 
 * Requirements: 5.7, 6.7
 */

import { Server as HttpServer } from 'http';
import { socketServer, type SystemState, type MCPEventPayload } from './socket';
import { 
  registerStateChangeBroadcaster, 
  registerPolicyUpdateBroadcaster,
  registerExecuteCommandBroadcaster,
  registerEntertainmentModeChangeBroadcaster,
  registerMCPEventBroadcaster,
} from '@/services/socket-broadcast.service';
import { registerMCPEventBroadcaster as registerMCPServiceBroadcaster, mcpEventService } from '@/services/mcp-event.service';
import { dailyResetSchedulerService } from '@/services/daily-reset-scheduler.service';

let isInitialized = false;
let mcpEventCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize Socket.io server with an HTTP server
 * Should be called once during server startup
 */
export function initializeSocketServer(httpServer: HttpServer): void {
  if (isInitialized) {
    console.log('[Socket.io] Server already initialized');
    return;
  }

  socketServer.initialize(httpServer);
  
  // Register broadcasters for use by other services
  registerStateChangeBroadcaster((userId, state) => {
    socketServer.broadcastStateChange(userId, state);
  });
  
  registerPolicyUpdateBroadcaster(async (userId) => {
    await socketServer.broadcastPolicyUpdate(userId);
  });
  
  registerExecuteCommandBroadcaster((userId, command) => {
    socketServer.sendExecuteCommand(userId, command);
  });
  
  registerEntertainmentModeChangeBroadcaster((userId, payload) => {
    socketServer.broadcastEntertainmentModeChange(userId, payload);
  });
  
  // Register MCP event broadcaster (Requirements: 10.1, 10.2, 10.3, 10.4)
  const mcpEventBroadcaster = (userId: string, event: MCPEventPayload) => {
    socketServer.broadcastMCPEvent(userId, event);
  };
  registerMCPEventBroadcaster(mcpEventBroadcaster);
  registerMCPServiceBroadcaster(mcpEventBroadcaster);
  
  // Start the daily reset scheduler (Requirements: 5.7)
  dailyResetSchedulerService.start();
  
  // Start MCP event cleanup interval (Requirement 10.5)
  // Cleanup old events every hour
  mcpEventCleanupInterval = setInterval(async () => {
    try {
      const result = await mcpEventService.cleanupOldEvents();
      if (result.success && result.data.count > 0) {
        console.log(`[Socket.io] Cleaned up ${result.data.count} old MCP events`);
      }
    } catch (error) {
      console.error('[Socket.io] Error cleaning up MCP events:', error);
    }
  }, 60 * 60 * 1000); // Every hour
  
  isInitialized = true;
  console.log('[Socket.io] Server initialization complete');
}

/**
 * Check if Socket.io server is initialized
 */
export function isSocketServerInitialized(): boolean {
  return isInitialized;
}

/**
 * Broadcast state change to a user
 * Can be called from anywhere in the application
 */
export function broadcastStateChange(userId: string, state: SystemState): void {
  if (!isInitialized) {
    console.warn('[Socket.io] Server not initialized, cannot broadcast state change');
    return;
  }
  socketServer.broadcastStateChange(userId, state);
}

/**
 * Broadcast policy update to a user
 * Can be called from anywhere in the application
 */
export async function broadcastPolicyUpdate(userId: string): Promise<void> {
  if (!isInitialized) {
    console.warn('[Socket.io] Server not initialized, cannot broadcast policy update');
    return;
  }
  await socketServer.broadcastPolicyUpdate(userId);
}

/**
 * Get connected client count for a user
 */
export function getConnectedClientCount(userId: string): number {
  if (!isInitialized) return 0;
  return socketServer.getConnectedClientCount(userId);
}

/**
 * Get all connected user IDs
 */
export function getConnectedUserIds(): string[] {
  if (!isInitialized) return [];
  return socketServer.getConnectedUserIds();
}

export { socketServer };
