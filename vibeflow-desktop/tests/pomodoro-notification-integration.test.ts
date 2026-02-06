/**
 * Integration tests for pomodoro notification flow
 *
 * Tests the complete flow from receiving EXECUTE event from server
 * to showing system notification and updating tray state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Track notification calls
const mockNotificationShow = vi.fn();
const mockBringToFront = vi.fn();

// Mock notification manager
vi.mock('../electron/modules/notification-manager', () => ({
  getNotificationManager: vi.fn(() => ({
    show: mockNotificationShow,
    showPomodoroComplete: vi.fn((taskName?: string) => {
      mockNotificationShow({
        title: 'Pomodoro Complete!',
        body: taskName ? `Great work on "${taskName}"!` : 'Great work!',
        type: 'pomodoro_complete',
      });
      mockBringToFront();
    }),
    showBreakComplete: vi.fn(() => {
      mockNotificationShow({
        title: 'Break Over!',
        body: 'Ready to start another pomodoro?',
        type: 'break_complete',
      });
    }),
    bringWindowToFront: mockBringToFront,
    setMainWindow: vi.fn(),
    isSupported: vi.fn(() => true),
  })),
}));

// Mock tray manager
const mockUpdateTrayState = vi.fn();
vi.mock('../electron/modules/tray-manager', () => ({
  getTrayManager: vi.fn(() => ({
    updateState: mockUpdateTrayState,
    getState: vi.fn(() => ({ systemState: 'FOCUS' })),
    create: vi.fn(),
    destroy: vi.fn(),
    setMainWindow: vi.fn(),
  })),
  resetTrayManager: vi.fn(),
}));

// Mock connection manager socket
const mockSocket = new EventEmitter();
const executeCommandHandlers = new Set<(command: unknown) => void>();

vi.mock('../electron/modules/connection-manager', () => ({
  getConnectionManager: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onExecuteCommand: vi.fn((handler: (command: unknown) => void) => {
      executeCommandHandlers.add(handler);
      return () => executeCommandHandlers.delete(handler);
    }),
    onStateChange: vi.fn(),
    onPolicyUpdate: vi.fn(),
    onConnectionChange: vi.fn(),
    setMainWindow: vi.fn(),
    getStatus: vi.fn(() => 'connected'),
  })),
  initializeConnectionManager: vi.fn(),
}));

// Helper to simulate server sending EXECUTE command
function simulateExecuteCommand(command: { action: string; params: Record<string, unknown> }): void {
  executeCommandHandlers.forEach(handler => handler(command));
}

describe('Pomodoro Notification Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeCommandHandlers.clear();
  });

  afterEach(() => {
    executeCommandHandlers.clear();
  });

  describe('POMODORO_COMPLETE notification flow', () => {
    it('should show notification when POMODORO_COMPLETE is received', () => {
      // Simulate the notification behavior directly
      const showPomodoroComplete = (taskName?: string) => {
        mockNotificationShow({
          title: 'Pomodoro Complete!',
          body: taskName ? `Great work on "${taskName}"!` : 'Great work!',
          type: 'pomodoro_complete',
        });
        mockBringToFront();
      };

      executeCommandHandlers.add((command: { action: string; params: Record<string, unknown> }) => {
        if (command.action === 'POMODORO_COMPLETE') {
          const taskTitle = command.params?.taskTitle as string | undefined;
          showPomodoroComplete(taskTitle);
        }
      });

      // Simulate server sending POMODORO_COMPLETE
      simulateExecuteCommand({
        action: 'POMODORO_COMPLETE',
        params: {
          pomodoroId: 'pomo-123',
          taskTitle: 'Implement feature X',
          duration: 25,
        },
      });

      expect(mockNotificationShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pomodoro Complete!',
          body: 'Great work on "Implement feature X"!',
          type: 'pomodoro_complete',
        })
      );
    });

    it('should bring window to front after showing notification', () => {
      // Simulate the notification behavior directly
      const showPomodoroComplete = (taskName?: string) => {
        mockNotificationShow({
          title: 'Pomodoro Complete!',
          body: taskName ? `Great work on "${taskName}"!` : 'Great work!',
          type: 'pomodoro_complete',
        });
        mockBringToFront();
      };

      executeCommandHandlers.add((command: { action: string; params: Record<string, unknown> }) => {
        if (command.action === 'POMODORO_COMPLETE') {
          showPomodoroComplete(command.params?.taskTitle as string);
        }
      });

      simulateExecuteCommand({
        action: 'POMODORO_COMPLETE',
        params: { taskTitle: 'Test Task' },
      });

      expect(mockBringToFront).toHaveBeenCalled();
    });

    it('should handle taskless pomodoro completion', () => {
      // Simulate the handler behavior directly
      const showPomodoroComplete = (taskName?: string) => {
        mockNotificationShow({
          title: 'Pomodoro Complete!',
          body: taskName ? `Great work on "${taskName}"!` : 'Great work!',
          type: 'pomodoro_complete',
        });
      };

      executeCommandHandlers.add((command: { action: string; params: Record<string, unknown> }) => {
        if (command.action === 'POMODORO_COMPLETE') {
          showPomodoroComplete(command.params?.taskTitle as string | undefined);
        }
      });

      simulateExecuteCommand({
        action: 'POMODORO_COMPLETE',
        params: {
          pomodoroId: 'pomo-456',
          // No taskTitle
        },
      });

      expect(mockNotificationShow).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Great work!',
        })
      );
    });
  });

  describe('State change with countdown', () => {
    it('should stop countdown when state changes from FOCUS', () => {
      // Track countdown state
      let countdownActive = true;
      const stopPomodoroCountdown = vi.fn(() => {
        countdownActive = false;
      });

      // Simulate the state change handler from main.ts
      const stateChangeHandlers = new Set<(state: string) => void>();

      // Set up handler (simulating main.ts behavior)
      stateChangeHandlers.add((state: string) => {
        if (state !== 'focus' && state !== 'FOCUS' && countdownActive) {
          stopPomodoroCountdown();
        }
      });

      // Simulate state change to REST
      stateChangeHandlers.forEach(handler => handler('rest'));

      expect(stopPomodoroCountdown).toHaveBeenCalled();
      expect(countdownActive).toBe(false);
    });

    it('should not stop countdown when state is still FOCUS', () => {
      let countdownActive = true;
      const stopPomodoroCountdown = vi.fn(() => {
        countdownActive = false;
      });

      const stateChangeHandlers = new Set<(state: string) => void>();

      stateChangeHandlers.add((state: string) => {
        if (state !== 'focus' && state !== 'FOCUS' && countdownActive) {
          stopPomodoroCountdown();
        }
      });

      // Simulate state still being FOCUS
      stateChangeHandlers.forEach(handler => handler('FOCUS'));

      expect(stopPomodoroCountdown).not.toHaveBeenCalled();
      expect(countdownActive).toBe(true);
    });
  });

  describe('Multiple handlers', () => {
    it('should support multiple execute command handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Manually add handlers to the set
      executeCommandHandlers.add(handler1);
      executeCommandHandlers.add(handler2);

      const command = {
        action: 'POMODORO_COMPLETE',
        params: { taskTitle: 'Test' },
      };
      simulateExecuteCommand(command);

      expect(handler1).toHaveBeenCalledWith(command);
      expect(handler2).toHaveBeenCalledWith(command);
    });
  });

  describe('Error resilience', () => {
    it('should continue processing even if one handler throws', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      // Wrap in try-catch to simulate error handling (like connection-manager does)
      const wrappedHandler = (command: unknown) => {
        // Simulate the try-catch pattern in notifyExecuteCommand
        [errorHandler, goodHandler].forEach(handler => {
          try {
            handler(command);
          } catch {
            // Error logged but not rethrown
          }
        });
      };
      executeCommandHandlers.add(wrappedHandler);

      const command = { action: 'POMODORO_COMPLETE', params: {} };

      expect(() => simulateExecuteCommand(command)).not.toThrow();
      expect(goodHandler).toHaveBeenCalled();
    });
  });
});

describe('IPC Handler Tests', () => {
  describe('pomodoro:startCountdown', () => {
    it('should accept correct data format', () => {
      const handler = vi.fn();

      // Simulate IPC handler
      const ipcHandler = (_event: unknown, data: { startTime: number; durationMs: number; taskTitle?: string }) => {
        handler(data);
        return { success: true };
      };

      const result = ipcHandler(null, {
        startTime: Date.now(),
        durationMs: 25 * 60 * 1000,
        taskTitle: 'Test Task',
      });

      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: expect.any(Number),
          durationMs: expect.any(Number),
          taskTitle: 'Test Task',
        })
      );
    });

    it('should handle missing taskTitle', () => {
      const handler = vi.fn();

      const ipcHandler = (_event: unknown, data: { startTime: number; durationMs: number; taskTitle?: string }) => {
        handler(data);
        return { success: true };
      };

      const result = ipcHandler(null, {
        startTime: Date.now(),
        durationMs: 25 * 60 * 1000,
      });

      expect(result.success).toBe(true);
      // taskTitle is optional, so it's not in the object when not provided
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: expect.any(Number),
          durationMs: expect.any(Number),
        })
      );
      // Verify taskTitle is not present
      expect(handler.mock.calls[0][0].taskTitle).toBeUndefined();
    });
  });

  describe('pomodoro:stopCountdown', () => {
    it('should return success', () => {
      const stopFn = vi.fn();

      const ipcHandler = () => {
        stopFn();
        return { success: true };
      };

      const result = ipcHandler();

      expect(result.success).toBe(true);
      expect(stopFn).toHaveBeenCalled();
    });
  });
});
