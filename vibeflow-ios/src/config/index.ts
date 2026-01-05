export * from './auth';

/**
 * Server Configuration
 */
export const SERVER_URL = __DEV__ 
  ? 'http://localhost:3000' 
  : 'https://vibeflow.app';

export const WEBSOCKET_URL = __DEV__
  ? 'ws://localhost:3000'
  : 'wss://vibeflow.app';

/**
 * Timing Configuration
 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const RECONNECT_INITIAL_DELAY_MS = 1000; // 1 second
export const RECONNECT_MAX_DELAY_MS = 30 * 1000; // 30 seconds
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
