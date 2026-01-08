export * from './auth';

// Get server host from environment or use default
// Set VIBEFLOW_SERVER_HOST env var to your Mac's IP when it changes
const SERVER_HOST = process.env.EXPO_PUBLIC_SERVER_HOST || '192.168.1.4';

/**
 * Server Configuration
 */
export const SERVER_URL = __DEV__
  ? `http://${SERVER_HOST}:3000`
  : 'https://vibeflow.app';

// Socket.io uses HTTP URL (auto-upgrades to WebSocket)
export const WEBSOCKET_URL = __DEV__
  ? `http://${SERVER_HOST}:3000`
  : 'https://vibeflow.app';

/**
 * Timing Configuration
 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const RECONNECT_INITIAL_DELAY_MS = 1000; // 1 second
export const RECONNECT_MAX_DELAY_MS = 30 * 1000; // 30 seconds
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
