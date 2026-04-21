/**
 * Action Service
 *
 * Handles user actions with optimistic updates.
 * Uses SDK createActionRPC for request/response pairing.
 */

import { createActionRPC } from '@vibeflow/octopus-protocol';
import { websocketService } from './websocket.service';
import type { UserActionType, ActionResultCommand } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// =============================================================================
// ACTION SERVICE
// =============================================================================

class ActionService {
  // SDK Action RPC — handles request/response pairing and timeouts
  private rpc = createActionRPC({
    timeout: 10000,
    sendEvent: (event) => {
      websocketService.sendUserAction(
        event.payload.actionType,
        event.payload.data,
        event.payload.optimisticId
      );
    },
  });

  constructor() {
    // Subscribe to action results — route to SDK RPC handler
    websocketService.onActionResult((command: ActionResultCommand) => {
      this.rpc.handleResult(command.payload);
    });
    // Clear pending on disconnect
    websocketService.onDisconnect(() => {
      this.rpc.clearAll();
    });
  }

  // ===========================================================================
  // PUBLIC METHODS
  // ===========================================================================

  /**
   * Complete a task
   */
  async completeTask(taskId: string): Promise<ActionResult> {
    return this.sendAction('TASK_COMPLETE', { taskId });
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  ): Promise<ActionResult> {
    return this.sendAction('TASK_STATUS_CHANGE', { taskId, status });
  }

  /**
   * Create a new task
   */
  async createTask(task: {
    title: string;
    priority?: string;
    planDate?: string;
    projectId?: string;
  }): Promise<ActionResult<{ taskId: string }>> {
    return this.sendAction('TASK_CREATE', task);
  }

  /**
   * Update a task
   */
  async updateTask(
    taskId: string,
    updates: {
      title?: string;
      priority?: string;
      planDate?: string | null;
      projectId?: string;
    }
  ): Promise<ActionResult> {
    return this.sendAction('TASK_UPDATE', { taskId, ...updates });
  }

  /**
   * Start a pomodoro
   */
  async startPomodoro(taskId?: string): Promise<ActionResult<{ pomodoroId: string }>> {
    return this.sendAction('POMODORO_START', { taskId });
  }

  /**
   * Switch task during pomodoro
   */
  async switchTask(pomodoroId: string, newTaskId: string): Promise<ActionResult> {
    return this.sendAction('POMODORO_SWITCH_TASK', { pomodoroId, newTaskId });
  }

  /**
   * Set Top 3 tasks
   */
  async setTop3(taskIds: string[]): Promise<ActionResult> {
    return this.sendAction('TOP3_SET', { taskIds });
  }

  /**
   * Fetch today's tasks (including completed)
   */
  async fetchTodayTasks(): Promise<ActionResult<{ tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    planDate: string | null;
    projectId: string | null;
  }> }>> {
    return this.sendAction('TASK_GET_TODAY', { includeDone: true });
  }

  /**
   * Fetch overdue tasks
   */
  async fetchOverdueTasks(): Promise<ActionResult<{ tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    planDate: string | null;
    projectId: string | null;
  }> }>> {
    return this.sendAction('TASK_GET_OVERDUE', {});
  }

  /**
   * Send a habit-related action
   */
  async sendHabitAction<T = void>(
    actionType: string,
    data: Record<string, unknown>
  ): Promise<ActionResult<T>> {
    return this.sendAction(actionType as UserActionType, data);
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async sendAction<T>(
    actionType: UserActionType,
    data: Record<string, unknown>
  ): Promise<ActionResult<T>> {
    try {
      const result = await this.rpc.send(actionType, data);
      return { success: result.success, error: result.error, data: result.data as T | undefined };
    } catch (err) {
      // RPC rejects on timeout or connection loss
      const message = err instanceof Error ? err.message : 'Action failed';
      return { success: false, error: { code: 'TIMEOUT', message } };
    }
  }
}

// Export singleton instance
export const actionService = new ActionService();
