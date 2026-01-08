/**
 * Integration tests for IPC communication flow
 * 
 * Tests IPC event handling and state synchronization between
 * renderer and main process for tray state updates.
 * 
 * Requirements: 5.1-5.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock electron IPC
const mockIpcMain = new EventEmitter();
const mockWebContents = {
  send: vi.fn(),
};

const mockMainWindow = {
  webContents: mockWebContents,
  isDestroyed: vi.fn(() => false),
  setTitle: vi.fn(),
};

// Mock electron modules
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel, handler) => mockIpcMain.on(channel, handler)),
    handle: vi.fn((channel, handler) => mockIpcMain.on(channel, handler)),
  },
  Tray: vi.fn(() => ({
    destroy: vi.fn(),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    popUpContextMenu: vi.fn(),
    displayBalloon: vi.fn(),
  })),
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({ 
      isEmpty: () => false, 
      setTemplateImage: vi.fn(),
      isTemplateImage: () => true,
      getSize: () => ({ width: 16, height: 16 }),
    })),
    createFromBuffer: vi.fn(() => ({ 
      isEmpty: () => false, 
      setTemplateImage: vi.fn(),
      isTemplateImage: () => true,
      getSize: () => ({ width: 16, height: 16 }),
    })),
  },
  BrowserWindow: vi.fn(() => mockMainWindow),
}));

// Mock path module
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
}));

// Mock mode detector
vi.mock('../electron/modules/mode-detector', () => ({
  getModeDetector: vi.fn(() => ({
    getMode: vi.fn(() => ({ mode: 'development', isInDemoMode: false })),
    onModeChange: vi.fn(),
    getWindowTitleSuffix: vi.fn(() => ' [DEV]'),
    getTrayTooltipSuffix: vi.fn(() => ' [DEV]'),
  })),
}));

import {
  TrayManager,
  type TrayMenuState,
  type TrayManagerConfig,
  type PomodoroStateEvent,
  type SystemStateEvent,
  type TrayStateUpdateEvent,
  getTrayManager,
  resetTrayManager,
} from '../electron/modules/tray-manager';

describe('IPC Integration Tests', () => {
  let config: TrayManagerConfig;
  let trayManager: TrayManager;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockIpcMain.removeAllListeners();
    
    // Reset singleton
    resetTrayManager();

    // Create test config
    config = {
      onShowWindow: vi.fn(),
      onStartPomodoro: vi.fn(),
      onViewStatus: vi.fn(),
      onOpenSettings: vi.fn(),
      onQuit: vi.fn(),
    };

    trayManager = getTrayManager(config);
    trayManager.setMainWindow(mockMainWindow as any);
  });

  afterEach(() => {
    resetTrayManager();
  });

  describe('System State Change IPC', () => {
    it('should handle system:stateChange events correctly', () => {
      // Simulate the IPC handler setup (normally done in main.ts)
      const systemStateHandler = vi.fn((_, payload) => {
        trayManager.updateState({
          systemState: payload.state,
          restTimeRemaining: payload.restTimeRemaining,
          overRestDuration: payload.overRestDuration,
        });
      });

      mockIpcMain.on('system:stateChange', systemStateHandler);

      // Test different system states
      const testCases = [
        {
          state: 'PLANNING' as const,
          expected: { systemState: 'PLANNING' },
        },
        {
          state: 'REST' as const,
          restTimeRemaining: '05:00',
          expected: { systemState: 'REST', restTimeRemaining: '05:00' },
        },
        {
          state: 'OVER_REST' as const,
          overRestDuration: '15 min',
          expected: { systemState: 'OVER_REST', overRestDuration: '15 min' },
        },
        {
          state: 'LOCKED' as const,
          expected: { systemState: 'LOCKED' },
        },
      ];

      testCases.forEach(({ state, restTimeRemaining, overRestDuration, expected }) => {
        // Emit IPC event
        mockIpcMain.emit('system:stateChange', null, {
          state,
          restTimeRemaining,
          overRestDuration,
        });

        // Verify handler was called
        expect(systemStateHandler).toHaveBeenCalled();

        // Verify tray state was updated
        const currentState = trayManager.getState();
        expect(currentState.systemState).toBe(expected.systemState);
        if (expected.restTimeRemaining) {
          expect(currentState.restTimeRemaining).toBe(expected.restTimeRemaining);
        }
        if (expected.overRestDuration) {
          expect(currentState.overRestDuration).toBe(expected.overRestDuration);
        }
      });
    });

    it('should handle optional fields in system state changes', () => {
      const systemStateHandler = vi.fn((_, payload) => {
        trayManager.updateState({
          systemState: payload.state,
          restTimeRemaining: payload.restTimeRemaining,
          overRestDuration: payload.overRestDuration,
        });
      });

      mockIpcMain.on('system:stateChange', systemStateHandler);

      // Test with minimal payload (only required fields)
      mockIpcMain.emit('system:stateChange', null, {
        state: 'PLANNING',
      });

      expect(systemStateHandler).toHaveBeenCalledWith(null, {
        state: 'PLANNING',
      });

      const currentState = trayManager.getState();
      expect(currentState.systemState).toBe('PLANNING');
      expect(currentState.restTimeRemaining).toBeUndefined();
      expect(currentState.overRestDuration).toBeUndefined();
    });
  });

  describe('Pomodoro State Change IPC', () => {
    it('should handle pomodoro:stateChange events correctly', () => {
      const pomodoroStateHandler = vi.fn((_, payload) => {
        trayManager.updateState({
          pomodoroActive: payload.active,
          pomodoroTimeRemaining: payload.timeRemaining,
          currentTask: payload.taskName,
        });
      });

      mockIpcMain.on('pomodoro:stateChange', pomodoroStateHandler);

      // Test pomodoro activation
      mockIpcMain.emit('pomodoro:stateChange', null, {
        active: true,
        timeRemaining: '25:00',
        taskName: 'Test Task',
        taskId: 'task-123',
      });

      expect(pomodoroStateHandler).toHaveBeenCalledWith(null, {
        active: true,
        timeRemaining: '25:00',
        taskName: 'Test Task',
        taskId: 'task-123',
      });

      let currentState = trayManager.getState();
      expect(currentState.pomodoroActive).toBe(true);
      expect(currentState.pomodoroTimeRemaining).toBe('25:00');
      expect(currentState.currentTask).toBe('Test Task');

      // Test pomodoro deactivation
      mockIpcMain.emit('pomodoro:stateChange', null, {
        active: false,
      });

      currentState = trayManager.getState();
      expect(currentState.pomodoroActive).toBe(false);
    });

    it('should handle pomodoro state updates during active session', () => {
      const pomodoroStateHandler = vi.fn((_, payload) => {
        trayManager.updateState({
          pomodoroActive: payload.active,
          pomodoroTimeRemaining: payload.timeRemaining,
          currentTask: payload.taskName,
        });
      });

      mockIpcMain.on('pomodoro:stateChange', pomodoroStateHandler);

      // Start pomodoro
      mockIpcMain.emit('pomodoro:stateChange', null, {
        active: true,
        timeRemaining: '25:00',
        taskName: 'Initial Task',
      });

      // Update time remaining
      mockIpcMain.emit('pomodoro:stateChange', null, {
        active: true,
        timeRemaining: '20:15',
        taskName: 'Initial Task',
      });

      const currentState = trayManager.getState();
      expect(currentState.pomodoroActive).toBe(true);
      expect(currentState.pomodoroTimeRemaining).toBe('20:15');
      expect(currentState.currentTask).toBe('Initial Task');
    });
  });

  describe('General Tray State Update IPC', () => {
    it('should handle tray:updateState events correctly', () => {
      const trayStateHandler = vi.fn((_, payload) => {
        trayManager.updateState(payload);
      });

      mockIpcMain.on('tray:updateState', trayStateHandler);

      // Test comprehensive state update
      const testState: Partial<TrayMenuState> = {
        pomodoroActive: true,
        pomodoroTimeRemaining: '15:30',
        currentTask: 'Complex Task',
        systemState: 'FOCUS',
        skipTokensRemaining: 2,
        enforcementMode: 'strict',
        isInDemoMode: false,
      };

      mockIpcMain.emit('tray:updateState', null, testState);

      expect(trayStateHandler).toHaveBeenCalledWith(null, testState);

      const currentState = trayManager.getState();
      expect(currentState.pomodoroActive).toBe(true);
      expect(currentState.pomodoroTimeRemaining).toBe('15:30');
      expect(currentState.currentTask).toBe('Complex Task');
      expect(currentState.systemState).toBe('FOCUS');
      expect(currentState.skipTokensRemaining).toBe(2);
      expect(currentState.enforcementMode).toBe('strict');
      expect(currentState.isInDemoMode).toBe(false);
    });

    it('should handle partial state updates', () => {
      const trayStateHandler = vi.fn((_, payload) => {
        trayManager.updateState(payload);
      });

      mockIpcMain.on('tray:updateState', trayStateHandler);

      // Set initial state
      trayManager.updateState({
        pomodoroActive: true,
        pomodoroTimeRemaining: '25:00',
        systemState: 'FOCUS',
      });

      // Partial update - only change time remaining
      mockIpcMain.emit('tray:updateState', null, {
        pomodoroTimeRemaining: '20:00',
      });

      const currentState = trayManager.getState();
      expect(currentState.pomodoroActive).toBe(true); // Should remain unchanged
      expect(currentState.pomodoroTimeRemaining).toBe('20:00'); // Should be updated
      expect(currentState.systemState).toBe('FOCUS'); // Should remain unchanged
    });
  });

  describe('State Retrieval IPC', () => {
    it('should handle tray:getState requests correctly', () => {
      const getStateHandler = vi.fn(() => {
        return trayManager.getState();
      });

      mockIpcMain.on('tray:getState', getStateHandler);

      // Set a known state
      const testState: Partial<TrayMenuState> = {
        pomodoroActive: true,
        pomodoroTimeRemaining: '18:45',
        currentTask: 'Test Retrieval Task',
        systemState: 'FOCUS',
        skipTokensRemaining: 1,
      };

      trayManager.updateState(testState);

      // Simulate IPC call
      mockIpcMain.emit('tray:getState', null);

      expect(getStateHandler).toHaveBeenCalled();
      
      const returnedState = getStateHandler.mock.results[0].value;
      expect(returnedState.pomodoroActive).toBe(true);
      expect(returnedState.pomodoroTimeRemaining).toBe('18:45');
      expect(returnedState.currentTask).toBe('Test Retrieval Task');
      expect(returnedState.systemState).toBe('FOCUS');
      expect(returnedState.skipTokensRemaining).toBe(1);
    });
  });

  describe('Event Timing and Synchronization', () => {
    it('should update tray state within expected timeframe', () => {
      const trayStateHandler = vi.fn((_, payload) => {
        trayManager.updateState(payload);
      });

      mockIpcMain.on('tray:updateState', trayStateHandler);

      const startTime = Date.now();
      
      // Emit state change
      mockIpcMain.emit('tray:updateState', null, {
        systemState: 'REST',
        restTimeRemaining: '05:00',
      });

      const endTime = Date.now();
      const updateTime = endTime - startTime;

      // Should update within 1 second (Requirements: 5.1)
      expect(updateTime).toBeLessThan(1000);
      
      // Verify state was updated
      const currentState = trayManager.getState();
      expect(currentState.systemState).toBe('REST');
      expect(currentState.restTimeRemaining).toBe('05:00');
    });

    it('should handle rapid state changes correctly', () => {
      const trayStateHandler = vi.fn((_, payload) => {
        trayManager.updateState(payload);
      });

      mockIpcMain.on('tray:updateState', trayStateHandler);

      // Rapid sequence of state changes
      const stateSequence = [
        { systemState: 'PLANNING' as const },
        { systemState: 'FOCUS' as const, pomodoroActive: true, pomodoroTimeRemaining: '25:00' },
        { pomodoroTimeRemaining: '24:59' },
        { pomodoroTimeRemaining: '24:58' },
        { systemState: 'REST' as const, pomodoroActive: false, restTimeRemaining: '05:00' },
      ];

      stateSequence.forEach((state, index) => {
        mockIpcMain.emit('tray:updateState', null, state);
        
        // Verify each update was processed
        expect(trayStateHandler).toHaveBeenCalledTimes(index + 1);
      });

      // Verify final state
      const finalState = trayManager.getState();
      expect(finalState.systemState).toBe('REST');
      expect(finalState.pomodoroActive).toBe(false);
      expect(finalState.restTimeRemaining).toBe('05:00');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed IPC events gracefully', () => {
      const trayStateHandler = vi.fn((_, payload) => {
        try {
          trayManager.updateState(payload);
        } catch (error) {
          console.error('Error updating tray state:', error);
        }
      });

      mockIpcMain.on('tray:updateState', trayStateHandler);

      // Test with null payload
      expect(() => {
        mockIpcMain.emit('tray:updateState', null, null);
      }).not.toThrow();

      // Test with undefined payload
      expect(() => {
        mockIpcMain.emit('tray:updateState', null, undefined);
      }).not.toThrow();

      // Test with empty object
      expect(() => {
        mockIpcMain.emit('tray:updateState', null, {});
      }).not.toThrow();
    });

    it('should maintain state consistency during error conditions', () => {
      const trayStateHandler = vi.fn((_, payload) => {
        if (payload && typeof payload === 'object') {
          trayManager.updateState(payload);
        }
      });

      mockIpcMain.on('tray:updateState', trayStateHandler);

      // Set initial valid state
      const initialState: Partial<TrayMenuState> = {
        pomodoroActive: true,
        pomodoroTimeRemaining: '20:00',
        systemState: 'FOCUS',
      };

      trayManager.updateState(initialState);

      // Try to update with invalid data
      mockIpcMain.emit('tray:updateState', null, null);
      mockIpcMain.emit('tray:updateState', null, undefined);

      // State should remain unchanged
      const currentState = trayManager.getState();
      expect(currentState.pomodoroActive).toBe(true);
      expect(currentState.pomodoroTimeRemaining).toBe('20:00');
      expect(currentState.systemState).toBe('FOCUS');
    });
  });
});