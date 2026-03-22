export * from './auth';

// Server connection configuration
// EXPO_PUBLIC_SERVER_HOST/PORT are baked in at build time by Expo.
// For dev: set to your Mac's LAN IP (auto-detected by start-remote.sh)
// For release: set to the public server IP/domain
const SERVER_HOST = process.env.EXPO_PUBLIC_SERVER_HOST || '39.105.213.147';
const SERVER_PORT = process.env.EXPO_PUBLIC_SERVER_PORT || '4000';
const SERVER_PROTOCOL = process.env.EXPO_PUBLIC_SERVER_PROTOCOL || 'http';

/**
 * Server Configuration
 * In both dev and release, the URL is determined by env vars baked at build time.
 * The production domain (vibeflow.app) will be used once HTTPS + domain is set up.
 */
export const SERVER_URL = `${SERVER_PROTOCOL}://${SERVER_HOST}:${SERVER_PORT}`;

// Socket.io uses HTTP URL (auto-upgrades to WebSocket)
export const WEBSOCKET_URL = SERVER_URL;

/**
 * Timing Configuration
 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const RECONNECT_INITIAL_DELAY_MS = 1000; // 1 second
export const RECONNECT_MAX_DELAY_MS = 30 * 1000; // 30 seconds
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
