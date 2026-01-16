/**
 * Root tRPC Router
 * 
 * Combines all domain routers into a single app router.
 * Requirements: 7.1
 */

import { router } from '../trpc';
import { projectRouter } from './project';
import { taskRouter } from './task';
import { goalRouter } from './goal';
import { pomodoroRouter } from './pomodoro';
import { settingsRouter } from './settings';
import { dailyStateRouter } from './daily-state';
import { timelineRouter } from './timeline';
import { reviewRouter } from './review';
import { skipTokenRouter } from './skip-token';
import { settingsLogsRouter } from './settings-logs';
import { clientsRouter } from './clients';
import { focusSessionRouter } from './focus-session';
import { sleepTimeRouter } from './sleep-time';
import { overRestRouter } from './over-rest';
import { efficiencyAnalysisRouter } from './efficiency-analysis';
import { entertainmentRouter } from './entertainment';
import { workStartRouter } from './work-start';
import { bypassDetectionRouter } from './bypass-detection';
import { demoModeRouter } from './demo-mode';
import { heartbeatRouter } from './heartbeat';
import { timeSliceRouter } from './time-slice';
import { restEnforcementRouter } from './rest-enforcement';
import { healthLimitRouter } from './health-limit';

/**
 * Main application router
 * All domain routers are merged here
 */
export const appRouter = router({
  project: projectRouter,
  task: taskRouter,
  goal: goalRouter,
  pomodoro: pomodoroRouter,
  settings: settingsRouter,
  dailyState: dailyStateRouter,
  timeline: timelineRouter,
  review: reviewRouter,
  skipToken: skipTokenRouter,
  settingsLogs: settingsLogsRouter,
  clients: clientsRouter,
  focusSession: focusSessionRouter,
  sleepTime: sleepTimeRouter,
  overRest: overRestRouter,
  efficiencyAnalysis: efficiencyAnalysisRouter,
  entertainment: entertainmentRouter,
  workStart: workStartRouter,
  bypassDetection: bypassDetectionRouter,
  demoMode: demoModeRouter,
  heartbeat: heartbeatRouter,
  timeSlice: timeSliceRouter,
  restEnforcement: restEnforcementRouter,
  healthLimit: healthLimitRouter,
});

/**
 * Export type definition of API
 */
export type AppRouter = typeof appRouter;
