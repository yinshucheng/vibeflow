/**
 * Data factories barrel export
 * 
 * Requirements: 2.2
 * - Provides factory functions for User, Project, Task, Goal entities
 */

export { UserFactory } from './user.factory';
export type { CreateUserInput, CreateUserSettingsInput, UserWithSettings } from './user.factory';

export { ProjectFactory } from './project.factory';
export type { CreateProjectInput } from './project.factory';

export { TaskFactory } from './task.factory';
export type { CreateTaskInput } from './task.factory';

export { GoalFactory } from './goal.factory';
export type { CreateGoalInput } from './goal.factory';
