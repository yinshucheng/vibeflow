/**
 * Octopus Architecture - State Types
 *
 * State synchronization types for full sync.
 */
import type { CommandPriority, ClientType } from './enums';
/**
 * System state for full sync
 */
export interface SystemState {
    state: string;
    timeContext?: string;
    dailyCapReached: boolean;
    skipTokensRemaining: number;
}
/**
 * Daily state for full sync
 */
export interface DailyState {
    date: string;
    completedPomodoros: number;
    totalFocusMinutes: number;
    top3TaskIds: string[];
}
/**
 * Pomodoro state for full sync
 */
export interface PomodoroState {
    id: string;
    taskId: string | null;
    taskTitle?: string | null;
    startTime: number;
    duration: number;
    status: 'active' | 'paused' | 'completed' | 'aborted';
}
/**
 * Task state for full sync
 */
export interface TaskState {
    id: string;
    title: string;
    status: string;
    priority: string;
}
/**
 * User settings for full sync
 */
export interface UserSettingsState {
    pomodoroDuration: number;
    shortBreakDuration: number;
    longBreakDuration: number;
    dailyCap: number;
    enforcementMode: 'strict' | 'gentle';
}
/**
 * Full state for sync
 * Requirements: 8.2
 */
export interface FullState {
    systemState: SystemState;
    dailyState: DailyState;
    activePomodoro: PomodoroState | null;
    top3Tasks: TaskState[];
    settings: UserSettingsState;
}
/**
 * Sync state payload (full sync only -- delta sync deferred for future optimization)
 * Requirements: 8.2
 */
export interface SyncStatePayload {
    syncType: 'full';
    version: number;
    state?: FullState;
}
/**
 * Synchronize state to clients
 * Requirements: 8.2
 */
export interface SyncStateCommand {
    /** UUID */
    commandId: string;
    /** Command type discriminator */
    commandType: 'SYNC_STATE';
    /** Target client type or 'all' for broadcast */
    targetClient: ClientType | 'all';
    priority: CommandPriority;
    /** Whether client must acknowledge */
    requiresAck: boolean;
    /** Unix timestamp, command expires after this */
    expiryTime?: number;
    /** Unix timestamp */
    createdAt: number;
    payload: SyncStatePayload;
}
//# sourceMappingURL=state.d.ts.map