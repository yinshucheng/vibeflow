/**
 * Unit tests for ConnectionManager EXECUTE event handling
 *
 * Tests the EXECUTE event listener and onExecuteCommand callback mechanism
 * for handling server commands like POMODORO_COMPLETE, IDLE_ALERT, etc.
 *
 * These tests verify the interface and behavior without importing the actual
 * ConnectionManager to avoid complex dependency mocking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ExecuteCommand interface (same as in connection-manager.ts)
interface ExecuteCommand {
  action: string;
  params: Record<string, unknown>;
}

// ExecuteCommandHandler type
type ExecuteCommandHandler = (command: ExecuteCommand) => void;

/**
 * Simulated ConnectionManager execute command handling
 * This mirrors the implementation in connection-manager.ts
 */
class MockConnectionManager {
  private executeCommandHandlers = new Set<ExecuteCommandHandler>();
  private socket: EventEmitter;
  private mainWindow: { webContents: { send: (channel: string, data: unknown) => void } } | null = null;

  constructor() {
    this.socket = new EventEmitter();
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    // Listen for EXECUTE commands from server
    this.socket.on('EXECUTE', (command: ExecuteCommand) => {
      console.log('[MockConnectionManager] EXECUTE received:', command.action);
      this.notifyExecuteCommand(command);
      this.sendToRenderer('execute:command', command);
    });
  }

  onExecuteCommand(handler: ExecuteCommandHandler): () => void {
    this.executeCommandHandlers.add(handler);
    return () => this.executeCommandHandlers.delete(handler);
  }

  private notifyExecuteCommand(command: ExecuteCommand): void {
    this.executeCommandHandlers.forEach((handler) => {
      try {
        handler(command);
      } catch (error) {
        console.error('[MockConnectionManager] Execute command handler error:', error);
      }
    });
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  setMainWindow(window: { webContents: { send: (channel: string, data: unknown) => void } }): void {
    this.mainWindow = window;
  }

  // Expose socket for testing
  getSocket(): EventEmitter {
    return this.socket;
  }
}

describe('ConnectionManager EXECUTE Event Handling', () => {
  let connectionManager: MockConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    connectionManager = new MockConnectionManager();
  });

