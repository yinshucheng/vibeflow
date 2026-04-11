/**
 * Tray Integration Service Tests
 * 
 * Unit tests for the TrayIntegrationService.
 * Requirements: 1.7, 8.7, 5.1-5.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrayIntegrationService } from './tray-integration.service';

// Mock the window.vibeflow API
const mockTrayUpdate = vi.fn();
const mockWindow = {
  vibeflow: {
    platform: {
      isElectron: true,
    },
    tray: {
      updateMenu: mockTrayUpdate,
    },
  },
};

// Mock global window
Object.defineProperty(global, 'window', {
  value: mockWindow,
  writable: true,
});

describe('TrayIntegrationService', () => {
  let service: TrayIntegrationService;

  beforeEach(() => {
    service = new TrayIntegrationService();
    mockTrayUpdate.mockClear();
  });

  describe('updatePomodoroState', () => {
    it('should format time correctly for active pomodoro', () => {
      const startTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const pomodoro = {
        id: 'test-id',
        taskId: 'task-id',
        duration: 25, // 25 minutes
        startTime,
        task: { title: 'Test Task' },
      };

      service.updatePomodoroState(pomodoro);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        pomodoroActive: true,
        pomodoroTimeRemaining: '20:00', // 25 - 5 = 20 minutes remaining
        currentTask: 'Test Task',
        systemState: 'FOCUS',
      });
    });

    it('should handle null pomodoro state', () => {
      service.updatePomodoroState(null);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        pomodoroActive: false,
        pomodoroTimeRemaining: undefined,
        currentTask: undefined,
      });
    });

    it('should handle pomodoro with no task title', () => {
      const startTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const pomodoro = {
        id: 'test-id',
        taskId: null,
        duration: 25,
        startTime,
      };

      service.updatePomodoroState(pomodoro);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        pomodoroActive: true,
        pomodoroTimeRemaining: '15:00', // 25 - 10 = 15 minutes remaining
        currentTask: undefined,
        systemState: 'FOCUS',
      });
    });

    it('should handle expired pomodoro', () => {
      const startTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const pomodoro = {
        id: 'test-id',
        taskId: 'task-id',
        duration: 25, // 25 minutes duration
        startTime,
        task: { title: 'Test Task' },
      };

      service.updatePomodoroState(pomodoro);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        pomodoroActive: true,
        pomodoroTimeRemaining: '00:00', // Expired, should show 00:00
        currentTask: 'Test Task',
        systemState: 'FOCUS',
      });
    });
  });

  describe('updateSystemState', () => {
    it('should handle IDLE state without recent pomodoro as READY', () => {
      service.updateSystemState('idle');

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        systemState: 'READY',
        restTimeRemaining: undefined,
        overRestDuration: undefined,
      });
    });

    it('should handle IDLE state with recent pomodoro as RESTING', () => {
      const recentEndTime = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      service.updateSystemState('idle', undefined, undefined, undefined, recentEndTime);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        systemState: 'RESTING',
        restTimeRemaining: undefined,
        overRestDuration: undefined,
      });
    });

    it('should handle IDLE state with old pomodoro as READY', () => {
      const oldEndTime = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
      service.updateSystemState('idle', undefined, undefined, undefined, oldEndTime);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        systemState: 'READY',
        restTimeRemaining: undefined,
        overRestDuration: undefined,
      });
    });

    it('should handle OVER_REST state with duration', () => {
      const overRestStartTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const restData = {
        startTime: overRestStartTime,
        duration: 5,
        isOverRest: true,
      };

      service.updateSystemState('over_rest', restData);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        systemState: 'OVER_REST',
        restTimeRemaining: undefined,
        overRestDuration: '10 min', // 10 minutes over rest
      });
    });
  });

  describe('updateUserSettings', () => {
    it('should update enforcement mode and skip tokens', () => {
      const settings = {
        enforcementMode: 'gentle' as const,
        skipTokensRemaining: 3,
        isInDemoMode: false,
      };

      service.updateUserSettings(settings);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        enforcementMode: 'gentle',
        skipTokensRemaining: 3,
        isInDemoMode: false,
      });
    });
  });

  describe('syncCompleteState', () => {
    it('should sync complete state with all data', () => {
      const startTime = new Date(Date.now() - 5 * 60 * 1000);
      const data = {
        pomodoro: {
          id: 'test-id',
          taskId: 'task-id',
          duration: 25,
          startTime,
          task: { title: 'Test Task' },
        },
        systemState: 'focus' as const,
        settings: {
          enforcementMode: 'strict' as const,
          skipTokensRemaining: 2,
          isInDemoMode: true,
        },
      };

      service.syncCompleteState(data);

      expect(mockTrayUpdate).toHaveBeenCalledWith({
        systemState: 'FOCUS',
        enforcementMode: 'strict',
        skipTokensRemaining: 2,
        isInDemoMode: true,
        pomodoroActive: true,
        pomodoroTimeRemaining: '20:00',
        currentTask: 'Test Task',
      });
    });
  });

  describe('non-electron environment', () => {
    beforeEach(() => {
      // Mock non-electron environment
      Object.defineProperty(global, 'window', {
        value: {
          vibeflow: {
            platform: {
              isElectron: false,
            },
          },
        },
        writable: true,
      });
      service = new TrayIntegrationService();
      mockTrayUpdate.mockClear();
    });

    it('should not call tray update in non-electron environment', () => {
      service.updatePomodoroState(null);
      expect(mockTrayUpdate).not.toHaveBeenCalled();
    });
  });
});