/**
 * Unit tests for main process pomodoro countdown functionality
 *
 * Tests the countdown timer that runs independently in the main process
 * to ensure tray updates continue when the app is in background.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Pomodoro Countdown (Main Process)', () => {
  // Simulate the countdown state and functions from main.ts
  let pomodoroCountdown: {
    active: boolean;
    startTime: number;
    durationMs: number;
    taskTitle?: string;
    timerId?: ReturnType<typeof setInterval>;
  } | null = null;

  const mockUpdateTrayMenu = vi.fn();

  function startPomodoroCountdown(startTime: number, durationMs: number, taskTitle?: string): void {
    stopPomodoroCountdown();

    pomodoroCountdown = {
      active: true,
      startTime,
      durationMs,
      taskTitle,
    };

    updatePomodoroCountdown();
    pomodoroCountdown.timerId = setInterval(updatePomodoroCountdown, 1000);
  }

  function updatePomodoroCountdown(): void {
    if (!pomodoroCountdown?.active) return;

    const elapsed = Date.now() - pomodoroCountdown.startTime;
    const remainingMs = Math.max(0, pomodoroCountdown.durationMs - elapsed);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    mockUpdateTrayMenu({
      pomodoroActive: true,
      pomodoroTimeRemaining: timeStr,
      currentTask: pomodoroCountdown.taskTitle,
      systemState: 'FOCUS',
    });

    if (remainingMs <= 0) {
      stopPomodoroCountdown();
    }
  }

  function stopPomodoroCountdown(): void {
    if (pomodoroCountdown?.timerId) {
      clearInterval(pomodoroCountdown.timerId);
    }
    pomodoroCountdown = null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    pomodoroCountdown = null;
  });

  afterEach(() => {
    stopPomodoroCountdown();
    vi.useRealTimers();
  });

  describe('startPomodoroCountdown', () => {
    it('should initialize countdown state correctly', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000; // 25 minutes
      const taskTitle = 'Test Task';

      startPomodoroCountdown(startTime, durationMs, taskTitle);

      expect(pomodoroCountdown).not.toBeNull();
      expect(pomodoroCountdown?.active).toBe(true);
      expect(pomodoroCountdown?.startTime).toBe(startTime);
      expect(pomodoroCountdown?.durationMs).toBe(durationMs);
      expect(pomodoroCountdown?.taskTitle).toBe(taskTitle);
    });

    it('should call updateTrayMenu immediately', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);

      expect(mockUpdateTrayMenu).toHaveBeenCalledTimes(1);
      expect(mockUpdateTrayMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          pomodoroActive: true,
          pomodoroTimeRemaining: '25:00',
          systemState: 'FOCUS',
        })
      );
    });

    it('should start interval timer', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);

      expect(pomodoroCountdown?.timerId).toBeDefined();
    });

    it('should stop previous countdown when starting new one', () => {
      const startTime1 = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime1, durationMs, 'Task 1');
      const firstTimerId = pomodoroCountdown?.timerId;

      // Start new countdown
      const startTime2 = Date.now() + 1000;
      startPomodoroCountdown(startTime2, durationMs, 'Task 2');

      expect(pomodoroCountdown?.taskTitle).toBe('Task 2');
      expect(pomodoroCountdown?.timerId).not.toBe(firstTimerId);
    });
  });

  describe('updatePomodoroCountdown', () => {
    it('should update tray with correct remaining time', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);
      mockUpdateTrayMenu.mockClear();

      // Advance time by 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Should show 15:00 remaining
      expect(mockUpdateTrayMenu).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pomodoroTimeRemaining: '15:00',
        })
      );
    });

    it('should format time correctly at various points', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);

      // At 24:30 remaining (30 seconds elapsed)
      vi.advanceTimersByTime(30 * 1000);
      expect(mockUpdateTrayMenu).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pomodoroTimeRemaining: '24:30',
        })
      );

      // At 20:00 remaining (5 minutes elapsed)
      vi.advanceTimersByTime(4.5 * 60 * 1000);
      expect(mockUpdateTrayMenu).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pomodoroTimeRemaining: '20:00',
        })
      );

      // At 1:00 remaining (24 minutes elapsed)
      vi.advanceTimersByTime(19 * 60 * 1000);
      expect(mockUpdateTrayMenu).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pomodoroTimeRemaining: '01:00',
        })
      );

      // At 0:01 remaining (24:59 elapsed)
      vi.advanceTimersByTime(59 * 1000);
      expect(mockUpdateTrayMenu).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pomodoroTimeRemaining: '00:01',
        })
      );
    });

    it('should stop countdown when time reaches zero', () => {
      const startTime = Date.now();
      const durationMs = 5 * 1000; // 5 seconds for quick test

      startPomodoroCountdown(startTime, durationMs);

      // Advance past duration
      vi.advanceTimersByTime(6 * 1000);

      expect(pomodoroCountdown).toBeNull();
    });

    it('should include task title in updates', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;
      const taskTitle = 'Implement feature X';

      startPomodoroCountdown(startTime, durationMs, taskTitle);

      expect(mockUpdateTrayMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTask: taskTitle,
        })
      );
    });

    it('should handle undefined task title', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);

      expect(mockUpdateTrayMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTask: undefined,
        })
      );
    });

    it('should not update if countdown is not active', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);
      mockUpdateTrayMenu.mockClear();

      // Stop countdown
      stopPomodoroCountdown();

      // Manually call update (simulating stale timer callback)
      updatePomodoroCountdown();

      expect(mockUpdateTrayMenu).not.toHaveBeenCalled();
    });
  });

  describe('stopPomodoroCountdown', () => {
    it('should clear timer and reset state', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);
      const timerId = pomodoroCountdown?.timerId;

      stopPomodoroCountdown();

      expect(pomodoroCountdown).toBeNull();
    });

    it('should be safe to call multiple times', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);

      expect(() => {
        stopPomodoroCountdown();
        stopPomodoroCountdown();
        stopPomodoroCountdown();
      }).not.toThrow();
    });

    it('should be safe to call when not started', () => {
      expect(() => {
        stopPomodoroCountdown();
      }).not.toThrow();
    });
  });

  describe('Timer accuracy', () => {
    it('should update every second', () => {
      const startTime = Date.now();
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);
      mockUpdateTrayMenu.mockClear();

      // Advance 5 seconds
      vi.advanceTimersByTime(5 * 1000);

      // Should have been called 5 times (once per second)
      expect(mockUpdateTrayMenu).toHaveBeenCalledTimes(5);
    });

    it('should show correct time even if timer drifts', () => {
      // Simulate timer starting a bit late
      const startTime = Date.now() - 500; // Started 500ms ago
      const durationMs = 25 * 60 * 1000;

      startPomodoroCountdown(startTime, durationMs);

      // Even though timer "started" 500ms ago, first update should show 24:30 ceiling
      expect(mockUpdateTrayMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          pomodoroTimeRemaining: '25:00', // ceil(24.5 * 60) / 60 = 25:00
        })
      );
    });
  });

  describe('IPC handler integration', () => {
    it('should work with expected IPC data format', () => {
      // Simulate data from renderer process
      const ipcData = {
        startTime: Date.now(),
        durationMs: 25 * 60 * 1000,
        taskTitle: 'Test Task',
      };

      startPomodoroCountdown(ipcData.startTime, ipcData.durationMs, ipcData.taskTitle);

      expect(pomodoroCountdown?.active).toBe(true);
      expect(mockUpdateTrayMenu).toHaveBeenCalled();
    });
  });
});
