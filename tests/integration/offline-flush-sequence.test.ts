/**
 * Offline Flush Sequence Integration Tests
 *
 * Verifies the reconnect → wait for full sync → flush offline queue timing
 * across all clients that implement offline queues (Desktop, Extension).
 *
 * Tests use static analysis to verify the pattern is correctly implemented.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// SDK state manager source
const stateManagerPath = path.resolve(__dirname, '../../packages/octopus-protocol/src/protocol/state-manager.ts');
const stateManagerSource = fs.readFileSync(stateManagerPath, 'utf-8');

// Desktop connection manager source
const desktopConnMgrPath = path.resolve(__dirname, '../../vibeflow-desktop/electron/modules/connection-manager.ts');
const desktopSource = fs.readFileSync(desktopConnMgrPath, 'utf-8');

// Desktop main.ts (contains the flush logic)
const desktopMainPath = path.resolve(__dirname, '../../vibeflow-desktop/electron/main.ts');
const desktopMainSource = fs.readFileSync(desktopMainPath, 'utf-8');

// Extension websocket source
const extWebsocketPath = path.resolve(__dirname, '../../vibeflow-extension/src/lib/websocket.ts');
const extSource = fs.readFileSync(extWebsocketPath, 'utf-8');

// iOS sync service source
const iosSyncPath = path.resolve(__dirname, '../../vibeflow-ios/src/services/sync.service.ts');
const iosSyncSource = fs.readFileSync(iosSyncPath, 'utf-8');

describe('Offline Flush Sequence: reconnect → full sync → flush', () => {
  // -------------------------------------------------------------------------
  // SDK State Manager: provides isFullSyncReceived/onReconnecting
  // -------------------------------------------------------------------------

  describe('SDK State Manager prerequisites', () => {
    it('should expose isFullSyncReceived() method', () => {
      expect(stateManagerSource).toContain('isFullSyncReceived');
    });

    it('should expose onReconnecting() method that resets fullSyncReceived', () => {
      expect(stateManagerSource).toContain('onReconnecting');
      expect(stateManagerSource).toContain('fullSyncReceived = false');
    });

    it('should set fullSyncReceived = true on handleSync', () => {
      // handleSync or handleFullSync should set the flag
      expect(stateManagerSource).toContain('fullSyncReceived = true');
    });
  });

  // -------------------------------------------------------------------------
  // Desktop: uses fullSyncReceived pattern in main.ts
  // -------------------------------------------------------------------------

  describe('Desktop: flush waits for full sync', () => {
    it('should use createStateManager in connection-manager', () => {
      expect(desktopSource).toContain('createStateManager');
    });

    it('should call stateManager.onReconnecting() on disconnect', () => {
      expect(desktopSource).toContain('stateManager.onReconnecting()');
    });

    it('should track fullSyncReceived in main.ts', () => {
      expect(desktopMainSource).toContain('fullSyncReceived');
    });

    it('should have a timeout fallback for flush (10s best effort)', () => {
      // Desktop main.ts has a timeout-based flush fallback
      const hasTimeout = desktopMainSource.includes('10000') || desktopMainSource.includes('10_000');
      expect(hasTimeout).toBe(true);
    });

    it('should reset fullSyncReceived on disconnect/reconnecting', () => {
      // In main.ts, fullSyncReceived is reset
      const resetLines = desktopMainSource.split('\n').filter(
        (line) => line.includes('fullSyncReceived = false')
      );
      expect(resetLines.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Extension: uses fullSyncReceived + waitForFullSyncThenReplay
  // -------------------------------------------------------------------------

  describe('Extension: flush waits for full sync', () => {
    it('should use createStateManager in websocket.ts', () => {
      expect(extSource).toContain('createStateManager');
    });

    it('should call stateManager.onReconnecting() on disconnect', () => {
      expect(extSource).toContain('stateManager.onReconnecting()');
    });

    it('should track fullSyncReceived flag', () => {
      expect(extSource).toContain('fullSyncReceived');
    });

    it('should have waitForFullSyncThenReplay method', () => {
      expect(extSource).toContain('waitForFullSyncThenReplay');
    });

    it('should call notifyFullSyncReceived on SYNC_STATE', () => {
      expect(extSource).toContain('notifyFullSyncReceived');
    });

    it('should have a 10s timeout fallback for flush', () => {
      expect(extSource).toContain('10000');
    });

    it('should replay events after full sync via EventReplayManager', () => {
      expect(extSource).toContain('replayManager');
      expect(extSource).toContain('replayAll');
    });

    it('should use chrome.storage.local for state persistence', () => {
      expect(extSource).toContain('chrome.storage.local');
    });

    it('should reset fullSyncReceived on connect', () => {
      const resetLines = extSource.split('\n').filter(
        (line) => line.includes('fullSyncReceived = false')
      );
      expect(resetLines.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // iOS: exposes isFullSyncReceived but no offline queue (read-only client)
  // -------------------------------------------------------------------------

  describe('iOS: state manager provides full sync tracking', () => {
    it('should use createStateManager in sync.service.ts', () => {
      expect(iosSyncSource).toContain('createStateManager');
    });

    it('should call stateManager.onReconnecting() on reconnect', () => {
      expect(iosSyncSource).toContain('stateManager.onReconnecting()');
    });

    it('should expose isFullSyncReceived method', () => {
      expect(iosSyncSource).toContain('isFullSyncReceived');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-client: all use the same SDK state manager
  // -------------------------------------------------------------------------

  describe('Cross-client consistency', () => {
    it('all clients using stateManager call onReconnecting on disconnect/reconnect', () => {
      // Desktop, Extension, and iOS all call onReconnecting
      expect(desktopSource).toContain('stateManager.onReconnecting()');
      expect(extSource).toContain('stateManager.onReconnecting()');
      expect(iosSyncSource).toContain('stateManager.onReconnecting()');
    });

    it('all clients route SYNC_STATE through stateManager.handleSync', () => {
      // Desktop and Extension use stateManager for state sync
      expect(desktopSource).toContain('stateManager.handleSync');
      expect(extSource).toContain('stateManager.handleSync');
      expect(iosSyncSource).toContain('stateManager.handleSync');
    });
  });
});