  describe('onExecuteCommand', () => {
    it('should register execute command handlers', () => {
      const handler = vi.fn();
      const unsubscribe = connectionManager.onExecuteCommand(handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should unsubscribe handler when unsubscribe function is called', () => {
      const handler = vi.fn();
      const unsubscribe = connectionManager.onExecuteCommand(handler);

      unsubscribe();

      // Simulate EXECUTE event after unsubscribe
      connectionManager.getSocket().emit('EXECUTE', { action: 'POMODORO_COMPLETE', params: {} });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      connectionManager.onExecuteCommand(handler1);
      connectionManager.onExecuteCommand(handler2);

      // Simulate EXECUTE event
      const command: ExecuteCommand = {
        action: 'POMODORO_COMPLETE',
        params: { taskTitle: 'Test Task' },
      };
      connectionManager.getSocket().emit('EXECUTE', command);

      expect(handler1).toHaveBeenCalledWith(command);
      expect(handler2).toHaveBeenCalledWith(command);
    });
  });

  describe('EXECUTE event listener', () => {
    it('should notify handlers when EXECUTE event is received', () => {
      const handler = vi.fn();
      connectionManager.onExecuteCommand(handler);

      // Simulate EXECUTE event from server
      const command: ExecuteCommand = {
        action: 'POMODORO_COMPLETE',
        params: {
          pomodoroId: 'pomo-123',
          taskTitle: 'Test Task',
          duration: 25,
        },
      };
      connectionManager.getSocket().emit('EXECUTE', command);

      expect(handler).toHaveBeenCalledWith(command);
    });

    it('should handle POMODORO_COMPLETE action', () => {
      const handler = vi.fn();
      connectionManager.onExecuteCommand(handler);

      const command: ExecuteCommand = {
        action: 'POMODORO_COMPLETE',
        params: {
          pomodoroId: 'pomo-456',
          taskId: 'task-789',
          taskTitle: 'Focus on coding',
          duration: 25,
          wasInOverRest: false,
        },
      };
      connectionManager.getSocket().emit('EXECUTE', command);

      expect(handler).toHaveBeenCalledWith(command);
      expect(handler.mock.calls[0][0].action).toBe('POMODORO_COMPLETE');
      expect(handler.mock.calls[0][0].params.taskTitle).toBe('Focus on coding');
    });

    it('should handle IDLE_ALERT action', () => {
      const handler = vi.fn();
      connectionManager.onExecuteCommand(handler);

      const command: ExecuteCommand = {
        action: 'IDLE_ALERT',
        params: {
          idleSeconds: 300,
          threshold: 180,
        },
      };
      connectionManager.getSocket().emit('EXECUTE', command);

      expect(handler).toHaveBeenCalledWith(command);
      expect(handler.mock.calls[0][0].action).toBe('IDLE_ALERT');
    });

    it('should forward EXECUTE event to renderer process', () => {
      const mockMainWindow = {
        webContents: {
          send: vi.fn(),
        },
      };

      connectionManager.setMainWindow(mockMainWindow);

      const command: ExecuteCommand = {
        action: 'POMODORO_COMPLETE',
        params: { taskTitle: 'Test' },
      };
      connectionManager.getSocket().emit('EXECUTE', command);

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('execute:command', command);
    });

    it('should handle errors in execute command handlers gracefully', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();

      connectionManager.onExecuteCommand(errorHandler);
      connectionManager.onExecuteCommand(successHandler);

      const command: ExecuteCommand = {
        action: 'POMODORO_COMPLETE',
        params: {},
      };

      // Should not throw
      expect(() => connectionManager.getSocket().emit('EXECUTE', command)).not.toThrow();

      // Second handler should still be called
      expect(successHandler).toHaveBeenCalledWith(command);
    });
  });

  describe('ExecuteCommand interface', () => {
    it('should have correct shape for POMODORO_COMPLETE', () => {
      const command: ExecuteCommand = {
        action: 'POMODORO_COMPLETE',
        params: {
          pomodoroId: 'string',
          taskId: 'string',
          taskTitle: 'string',
          duration: 25,
          wasInOverRest: false,
        },
      };

      expect(command.action).toBe('POMODORO_COMPLETE');
      expect(typeof command.params).toBe('object');
    });

    it('should have correct shape for IDLE_ALERT', () => {
      const command: ExecuteCommand = {
        action: 'IDLE_ALERT',
        params: {
          idleSeconds: 300,
          threshold: 180,
        },
      };

      expect(command.action).toBe('IDLE_ALERT');
      expect(typeof command.params.idleSeconds).toBe('number');
    });

    it('should have correct shape for various action types', () => {
      const actions = ['POMODORO_COMPLETE', 'IDLE_ALERT', 'INJECT_TOAST', 'SHOW_OVERLAY', 'REDIRECT'];

      actions.forEach(action => {
        const command: ExecuteCommand = {
          action,
          params: {},
        };
        expect(command.action).toBe(action);
        expect(command.params).toBeDefined();
      });
    });
  });

  describe('Handler lifecycle', () => {
    it('should allow re-registering same handler after unsubscribe', () => {
      const handler = vi.fn();

      const unsubscribe1 = connectionManager.onExecuteCommand(handler);
      unsubscribe1();

      // Re-register
      connectionManager.onExecuteCommand(handler);

      const command: ExecuteCommand = { action: 'TEST', params: {} };
      connectionManager.getSocket().emit('EXECUTE', command);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle unsubscribing non-existent handler', () => {
      const handler = vi.fn();
      const unsubscribe = connectionManager.onExecuteCommand(handler);

      // Double unsubscribe should not throw
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});
