/**
 * Socket Protocol Integration Tests — Phase B2 Verification
 *
 * Verifies that the server and clients only use the unified OCTOPUS_COMMAND protocol:
 *   - Server emits no legacy events (STATE_CHANGE, SYNC_POLICY, EXECUTE, policy:update, habit:*, ENTERTAINMENT_MODE_CHANGE)
 *   - Server handles no legacy client events (ACTIVITY_LOG, URL_CHECK, USER_RESPONSE, REQUEST_POLICY, TIMELINE_*, BLOCK_EVENT, INTERRUPTION_EVENT)
 *   - ServerToClientEvents and ClientToServerEvents interfaces match the Octopus protocol spec
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Read source files for static analysis
const socketPath = path.resolve(__dirname, '../../src/server/socket.ts');
const socketSource = fs.readFileSync(socketPath, 'utf-8');

const desktopConnMgrPath = path.resolve(__dirname, '../../vibeflow-desktop/electron/modules/connection-manager.ts');
const desktopSource = fs.readFileSync(desktopConnMgrPath, 'utf-8');

const extWebsocketPath = path.resolve(__dirname, '../../vibeflow-extension/src/lib/websocket.ts');
const extWebsocketSource = fs.readFileSync(extWebsocketPath, 'utf-8');

const extTypesPath = path.resolve(__dirname, '../../vibeflow-extension/src/types/index.ts');
const extTypesSource = fs.readFileSync(extTypesPath, 'utf-8');

describe('Phase B2: Socket Protocol Compliance', () => {
  // -----------------------------------------------------------------------
  // Server-to-Client: no legacy emits
  // -----------------------------------------------------------------------

  describe('Server → Client: no legacy emit events', () => {
    const legacyServerEmits = [
      'STATE_CHANGE',
      'SYNC_POLICY',
      'EXECUTE',
      'policy:update',
      'habit:created',
      'habit:updated',
      'habit:deleted',
      'habit:entry_updated',
      'ENTERTAINMENT_MODE_CHANGE',
    ];

    for (const event of legacyServerEmits) {
      it(`should NOT emit legacy event "${event}"`, () => {
        // Match actual emit calls: .emit('EVENT_NAME', ...) but exclude comments and string literals
        const emitPattern = new RegExp(`\\.emit\\(['"]${event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g');
        const matches = socketSource.match(emitPattern) || [];

        // Filter out matches that are in comments
        const actualEmits = matches.filter((_m, index) => {
          const matchIndex = socketSource.indexOf(matches[0]!);
          if (matchIndex === -1) return true;
          // Check if this is in a comment
          const lineStart = socketSource.lastIndexOf('\n', matchIndex);
          const line = socketSource.substring(lineStart, matchIndex);
          return !line.includes('//') && !line.includes('*');
        });

        expect(actualEmits.length, `Found legacy emit for "${event}" in socket.ts`).toBe(0);
      });
    }
  });

  // -----------------------------------------------------------------------
  // Client-to-Server: no legacy handlers
  // -----------------------------------------------------------------------

  describe('Server: no legacy client event handlers', () => {
    const legacyClientHandlers = [
      'ACTIVITY_LOG',
      'URL_CHECK',
      'USER_RESPONSE',
      'REQUEST_POLICY',
      'TIMELINE_EVENT',
      'TIMELINE_EVENTS_BATCH',
      'BLOCK_EVENT',
      'INTERRUPTION_EVENT',
    ];

    for (const event of legacyClientHandlers) {
      it(`should NOT have handler for legacy event "${event}"`, () => {
        // Match: socket.on('EVENT_NAME', ...)
        const handlerPattern = new RegExp(`socket\\.on\\(['"]${event}['"]`, 'g');
        const matches = socketSource.match(handlerPattern) || [];
        expect(matches.length, `Found legacy handler for "${event}" in socket.ts`).toBe(0);
      });
    }
  });

  // -----------------------------------------------------------------------
  // Interface compliance
  // -----------------------------------------------------------------------

  describe('ServerToClientEvents interface', () => {
    it('should contain OCTOPUS_COMMAND', () => {
      expect(socketSource).toContain('OCTOPUS_COMMAND: (command: OctopusCommand) => void');
    });

    it('should contain COMMAND_ACK_REQUEST', () => {
      expect(socketSource).toContain('COMMAND_ACK_REQUEST:');
    });

    it('should contain error event', () => {
      expect(socketSource).toContain('error: (payload:');
    });

    it('should NOT contain legacy event type declarations', () => {
      // Check the interface block doesn't declare legacy events
      const interfaceMatch = socketSource.match(/interface ServerToClientEvents\s*\{[\s\S]*?\}/);
      expect(interfaceMatch).toBeTruthy();
      const interfaceBody = interfaceMatch![0];

      expect(interfaceBody).not.toContain("'SYNC_POLICY'");
      expect(interfaceBody).not.toContain("'STATE_CHANGE'");
      expect(interfaceBody).not.toContain("'EXECUTE'");
      expect(interfaceBody).not.toContain("'habit:");
      expect(interfaceBody).not.toContain("'ENTERTAINMENT_MODE_CHANGE'");
    });
  });

  describe('ClientToServerEvents interface', () => {
    it('should contain OCTOPUS_EVENT', () => {
      expect(socketSource).toContain('OCTOPUS_EVENT: (event: OctopusEvent) => void');
    });

    it('should contain OCTOPUS_EVENTS_BATCH', () => {
      expect(socketSource).toContain('OCTOPUS_EVENTS_BATCH:');
    });

    it('should NOT contain legacy client event declarations', () => {
      const interfaceMatch = socketSource.match(/interface ClientToServerEvents\s*\{[\s\S]*?\}/);
      expect(interfaceMatch).toBeTruthy();
      const interfaceBody = interfaceMatch![0];

      expect(interfaceBody).not.toContain("'ACTIVITY_LOG'");
      expect(interfaceBody).not.toContain("'URL_CHECK'");
      expect(interfaceBody).not.toContain("'USER_RESPONSE'");
      expect(interfaceBody).not.toContain("'REQUEST_POLICY'");
      expect(interfaceBody).not.toContain("'TIMELINE_EVENT'");
      expect(interfaceBody).not.toContain("'BLOCK_EVENT'");
      expect(interfaceBody).not.toContain("'INTERRUPTION_EVENT'");
    });
  });

  // -----------------------------------------------------------------------
  // broadcastHabitUpdate uses DATA_CHANGE (not legacy habit:* events)
  // -----------------------------------------------------------------------

  describe('broadcastHabitUpdate', () => {
    it('should use broadcastDataChange instead of direct habit:* emits', () => {
      // Find the broadcastHabitUpdate method
      const methodMatch = socketSource.match(/async broadcastHabitUpdate[\s\S]*?console\.log[\s\S]*?\n\s*\}/);
      expect(methodMatch).toBeTruthy();
      const methodBody = methodMatch![0];

      // Should use DATA_CHANGE via socketBroadcastService
      expect(methodBody).toContain('socketBroadcastService.broadcastDataChange');
      // Should NOT emit legacy habit:* events directly
      expect(methodBody).not.toContain(".emit('habit:created'");
      expect(methodBody).not.toContain(".emit('habit:updated'");
      expect(methodBody).not.toContain(".emit('habit:deleted'");
    });
  });

  // -----------------------------------------------------------------------
  // broadcastEntertainmentModeChange uses OCTOPUS_COMMAND
  // -----------------------------------------------------------------------

  describe('broadcastEntertainmentModeChange', () => {
    it('should emit OCTOPUS_COMMAND, not ENTERTAINMENT_MODE_CHANGE', () => {
      const methodMatch = socketSource.match(/broadcastEntertainmentModeChange[\s\S]*?console\.log[\s\S]*?\n\s*\}/);
      expect(methodMatch).toBeTruthy();
      const methodBody = methodMatch![0];

      expect(methodBody).toContain("emit('OCTOPUS_COMMAND'");
      expect(methodBody).not.toContain("'ENTERTAINMENT_MODE_CHANGE'");
    });
  });

  // -----------------------------------------------------------------------
  // Desktop: no legacy listeners
  // -----------------------------------------------------------------------

  describe('Desktop connection-manager.ts: no legacy listeners', () => {
    it('should NOT listen for legacy policy:update event', () => {
      expect(desktopSource).not.toMatch(/socket\.on\(['"]policy:update['"]/);
    });

    it('should NOT listen for legacy STATE_CHANGE event', () => {
      expect(desktopSource).not.toMatch(/socket\.on\(['"]STATE_CHANGE['"]/);
    });

    it('should NOT listen for legacy EXECUTE event', () => {
      expect(desktopSource).not.toMatch(/socket\.on\(['"]EXECUTE['"]/);
    });

    it('should NOT listen for legacy state:sync event', () => {
      expect(desktopSource).not.toMatch(/socket\.on\(['"]state:sync['"]/);
    });

    it('should listen for OCTOPUS_COMMAND', () => {
      expect(desktopSource).toMatch(/socket\.on\(['"]OCTOPUS_COMMAND['"]/);
    });
  });

  // -----------------------------------------------------------------------
  // Extension: no legacy switch cases
  // -----------------------------------------------------------------------

  describe('Extension websocket.ts: no legacy switch cases', () => {
    const legacyEvents = ['SYNC_POLICY', 'STATE_CHANGE', 'EXECUTE', 'ENTERTAINMENT_MODE_CHANGE', 'ENTERTAINMENT_QUOTA_SYNC'];

    for (const event of legacyEvents) {
      it(`should NOT have switch case for "${event}"`, () => {
        expect(extWebsocketSource).not.toMatch(new RegExp(`case ['"]${event}['"]:`));
      });
    }

    it('should have switch case for OCTOPUS_COMMAND', () => {
      expect(extWebsocketSource).toMatch(/case ['"]OCTOPUS_COMMAND['"]:/);
    });
  });

  describe('Extension types: no legacy ServerMessage/ClientMessage', () => {
    it('should NOT export ServerMessage type', () => {
      expect(extTypesSource).not.toMatch(/export type ServerMessage\s*=/);
    });

    it('should NOT export ClientMessage type', () => {
      expect(extTypesSource).not.toMatch(/export type ClientMessage\s*=/);
    });
  });
});
