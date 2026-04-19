/**
 * Action Service
 *
 * Handles user actions with optimistic updates.
 * Sends events to server and manages action results.
 */

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

type PendingAction = {
  optimisticId: string;
  resolve: (result: ActionResult<unknown>) => void;
  timeout: ReturnType<typeof setTimeout>;
};

// =============================================================================
// ACTION SERVICE
// =============================================================================

class ActionService {
  private pendingActions: Map<string, PendingAction> = new Map();
  private actionTimeout = 10000; // 10 seconds

  constructor() {
    // Subscribe to action results
    websocketService.onActionResult(this.handleActionResult.bind(this));
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

  private generateOptimisticId(): string {
    return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private async sendAction<T>(
    actionType: UserActionType,
    data: Record<string, unknown>
  ): Promise<ActionResult<T>> {
    const optimisticId = this.generateOptimisticId();

    return new Promise((resolve) => {
      // Set timeout for action
      const timeout = setTimeout(() => {
        this.pendingActions.delete(optimisticId);
        resolve({
          success: false,
          error: { code: 'TIMEOUT', message: 'Action timed out' },
        });
      }, this.actionTimeout);

      // Store pending action
      this.pendingActions.set(optimisticId, {
        optimisticId,
        resolve: resolve as (result: ActionResult<unknown>) => void,
        timeout,
      });

      // Send action via WebSocket
      websocketService.sendUserAction(actionType, data, optimisticId);
    });
  }

  private handleActionResult(command: ActionResultCommand): void {
    const { optimisticId, success, error, data } = command.payload;

    const pending = this.pendingActions.get(optimisticId);
    if (!pending) {
      console.warn('[ActionService] Received result for unknown action:', optimisticId);
      return;
    }

    // Clear timeout and remove from pending
    clearTimeout(pending.timeout);
    this.pendingActions.delete(optimisticId);

    // Resolve the promise
    pending.resolve({ success, error, data });
  }
}

// Export singleton instance
export const actionService = new ActionService();
