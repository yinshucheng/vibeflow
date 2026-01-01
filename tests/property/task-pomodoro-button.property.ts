import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

/**
 * Feature: pomodoro-enhancement
 * Property 3: Task Pomodoro Button State Consistency
 * Validates: Requirements 2.2, 2.4
 *
 * For any task list and pomodoro state, if a pomodoro is in progress for task T,
 * then the start button for task T SHALL show the running timer, and all other
 * task start buttons SHALL be disabled.
 */

// Types representing the domain
interface Task {
  id: string;
  title: string;
}

interface ActivePomodoro {
  id: string;
  taskId: string;
  taskTitle: string;
  duration: number;
  startTime: Date;
  status: 'IN_PROGRESS';
}

type ButtonState = 
  | { type: 'start'; enabled: boolean }
  | { type: 'running'; timeRemaining: number }
  | { type: 'disabled'; reason: 'other_active' | 'daily_cap' };

/**
 * Pure function that determines the button state for a task
 * based on the current pomodoro state.
 * 
 * This is the core logic extracted from TaskPomodoroButton component
 * for property-based testing.
 */
export function determineButtonState(
  taskId: string,
  activePomodoro: ActivePomodoro | null,
  canStartPomodoro: boolean
): ButtonState {
  // If this task has an active pomodoro, show running timer
  if (activePomodoro && activePomodoro.taskId === taskId) {
    const now = Date.now();
    const endTime = activePomodoro.startTime.getTime() + activePomodoro.duration * 60 * 1000;
    const timeRemaining = Math.max(0, Math.floor((endTime - now) / 1000));
    return { type: 'running', timeRemaining };
  }

  // If another task has an active pomodoro, disable this button
  if (activePomodoro && activePomodoro.taskId !== taskId) {
    return { type: 'disabled', reason: 'other_active' };
  }

  // If daily cap reached, disable the button
  if (!canStartPomodoro) {
    return { type: 'disabled', reason: 'daily_cap' };
  }

  // Otherwise, show enabled start button
  return { type: 'start', enabled: true };
}

/**
 * Determines button states for all tasks in a list
 */
export function determineAllButtonStates(
  tasks: Task[],
  activePomodoro: ActivePomodoro | null,
  canStartPomodoro: boolean
): Map<string, ButtonState> {
  const states = new Map<string, ButtonState>();
  for (const task of tasks) {
    states.set(task.id, determineButtonState(task.id, activePomodoro, canStartPomodoro));
  }
  return states;
}

// Arbitraries for generating test data
const taskIdArb = fc.uuid();
const taskTitleArb = fc.string({ minLength: 1, maxLength: 100 });

const taskArb: fc.Arbitrary<Task> = fc.record({
  id: taskIdArb,
  title: taskTitleArb,
});

const taskListArb = fc.array(taskArb, { minLength: 1, maxLength: 20 }).filter(tasks => {
  // Ensure unique task IDs
  const ids = tasks.map(t => t.id);
  return new Set(ids).size === ids.length;
});

const activePomodoroArb = (taskId: string): fc.Arbitrary<ActivePomodoro> => fc.record({
  id: fc.uuid(),
  taskId: fc.constant(taskId),
  taskTitle: taskTitleArb,
  duration: fc.integer({ min: 1, max: 120 }),
  startTime: fc.date({ min: new Date(Date.now() - 60 * 60 * 1000), max: new Date() }),
  status: fc.constant('IN_PROGRESS' as const),
});

