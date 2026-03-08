export * from './auth';

// Server URL override — highest priority, for public network / frp tunnel
// Example: EXPO_PUBLIC_SERVER_URL=http://39.105.213.147:7080
const SERVER_URL_OVERRIDE = process.env.EXPO_PUBLIC_SERVER_URL;

// Fallback: host + port for local dev
// Use EXPO_PUBLIC_SERVER_HOST to override (e.g., local Mac IP for LAN dev)
const SERVER_HOST = process.env.EXPO_PUBLIC_SERVER_HOST || '39.105.213.147';
const SERVER_PORT = process.env.EXPO_PUBLIC_SERVER_PORT || '7080';

/**
 * Server Configuration
 * Priority: EXPO_PUBLIC_SERVER_URL > host:port > production URL
 *
 * Default (dev):  http://39.105.213.147:7080  (public frp tunnel)
 * LAN override:   EXPO_PUBLIC_SERVER_HOST=192.168.1.4 EXPO_PUBLIC_SERVER_PORT=3000
 * Full override:  EXPO_PUBLIC_SERVER_URL=https://vibe.yourdomain.com
 * Production:     https://vibeflow.app
 */
export const SERVER_URL = SERVER_URL_OVERRIDE
  || (__DEV__
    ? `http://${SERVER_HOST}:${SERVER_PORT}`
    : 'https://vibeflow.app');

// Socket.io uses HTTP URL (auto-upgrades to WebSocket)
export const WEBSOCKET_URL = SERVER_URL;

/**
 * Timing Configuration
 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const RECONNECT_INITIAL_DELAY_MS = 1000; // 1 second
export const RECONNECT_MAX_DELAY_MS = 30 * 1000; // 30 seconds
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
