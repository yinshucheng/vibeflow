/**
 * State Sync Service
 *
 * Connects WebSocket events to the Zustand store.
 * Handles SYNC_STATE and UPDATE_POLICY commands from the server.
 * All operations are read-only - no state modifications are sent to server.
 *
 * Requirements: 2.3
 */

import { websocketService } from './websocket.service';
import { useAppStore } from '@/store';
import type { SyncStateCommand, UpdatePolicyCommand } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface SyncServiceConfig {
  autoConnect?: boolean;
}

// =============================================================================
// SYNC SERVICE
// =============================================================================

class SyncService {
  private isInitialized = false;
  private unsubscribers: Array<() => void> = [];

  /**
   * Initialize the sync service.
   * Sets up WebSocket event listeners and connects them to the store.
   */
  initialize(config?: SyncServiceConfig): void {
    if (this.isInitialized) {
      console.warn('SyncService already initialized');
      return;
    }

    this.setupEventListeners();
    this.isInitialized = true;

    // Auto-connect if configured
    if (config?.autoConnect !== false) {
      websocketService.connect();
    }
  }

  /**
   * Cleanup the sync service.
   * Removes all event listeners and disconnects WebSocket.
   */
  cleanup(): void {
    // Unsubscribe from all events
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    // Disconnect WebSocket
    websocketService.disconnect();

    this.isInitialized = false;
  }

  /**
   * Check if the service is initialized.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Request a full state sync from the server.
   * This is called when connection is restored.
   */
  requestFullSync(): void {
    // The server automatically sends a full sync on connection
    // This method is here for explicit sync requests if needed
    if (!websocketService.isConnected()) {
      console.warn('Cannot request sync: not connected');
      return;
    }

    // Server will send SYNC_STATE command automatically on connection
    // No explicit request needed in current implementation
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private setupEventListeners(): void {
    const store = useAppStore.getState();

    // Listen for connection status changes
    const unsubStatus = websocketService.onStatusChange((status) => {
      console.log('[SyncService] Connection status changed to:', status);
      useAppStore.getState().setConnectionStatus(status);
    });
    this.unsubscribers.push(unsubStatus);

    // Listen for SYNC_STATE commands
    const unsubSync = websocketService.onSyncState((command: SyncStateCommand) => {
      this.handleSyncState(command);
    });
    this.unsubscribers.push(unsubSync);

    // Listen for UPDATE_POLICY commands
    const unsubPolicy = websocketService.onPolicyUpdate((command: UpdatePolicyCommand) => {
      this.handlePolicyUpdate(command);
    });
    this.unsubscribers.push(unsubPolicy);

    // Listen for reconnection events
    const unsubReconnect = websocketService.onReconnect(() => {
      // Server will send full sync on reconnection
      console.log('Reconnected to server, awaiting state sync');
    });
    this.unsubscribers.push(unsubReconnect);

    // Listen for disconnect events
    const unsubDisconnect = websocketService.onDisconnect(() => {
      console.log('Disconnected from server');
    });
    this.unsubscribers.push(unsubDisconnect);
  }

  /**
   * Handle SYNC_STATE command from server.
   * Supports both full sync and delta sync.
   */
  private handleSyncState(command: SyncStateCommand): void {
    const { payload } = command;

    if (payload.syncType === 'full') {
      console.log('Received full state sync, version:', payload.version);
    } else if (payload.syncType === 'delta') {
      console.log('Received delta sync, version:', payload.version);
    }

    // Delegate to store handler
    try {
      useAppStore.getState().handleSyncState(command);
      console.log('[SyncService] State sync applied successfully');
    } catch (error) {
      console.error('[SyncService] Error applying state sync:', error);
    }
  }

  /**
   * Handle UPDATE_POLICY command from server.
   */
  private handlePolicyUpdate(command: UpdatePolicyCommand): void {
    const { payload } = command;
    console.log('Received policy update, version:', payload.policy.version);

    // Delegate to store handler
    useAppStore.getState().handlePolicyUpdate(command);
  }
}

// Export singleton instance
export const syncService = new SyncService();

// =============================================================================
// REACT HOOK FOR SYNC SERVICE
// =============================================================================

/**
 * Hook to initialize sync service in React components.
 * Should be called once at app root level.
 */
export function useSyncServiceInit(): void {
  // This is a placeholder for React integration
  // The actual initialization should happen in App.tsx or a provider
}