describe('Property 3: Task Pomodoro Button State Consistency', () => {
  /**
   * Property 3.1: When a pomodoro is active for task T, task T shows running timer
   * 
   * For any task T with an active pomodoro, the button state for T
   * SHALL be 'running' with a non-negative timeRemaining.
   */
  it('should show running timer for task with active pomodoro', () => {
    fc.assert(
      fc.property(
        taskListArb,
        fc.boolean(),
        (tasks, canStart) => {
          // Pick a random task to have the active pomodoro
          const activeTaskIndex = Math.floor(Math.random() * tasks.length);
          const activeTask = tasks[activeTaskIndex];
          
          // Generate an active pomodoro for this task
          const activePomodoro: ActivePomodoro = {
            id: 'pomo-' + activeTask.id,
            taskId: activeTask.id,
            taskTitle: activeTask.title,
            duration: 25,
            startTime: new Date(Date.now() - 5 * 60 * 1000), // Started 5 minutes ago
            status: 'IN_PROGRESS',
          };

          const states = determineAllButtonStates(tasks, activePomodoro, canStart);
          const activeTaskState = states.get(activeTask.id);

          // The active task should show running timer
          expect(activeTaskState).toBeDefined();
          expect(activeTaskState!.type).toBe('running');
          if (activeTaskState!.type === 'running') {
            expect(activeTaskState!.timeRemaining).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.2: When a pomodoro is active for task T, all other tasks are disabled
   * 
   * For any task list where task T has an active pomodoro, all tasks
   * other than T SHALL have their buttons disabled with reason 'other_active'.
   */
  it('should disable all other task buttons when one task has active pomodoro', () => {
    fc.assert(
      fc.property(
        taskListArb.filter(tasks => tasks.length >= 2), // Need at least 2 tasks
        fc.boolean(),
        (tasks, canStart) => {
          // Pick a random task to have the active pomodoro
          const activeTaskIndex = Math.floor(Math.random() * tasks.length);
          const activeTask = tasks[activeTaskIndex];
          
          // Generate an active pomodoro for this task
          const activePomodoro: ActivePomodoro = {
            id: 'pomo-' + activeTask.id,
            taskId: activeTask.id,
            taskTitle: activeTask.title,
            duration: 25,
            startTime: new Date(Date.now() - 5 * 60 * 1000),
            status: 'IN_PROGRESS',
          };

          const states = determineAllButtonStates(tasks, activePomodoro, canStart);

          // All other tasks should be disabled
          for (const task of tasks) {
            if (task.id !== activeTask.id) {
              const state = states.get(task.id);
              expect(state).toBeDefined();
              expect(state!.type).toBe('disabled');
              if (state!.type === 'disabled') {
                expect(state!.reason).toBe('other_active');
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.3: When no pomodoro is active and can start, all buttons are enabled
   * 
   * For any task list with no active pomodoro and canStartPomodoro=true,
   * all task buttons SHALL be in 'start' state with enabled=true.
   */
  it('should enable all task buttons when no pomodoro is active and can start', () => {
    fc.assert(
      fc.property(
        taskListArb,
        (tasks) => {
          const states = determineAllButtonStates(tasks, null, true);

          // All tasks should have enabled start buttons
          for (const task of tasks) {
            const state = states.get(task.id);
            expect(state).toBeDefined();
            expect(state!.type).toBe('start');
            if (state!.type === 'start') {
              expect(state!.enabled).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.4: When no pomodoro is active but daily cap reached, all buttons are disabled
   * 
   * For any task list with no active pomodoro and canStartPomodoro=false,
   * all task buttons SHALL be in 'disabled' state with reason 'daily_cap'.
   */
  it('should disable all task buttons when daily cap is reached', () => {
    fc.assert(
      fc.property(
        taskListArb,
        (tasks) => {
          const states = determineAllButtonStates(tasks, null, false);

          // All tasks should be disabled due to daily cap
          for (const task of tasks) {
            const state = states.get(task.id);
            expect(state).toBeDefined();
            expect(state!.type).toBe('disabled');
            if (state!.type === 'disabled') {
              expect(state!.reason).toBe('daily_cap');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.5: Exactly one task shows running timer when pomodoro is active
   * 
   * For any task list with an active pomodoro, exactly one task SHALL
   * show the running timer state.
   */
  it('should show running timer for exactly one task when pomodoro is active', () => {
    fc.assert(
      fc.property(
        taskListArb,
        fc.boolean(),
        (tasks, canStart) => {
          // Pick a random task to have the active pomodoro
          const activeTaskIndex = Math.floor(Math.random() * tasks.length);
          const activeTask = tasks[activeTaskIndex];
          
          const activePomodoro: ActivePomodoro = {
            id: 'pomo-' + activeTask.id,
            taskId: activeTask.id,
            taskTitle: activeTask.title,
            duration: 25,
            startTime: new Date(Date.now() - 5 * 60 * 1000),
            status: 'IN_PROGRESS',
          };

          const states = determineAllButtonStates(tasks, activePomodoro, canStart);

          // Count tasks with running timer
          let runningCount = 0;
          for (const task of tasks) {
            const state = states.get(task.id);
            if (state?.type === 'running') {
              runningCount++;
            }
          }

          // Exactly one task should show running timer
          expect(runningCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.6: Button state is deterministic
   * 
   * For any given inputs, calling determineButtonState multiple times
   * SHALL produce the same result.
   */
  it('should produce deterministic button states', () => {
    fc.assert(
      fc.property(
        taskIdArb,
        fc.option(activePomodoroArb(fc.sample(taskIdArb, 1)[0]), { nil: null }),
        fc.boolean(),
        (taskId, activePomodoro, canStart) => {
          const state1 = determineButtonState(taskId, activePomodoro, canStart);
          const state2 = determineButtonState(taskId, activePomodoro, canStart);

          expect(state1.type).toBe(state2.type);
          if (state1.type === 'disabled' && state2.type === 'disabled') {
            expect(state1.reason).toBe(state2.reason);
          }
          if (state1.type === 'start' && state2.type === 'start') {
            expect(state1.enabled).toBe(state2.enabled);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.7: Active pomodoro task ID determines which task shows running
   * 
   * For any task list and active pomodoro, the task with ID matching
   * activePomodoro.taskId SHALL be the one showing running timer.
   */
  it('should show running timer only for the task matching active pomodoro taskId', () => {
    fc.assert(
      fc.property(
        taskListArb,
        fc.boolean(),
        (tasks, canStart) => {
          // Pick a random task to have the active pomodoro
          const activeTaskIndex = Math.floor(Math.random() * tasks.length);
          const activeTask = tasks[activeTaskIndex];
          
          const activePomodoro: ActivePomodoro = {
            id: 'pomo-' + activeTask.id,
            taskId: activeTask.id,
            taskTitle: activeTask.title,
            duration: 25,
            startTime: new Date(Date.now() - 5 * 60 * 1000),
            status: 'IN_PROGRESS',
          };

          const states = determineAllButtonStates(tasks, activePomodoro, canStart);

          // Find the task showing running timer
          let runningTaskId: string | null = null;
          for (const task of tasks) {
            const state = states.get(task.id);
            if (state?.type === 'running') {
              runningTaskId = task.id;
              break;
            }
          }

          // The running task should match the active pomodoro's taskId
          expect(runningTaskId).toBe(activePomodoro.taskId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
