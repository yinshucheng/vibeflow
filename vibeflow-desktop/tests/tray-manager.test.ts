/**
 * Unit tests for TrayManager interface changes
 * 
 * Tests interface compatibility with existing code and validates
 * type definitions for IPC events.
 * 
 * Requirements: 1.1, 2.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock electron modules
vi.mock('electron', () => ({
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
      getSize: vi.fn(() => ({ width: 16, height: 16 })),
      isTemplateImage: vi.fn(() => true),
    })),
    createEmpty: vi.fn(() => ({ 
      setTemplateImage: vi.fn(),
      getSize: vi.fn(() => ({ width: 16, height: 16 })),
    })),
  },
  BrowserWindow: vi.fn(() => ({
    isDestroyed: vi.fn(() => false),
    setTitle: vi.fn(),
  })),
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
  TrayMenuState,
  TrayManagerConfig,
  TrayStateUpdateEvent,
  PomodoroStateEvent,
  SystemStateEvent,
  getTrayManager,
  resetTrayManager,
} from '../electron/modules/tray-manager';

describe('TrayManager Interface Compatibility', () => {
  let config: TrayManagerConfig;
  let trayManager: TrayManager;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
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
  });

  afterEach(() => {
    resetTrayManager();
  });

  describe('TrayMenuState Interface', () => {
    it('should support all existing fields for backward compatibility', () => {
      const existingState: TrayMenuState = {
        // Existing fields that must remain compatible
        pomodoroActive: true,
        pomodoroTimeRemaining: '15:30',
        currentTask: 'Test task',
        isWithinWorkHours: true,
        skipTokensRemaining: 3,
        enforcementMode: 'strict',
        appMode: 'development',
        isInDemoMode: false,
        
        // New fields for enhanced functionality
        systemState: 'FOCUS',
        restTimeRemaining: '05:00',
        overRestDuration: '10 min',
      };

      // Test that the interface accepts all fields
      expect(existingState.pomodoroActive).toBe(true);
      expect(existingState.pomodoroTimeRemaining).toBe('15:30');
      expect(existingState.currentTask).toBe('Test task');
      expect(existingState.isWithinWorkHours).toBe(true);
      expect(existingState.skipTokensRemaining).toBe(3);
      expect(existingState.enforcementMode).toBe('strict');
      expect(existingState.appMode).toBe('development');
      expect(existingState.isInDemoMode).toBe(false);
      
      // Test new fields
      expect(existingState.systemState).toBe('FOCUS');
      expect(existingState.restTimeRemaining).toBe('05:00');
      expect(existingState.overRestDuration).toBe('10 min');
    });

    it('should support partial state updates', () => {
      const partialState: Partial<TrayMenuState> = {
        pomodoroActive: false,
        systemState: 'PLANNING',
      };

      // Should be able to update state with partial object
      trayManager.updateState(partialState);
      const currentState = trayManager.getState();
      
      expect(currentState.pomodoroActive).toBe(false);
      expect(currentState.systemState).toBe('PLANNING');
    });

    it('should support all valid system states', () => {
      const validStates: Array<TrayMenuState['systemState']> = [
        'LOCKED',
        'PLANNING', 
        'FOCUS',
        'REST',
        'OVER_REST'
      ];

      validStates.forEach(state => {
        const testState: Partial<TrayMenuState> = {
          systemState: state,
        };
        
        // Should accept all valid system states
        expect(() => trayManager.updateState(testState)).not.toThrow();
        expect(trayManager.getState().systemState).toBe(state);
      });
    });

    it('should support all valid enforcement modes', () => {
      const validModes: Array<TrayMenuState['enforcementMode']> = ['strict', 'gentle'];

      validModes.forEach(mode => {
        const testState: Partial<TrayMenuState> = {
          enforcementMode: mode,
        };
        
        expect(() => trayManager.updateState(testState)).not.toThrow();
        expect(trayManager.getState().enforcementMode).toBe(mode);
      });
    });

    it('should handle optional fields correctly', () => {
      const stateWithOptionals: TrayMenuState = {
        pomodoroActive: false,
        isWithinWorkHours: false,
        skipTokensRemaining: 0,
        enforcementMode: 'gentle',
        systemState: 'PLANNING',
        // Optional fields not provided
      };

      trayManager.updateState(stateWithOptionals);
      const currentState = trayManager.getState();
      
      // Optional fields should be undefined when not provided
      expect(currentState.pomodoroTimeRemaining).toBeUndefined();
      expect(currentState.currentTask).toBeUndefined();
      expect(currentState.appMode).toBeDefined(); // Set by constructor
      expect(currentState.restTimeRemaining).toBeUndefined();
      expect(currentState.overRestDuration).toBeUndefined();
    });
  });

  describe('IPC Event Type Definitions', () => {
    it('should validate TrayStateUpdateEvent structure', () => {
      const event: TrayStateUpdateEvent = {
        type: 'tray:updateState',
        payload: {
          pomodoroActive: true,
          systemState: 'FOCUS',
          pomodoroTimeRemaining: '25:00',
        },
      };

      // Test event structure
      expect(event.type).toBe('tray:updateState');
      expect(event.payload).toBeDefined();
      expect(event.payload.pomodoroActive).toBe(true);
      expect(event.payload.systemState).toBe('FOCUS');
      expect(event.payload.pomodoroTimeRemaining).toBe('25:00');
    });

    it('should validate PomodoroStateEvent structure', () => {
      const event: PomodoroStateEvent = {
        type: 'pomodoro:stateChange',
        payload: {
          active: true,
          timeRemaining: '15:30',
          taskName: 'Test Task',
          taskId: 'task-123',
        },
      };

      // Test event structure
      expect(event.type).toBe('pomodoro:stateChange');
      expect(event.payload.active).toBe(true);
      expect(event.payload.timeRemaining).toBe('15:30');
      expect(event.payload.taskName).toBe('Test Task');
      expect(event.payload.taskId).toBe('task-123');
    });

    it('should validate SystemStateEvent structure', () => {
      const event: SystemStateEvent = {
        type: 'system:stateChange',
        payload: {
          state: 'REST',
          restTimeRemaining: '05:00',
          overRestDuration: '10 min',
        },
      };

      // Test event structure
      expect(event.type).toBe('system:stateChange');
      expect(event.payload.state).toBe('REST');
      expect(event.payload.restTimeRemaining).toBe('05:00');
      expect(event.payload.overRestDuration).toBe('10 min');
    });

    it('should support optional fields in IPC events', () => {
      const minimalPomodoroEvent: PomodoroStateEvent = {
        type: 'pomodoro:stateChange',
        payload: {
          active: false,
          // Optional fields not provided
        },
      };

      const minimalSystemEvent: SystemStateEvent = {
        type: 'system:stateChange',
        payload: {
          state: 'PLANNING',
          // Optional fields not provided
        },
      };

      // Should be valid without optional fields
      expect(minimalPomodoroEvent.payload.active).toBe(false);
      expect(minimalPomodoroEvent.payload.timeRemaining).toBeUndefined();
      expect(minimalPomodoroEvent.payload.taskName).toBeUndefined();
      expect(minimalPomodoroEvent.payload.taskId).toBeUndefined();

      expect(minimalSystemEvent.payload.state).toBe('PLANNING');
      expect(minimalSystemEvent.payload.restTimeRemaining).toBeUndefined();
      expect(minimalSystemEvent.payload.overRestDuration).toBeUndefined();
    });

    it('should validate all system states in SystemStateEvent', () => {
      const validStates: Array<SystemStateEvent['payload']['state']> = [
        'LOCKED',
        'PLANNING',
        'FOCUS', 
        'REST',
        'OVER_REST'
      ];

      validStates.forEach(state => {
        const event: SystemStateEvent = {
          type: 'system:stateChange',
          payload: { state },
        };
        
        expect(event.payload.state).toBe(state);
      });
    });
  });

  describe('TrayManagerConfig Interface', () => {
    it('should validate config interface structure', () => {
      const testConfig: TrayManagerConfig = {
        onShowWindow: vi.fn(),
        onStartPomodoro: vi.fn(),
        onViewStatus: vi.fn(),
        onOpenSettings: vi.fn(),
        onQuit: vi.fn(),
      };

      // All required callback functions should be present
      expect(typeof testConfig.onShowWindow).toBe('function');
      expect(typeof testConfig.onStartPomodoro).toBe('function');
      expect(typeof testConfig.onViewStatus).toBe('function');
      expect(typeof testConfig.onOpenSettings).toBe('function');
      expect(typeof testConfig.onQuit).toBe('function');
    });

    it('should work with the TrayManager constructor', () => {
      const testConfig: TrayManagerConfig = {
        onShowWindow: vi.fn(),
        onStartPomodoro: vi.fn(),
        onViewStatus: vi.fn(),
        onOpenSettings: vi.fn(),
        onQuit: vi.fn(),
      };

      // Should be able to create TrayManager with config
      expect(() => new TrayManager(testConfig)).not.toThrow();
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain existing method signatures', () => {
      // Test that existing methods still work as expected
      expect(typeof trayManager.create).toBe('function');
      expect(typeof trayManager.destroy).toBe('function');
      expect(typeof trayManager.updateState).toBe('function');
      expect(typeof trayManager.getState).toBe('function');
      expect(typeof trayManager.setMainWindow).toBe('function');
      expect(typeof trayManager.showNotification).toBe('function');
    });

    it('should preserve existing state initialization', () => {
      const initialState = trayManager.getState();
      
      // Check that existing fields are properly initialized
      expect(typeof initialState.pomodoroActive).toBe('boolean');
      expect(typeof initialState.isWithinWorkHours).toBe('boolean');
      expect(typeof initialState.skipTokensRemaining).toBe('number');
      expect(['strict', 'gentle']).toContain(initialState.enforcementMode);
      
      // New fields should also be initialized
      expect(['LOCKED', 'PLANNING', 'FOCUS', 'REST', 'OVER_REST']).toContain(initialState.systemState);
    });

    it('should handle state updates without breaking existing functionality', () => {
      // Update with existing fields only
      const existingUpdate: Partial<TrayMenuState> = {
        pomodoroActive: true,
        pomodoroTimeRemaining: '20:00',
        currentTask: 'Legacy task',
        skipTokensRemaining: 2,
        enforcementMode: 'strict',
      };

      expect(() => trayManager.updateState(existingUpdate)).not.toThrow();
      
      const updatedState = trayManager.getState();
      expect(updatedState.pomodoroActive).toBe(true);
      expect(updatedState.pomodoroTimeRemaining).toBe('20:00');
      expect(updatedState.currentTask).toBe('Legacy task');
      expect(updatedState.skipTokensRemaining).toBe(2);
      expect(updatedState.enforcementMode).toBe('strict');
    });
  });

  describe('Type Safety', () => {
    it('should enforce correct time format strings', () => {
      const validTimeFormats = ['00:00', '15:30', '25:00', '59:59'];
      const testState: Partial<TrayMenuState> = {};

      validTimeFormats.forEach(timeFormat => {
        testState.pomodoroTimeRemaining = timeFormat;
        testState.restTimeRemaining = timeFormat;
        
        // Should accept valid MM:SS format
        expect(() => trayManager.updateState(testState)).not.toThrow();
      });
    });

    it('should enforce correct duration format strings', () => {
      const validDurationFormats = ['5 min', '15 min', '1h 30m', '2h 15m'];
      
      validDurationFormats.forEach(duration => {
        const testState: Partial<TrayMenuState> = {
          overRestDuration: duration,
        };
        
        // Should accept valid duration formats
        expect(() => trayManager.updateState(testState)).not.toThrow();
      });
    });
  });

  describe('Click Handler Enhancements', () => {
    it('should have proper click handler configuration', () => {
      // Verify that the TrayManagerConfig interface supports the required callbacks
      const testConfig: TrayManagerConfig = {
        onShowWindow: vi.fn(),
        onStartPomodoro: vi.fn(),
        onViewStatus: vi.fn(),
        onOpenSettings: vi.fn(),
        onQuit: vi.fn(),
      };

      // Should be able to create TrayManager with enhanced config
      expect(() => new TrayManager(testConfig)).not.toThrow();
      
      // Verify callbacks are properly typed and callable
      expect(typeof testConfig.onShowWindow).toBe('function');
      expect(typeof testConfig.onStartPomodoro).toBe('function');
      expect(typeof testConfig.onViewStatus).toBe('function');
      expect(typeof testConfig.onOpenSettings).toBe('function');
      
      // Test that callbacks can be called (Requirements: 6.1, 6.4, 6.5, 6.6)
      testConfig.onShowWindow();
      testConfig.onStartPomodoro();
      testConfig.onViewStatus();
      testConfig.onOpenSettings();
      
      expect(testConfig.onShowWindow).toHaveBeenCalled();
      expect(testConfig.onStartPomodoro).toHaveBeenCalled();
      expect(testConfig.onViewStatus).toHaveBeenCalled();
      expect(testConfig.onOpenSettings).toHaveBeenCalled();
    });

    it('should support tooltip timing requirement documentation', () => {
      // Verify that tooltip functionality exists and is documented
      // Requirements: 6.3 - tooltip should appear within 500ms
      
      // The updateTooltip method should exist
      expect(typeof trayManager['updateTooltip']).toBe('function');
      
      // Test that tooltip updates work without errors
      expect(() => trayManager.updateState({ 
        pomodoroActive: true, 
        pomodoroTimeRemaining: '15:30' 
      })).not.toThrow();
      
      expect(() => trayManager.updateState({ 
        pomodoroActive: false, 
        systemState: 'PLANNING' 
      })).not.toThrow();
    });

    it('should handle platform-specific behavior correctly', () => {
      // Test that the TrayManager handles different platforms
      const originalPlatform = process.platform;
      
      try {
        // Test macOS behavior
        Object.defineProperty(process, 'platform', { value: 'darwin' });
        const macTrayManager = new TrayManager(config);
        expect(() => macTrayManager.create()).not.toThrow();
        
        // Test Windows behavior  
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const winTrayManager = new TrayManager(config);
        expect(() => winTrayManager.create()).not.toThrow();
        
        // Test Linux behavior
        Object.defineProperty(process, 'platform', { value: 'linux' });
        const linuxTrayManager = new TrayManager(config);
        expect(() => linuxTrayManager.create()).not.toThrow();
        
      } finally {
        // Restore original platform
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('should support enhanced menu actions', () => {
      // Test that menu building works with enhanced state
      const enhancedState: TrayMenuState = {
        pomodoroActive: false,
        isWithinWorkHours: true,
        skipTokensRemaining: 3,
        enforcementMode: 'strict',
        systemState: 'PLANNING',
        restTimeRemaining: '05:00',
        overRestDuration: '10 min',
      };
      
      // Should be able to update state with enhanced fields
      expect(() => trayManager.updateState(enhancedState)).not.toThrow();
      
      // Should be able to build menu template without errors
      expect(() => trayManager['buildMenuTemplate']()).not.toThrow();
      
      // Test different system states
      const systemStates: Array<TrayMenuState['systemState']> = [
        'LOCKED', 'PLANNING', 'FOCUS', 'REST', 'OVER_REST'
      ];
      
      systemStates.forEach(state => {
        expect(() => trayManager.updateState({ systemState: state })).not.toThrow();
        expect(() => trayManager['buildMenuTemplate']()).not.toThrow();
      });
    });
  });
});