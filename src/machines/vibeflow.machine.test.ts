import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { vibeFlowMachine } from './vibeflow.machine';

describe('VibeFlow State Machine - Multi-task Enhancement', () => {
  const createTestActor = () => {
    const actor = createActor(vibeFlowMachine, {
      input: { userId: 'test-user' },
    });
    actor.start();
    // Transition from locked -> planning via COMPLETE_AIRLOCK
    actor.send({ type: 'COMPLETE_AIRLOCK', top3TaskIds: ['t1', 't2', 't3'] });
    return actor;
  };

  describe('START_TASKLESS_POMODORO', () => {
    it('should transition from planning to focus with isTaskless=true', () => {
      const actor = createTestActor();
      expect(actor.getSnapshot().value).toBe('planning');

      actor.send({ type: 'START_TASKLESS_POMODORO', pomodoroId: 'pomo-1' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('focus');
      expect(snapshot.context.isTaskless).toBe(true);
      expect(snapshot.context.currentPomodoroId).toBe('pomo-1');
    });

    it('should allow taskless start from over_rest state', () => {
      const actor = createTestActor();

      // Go through focus -> rest -> over_rest
      actor.send({ type: 'START_POMODORO', taskId: 'task-1', pomodoroId: 'pomo-1' });
      actor.send({ type: 'COMPLETE_POMODORO' });
      actor.send({ type: 'ENTER_OVER_REST' });

      expect(actor.getSnapshot().value).toBe('over_rest');

      actor.send({ type: 'START_TASKLESS_POMODORO', pomodoroId: 'pomo-2' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('focus');
      expect(snapshot.context.isTaskless).toBe(true);
    });
  });

  describe('SWITCH_TASK', () => {
    it('should update taskStack when switching tasks in focus state', () => {
      const actor = createTestActor();

      actor.send({ type: 'START_POMODORO', taskId: 'task-1', pomodoroId: 'pomo-1' });
      expect(actor.getSnapshot().context.taskStack).toHaveLength(1);

      actor.send({ type: 'SWITCH_TASK', taskId: 'task-2', timeSliceId: 'slice-1' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('focus');
      expect(snapshot.context.taskStack).toHaveLength(2);
      expect(snapshot.context.taskStack[1].taskId).toBe('task-2');
      expect(snapshot.context.currentTimeSliceId).toBe('slice-1');
    });

    it('should allow switching to taskless (null taskId)', () => {
      const actor = createTestActor();

      actor.send({ type: 'START_POMODORO', taskId: 'task-1', pomodoroId: 'pomo-1' });
      actor.send({ type: 'SWITCH_TASK', taskId: null, timeSliceId: 'slice-1' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.taskStack[1].taskId).toBeNull();
    });
  });

  describe('ASSOCIATE_TASK', () => {
    it('should associate task to taskless pomodoro', () => {
      const actor = createTestActor();

      actor.send({ type: 'START_TASKLESS_POMODORO', pomodoroId: 'pomo-1' });
      expect(actor.getSnapshot().context.isTaskless).toBe(true);

      actor.send({ type: 'ASSOCIATE_TASK', taskId: 'task-1', timeSliceId: 'slice-1' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.isTaskless).toBe(false);
    });
  });

  describe('COMPLETE_CURRENT_TASK', () => {
    it('should clear current task but stay in focus state', () => {
      const actor = createTestActor();

      actor.send({ type: 'START_POMODORO', taskId: 'task-1', pomodoroId: 'pomo-1' });
      actor.send({ type: 'COMPLETE_CURRENT_TASK' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('focus');
      // Task stack should have a new taskless entry
      const lastEntry = snapshot.context.taskStack.at(-1);
      expect(lastEntry?.taskId).toBeNull();
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain currentTaskId when starting pomodoro', () => {
      const actor = createTestActor();

      actor.send({ type: 'START_POMODORO', taskId: 'task-1', pomodoroId: 'pomo-1' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.context.currentTaskId).toBe('task-1');
    });
  });
});
