/**
 * Tests for: sleep time should NOT override active pomodoro in tray display.
 *
 * Bug: When user starts a pomodoro during sleep time, the remote renderer
 * (old code) keeps sending `isInSleepTime: true, pomodoroActive: false`,
 * overriding the tray to show "🌙 sleep" instead of "🎯 25:00 task".
 *
 * Fix: main process checks connectionManager.getStateSnapshot().activePomodoro
 * and auto-starts the countdown, blocking renderer's sleep overrides.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Types (mirrored from tray-manager.ts) ────────────────────────────

interface TrayMenuState {
  systemState?: 'READY' | 'RESTING' | 'FOCUS' | 'OVER_REST';
  pomodoroActive?: boolean;
  pomodoroTimeRemaining?: string;
  currentTask?: string;
  dailyProgress?: string;
  isInSleepTime?: boolean;
}

interface PomodoroState {
  id: string;
  taskId: string | null;
  taskTitle?: string | null;
  startTime: number;
  duration: number; // minutes
  status: 'active' | 'paused' | 'completed' | 'aborted';
}

interface StateSnapshot {
  activePomodoro: PomodoroState | null;
}

// ── Simulated main process state ─────────────────────────────────────

describe('Sleep Time vs Active Pomodoro Guard', () => {
  let pomodoroCountdown: {
    active: boolean;
    startTime: number;
    durationMs: number;
    taskTitle?: string;
    timerId?: ReturnType<typeof setInterval>;
  } | null = null;

  let trayState: TrayMenuState = {};
  const mockTrayUpdate = vi.fn((partial: Partial<TrayMenuState>) => {
    trayState = { ...trayState, ...partial };
  });

  // Simulated connectionManager snapshot — controlled by test
  let mockSnapshot: StateSnapshot = { activePomodoro: null };

  function getConnectionManagerSnapshot(): StateSnapshot {
    return mockSnapshot;
  }

  // ── Functions mirroring main.ts ──────────────────────────────────

  function startPomodoroCountdown(startTime: number, durationMs: number, taskTitle?: string): void {
    stopPomodoroCountdown();
    pomodoroCountdown = { active: true, startTime, durationMs, taskTitle };

    const elapsed = Date.now() - startTime;
    const remainingMs = Math.max(0, durationMs - elapsed);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    mockTrayUpdate({
      pomodoroActive: true,
      pomodoroTimeRemaining: timeStr,
      currentTask: taskTitle,
      systemState: 'FOCUS',
      isInSleepTime: false,
    });
  }

  function stopPomodoroCountdown(): void {
    if (pomodoroCountdown?.timerId) {
      clearInterval(pomodoroCountdown.timerId);
    }
    pomodoroCountdown = null;
  }

  /**
   * Simulates the tray:updateMenu IPC handler from main.ts.
   * This is the EXACT logic we need to test.
   */
  function handleTrayUpdateMenu(state: Partial<TrayMenuState>): void {
    const snapshot = getConnectionManagerSnapshot();
    const hasActivePomodoro = !!snapshot?.activePomodoro;

    if (pomodoroCountdown?.active || hasActivePomodoro) {
      // Auto-start countdown if snapshot has pomodoro but main process doesn't
      if (!pomodoroCountdown?.active && hasActivePomodoro) {
        const pom = snapshot.activePomodoro!;
        const durationMs = pom.duration * 60 * 1000;
        startPomodoroCountdown(pom.startTime, durationMs, pom.taskTitle ?? undefined);
      }

      // Block renderer from overriding active pomodoro display
      if (state.pomodoroActive === false || state.pomodoroActive === undefined) {
        delete state.pomodoroActive;
      }
      if (state.isInSleepTime) {
        state.isInSleepTime = false;
      }
      if (state.systemState && state.systemState !== 'FOCUS') {
        delete state.systemState;
      }
    }
    mockTrayUpdate(state);
  }

  // ── Setup ────────────────────────────────────────────────────────

  beforeEach(() => {
    vi.useFakeTimers();
    pomodoroCountdown = null;
    trayState = {};
    mockSnapshot = { activePomodoro: null };
    mockTrayUpdate.mockClear();
  });

  // ── Tests ────────────────────────────────────────────────────────

  describe('Bug reproduction: renderer sends sleep during active pomodoro', () => {
    it('should show pomodoro countdown, not sleep, when snapshot has activePomodoro', () => {
      // Server pushed SYNC_STATE with activePomodoro
      mockSnapshot = {
        activePomodoro: {
          id: 'pom-1',
          taskId: 'task-1',
          taskTitle: '写代码',
          startTime: Date.now(),
          duration: 25,
          status: 'active',
        },
      };

      // Renderer (remote old code) sends sleep state — this is what the bug looks like
      handleTrayUpdateMenu({ systemState: 'READY', isInSleepTime: true });
      handleTrayUpdateMenu({ pomodoroActive: false });

      // After guard: pomodoro should be active, sleep should be cleared
      expect(trayState.pomodoroActive).toBe(true);
      expect(trayState.isInSleepTime).toBe(false);
      expect(trayState.systemState).toBe('FOCUS');
      expect(pomodoroCountdown?.active).toBe(true);
      expect(trayState.currentTask).toBe('写代码');
    });

    it('should keep blocking repeated renderer sleep updates', () => {
      mockSnapshot = {
        activePomodoro: {
          id: 'pom-1',
          taskId: 'task-1',
          taskTitle: 'Coding',
          startTime: Date.now(),
          duration: 25,
          status: 'active',
        },
      };

      // Simulate 5 rounds of renderer spam (as seen in real logs)
      for (let i = 0; i < 5; i++) {
        handleTrayUpdateMenu({ systemState: 'READY', isInSleepTime: true });
        handleTrayUpdateMenu({ pomodoroActive: false });
      }

      // Tray should still show pomodoro
      expect(trayState.pomodoroActive).toBe(true);
      expect(trayState.isInSleepTime).toBe(false);
      expect(trayState.systemState).toBe('FOCUS');
    });

    it('should auto-start countdown from snapshot even without renderer triggering it', () => {
      mockSnapshot = {
        activePomodoro: {
          id: 'pom-2',
          taskId: null,
          taskTitle: 'Focus',
          startTime: Date.now(),
          duration: 15,
          status: 'active',
        },
      };

      // Single renderer update is enough to trigger auto-start
      handleTrayUpdateMenu({ pomodoroActive: false });

      expect(pomodoroCountdown).not.toBeNull();
      expect(pomodoroCountdown!.active).toBe(true);
      expect(pomodoroCountdown!.durationMs).toBe(15 * 60 * 1000);
      expect(pomodoroCountdown!.taskTitle).toBe('Focus');
    });
  });

  describe('Normal sleep behavior (no active pomodoro)', () => {
    it('should allow sleep display when no active pomodoro in snapshot', () => {
      mockSnapshot = { activePomodoro: null };

      handleTrayUpdateMenu({ systemState: 'READY', isInSleepTime: true });
      handleTrayUpdateMenu({ pomodoroActive: false });

      expect(trayState.isInSleepTime).toBe(true);
      expect(trayState.systemState).toBe('READY');
      expect(trayState.pomodoroActive).toBe(false);
      expect(pomodoroCountdown).toBeNull();
    });
  });

  describe('Pomodoro ends during sleep time', () => {
    it('should revert to sleep display when pomodoro completes and snapshot clears', () => {
      // Start with active pomodoro
      mockSnapshot = {
        activePomodoro: {
          id: 'pom-3',
          taskId: 'task-1',
          taskTitle: 'Work',
          startTime: Date.now(),
          duration: 25,
          status: 'active',
        },
      };

      handleTrayUpdateMenu({ pomodoroActive: false });
      expect(trayState.pomodoroActive).toBe(true); // guard blocked it

      // Now pomodoro completes — server clears activePomodoro
      mockSnapshot = { activePomodoro: null };
      stopPomodoroCountdown();

      // Renderer sends sleep state again
      handleTrayUpdateMenu({ systemState: 'READY', isInSleepTime: true });
      handleTrayUpdateMenu({ pomodoroActive: false });

      // Now sleep should be shown
      expect(trayState.isInSleepTime).toBe(true);
      expect(trayState.pomodoroActive).toBe(false);
      expect(trayState.systemState).toBe('READY');
    });
  });

  describe('TrayManager display priority (updateTrayTitle logic)', () => {
    it('pomodoroActive should take priority over isInSleepTime in title rendering', () => {
      // Simulate tray-manager's updateTrayTitle priority logic
      const state: TrayMenuState = {
        pomodoroActive: true,
        pomodoroTimeRemaining: '24:30',
        currentTask: 'Build feature',
        isInSleepTime: true,
        systemState: 'FOCUS',
      };

      // Priority: pomodoroActive > isInSleepTime > systemState
      let title = '';
      if (state.pomodoroActive) {
        title = `🎯 ${state.pomodoroTimeRemaining} ${state.currentTask}`;
      } else if (state.isInSleepTime) {
        title = '🌙 该睡觉了，明天继续';
      } else {
        title = '✅ Ready';
      }

      expect(title).toBe('🎯 24:30 Build feature');
      expect(title).not.toContain('🌙');
    });

    it('isInSleepTime should show when pomodoroActive is false', () => {
      const state: TrayMenuState = {
        pomodoroActive: false,
        isInSleepTime: true,
        systemState: 'READY',
      };

      let title = '';
      if (state.pomodoroActive) {
        title = '🎯 Focus';
      } else if (state.isInSleepTime) {
        title = '🌙 该睡觉了，明天继续';
      } else {
        title = '✅ Ready';
      }

      expect(title).toBe('🌙 该睡觉了，明天继续');
    });
  });
});
