/**
 * State Sync Service
 *
 * Connects WebSocket events to the Zustand store via SDK createStateManager.
 * The state manager handles all merge logic; this service maps protocol types
 * to iOS-specific store format.
 *
 * Requirements: 2.3
 */

import { createStateManager, type StateSnapshot } from '@vibeflow/octopus-protocol';
import { websocketService } from './websocket.service';
import { useAppStore } from '@/store/app.store';
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

  // SDK state manager — single source of truth for protocol state
  private stateManager = createStateManager({
    onStateChange: (snapshot: StateSnapshot, changedKeys: (keyof StateSnapshot)[]) => {
      // Map protocol state to iOS store format and push to Zustand
      useAppStore.getState().handleStateSnapshot(snapshot, changedKeys);
    },
  });

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
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
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
   * Whether the SDK state manager has received a full sync since last reconnect.
   * Used for offline queue flush timing.
   */
  isFullSyncReceived(): boolean {
    return this.stateManager.isFullSyncReceived();
  }

  /**
   * Request a full state sync from the server.
   */
  requestFullSync(): void {
    if (!websocketService.isConnected()) {
      console.warn('Cannot request sync: not connected');
      return;
    }
    // Server sends SYNC_STATE automatically on connection — no explicit request needed
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private setupEventListeners(): void {
    // Listen for connection status changes
    const unsubStatus = websocketService.onStatusChange((status) => {
      console.log('[SyncService] Connection status changed to:', status);
      useAppStore.getState().setConnectionStatus(status);
    });
    this.unsubscribers.push(unsubStatus);

    // Listen for SYNC_STATE commands — delegate to SDK state manager
    const unsubSync = websocketService.onSyncState((command: SyncStateCommand) => {
      console.log('[SyncService] Received full state sync, version:', command.payload.version);
      this.stateManager.handleSync(command.payload);
    });
    this.unsubscribers.push(unsubSync);

    // Listen for UPDATE_POLICY commands — delegate to SDK state manager
    const unsubPolicy = websocketService.onPolicyUpdate((command: UpdatePolicyCommand) => {
      console.log('[SyncService] Received policy update, version:', command.payload.policy.config.version);
      this.stateManager.handlePolicyUpdate(command.payload);
    });
    this.unsubscribers.push(unsubPolicy);

    // Listen for reconnection events — reset state manager full sync flag
    const unsubReconnect = websocketService.onReconnect(() => {
      console.log('[SyncService] Reconnected to server, awaiting state sync');
      this.stateManager.onReconnecting();
    });
    this.unsubscribers.push(unsubReconnect);

    // Listen for disconnect events
    const unsubDisconnect = websocketService.onDisconnect(() => {
      console.log('[SyncService] Disconnected from server');
    });
    this.unsubscribers.push(unsubDisconnect);
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
  // Placeholder for React integration
}
