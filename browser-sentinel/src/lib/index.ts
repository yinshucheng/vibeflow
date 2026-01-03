// Library exports
export { VibeFlowWebSocket, type WebSocketEventHandler } from './websocket.js';
export { PolicyCacheManager, policyCache } from './policy-cache.js';
export { PolicyManager, policyManager } from './policy-manager.js';
export { 
  ActivityTracker, 
  activityTracker, 
  type TabActivity,
  type EnhancedTabActivity,
  type InteractionRecord,
} from './activity-tracker.js';
export { EventQueue, EventReplayManager, getEventQueue, type EventQueueStats } from './event-queue.js';
export { 
  SessionManager, 
  sessionManager, 
  type SessionSummary,
} from './session-manager.js';
export { 
  SearchExtractor, 
  searchExtractor, 
  extractSearchQuery, 
  isSearchEngineUrl,
  type SearchQueryResult,
} from './search-extractor.js';
export { 
  EventBatcher, 
  eventBatcher, 
  createEventBatcher,
  type BatchSendResult,
  type EventBatcherConfig,
} from './event-batcher.js';
export {
  EntertainmentManager,
  entertainmentManager,
  PRESET_ENTERTAINMENT_BLACKLIST,
  PRESET_ENTERTAINMENT_WHITELIST,
  type EntertainmentBlacklistEntry,
  type EntertainmentWhitelistEntry,
  type EntertainmentConfig,
  type EntertainmentState,
  type EntertainmentStatus,
  type EntertainmentStartCheck,
  type EntertainmentStartResult,
  type EntertainmentCannotStartReason,
} from './entertainment-manager.js';
export {
  WorkStartTracker,
  getWorkStartTracker,
  calculateWorkStartDelay,
  type WorkStartInfo,
} from './work-start-tracker.js';
