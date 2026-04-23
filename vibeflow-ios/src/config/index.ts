// NOTE: auth.ts is NOT re-exported here to avoid circular dependency:
//   config/index.ts -> config/auth.ts -> server-config.service.ts -> config/index.ts
// Import auth functions directly from '@/config/auth' instead.

import Constants from 'expo-constants';

/** App version for heartbeat events (read from app.config.ts) */
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Platform identifier for heartbeat events */
export const PLATFORM = 'ios';

/** Client type for octopus protocol */
export const CLIENT_TYPE = 'mobile' as const;

/** Capabilities declared during registration */
export const CAPABILITIES = ['sensor:heartbeat', 'action:app_block'] as const;

// Server URL override — highest priority, for public network / frp tunnel
// Example: EXPO_PUBLIC_SERVER_URL=http://39.105.213.147:7080
const SERVER_URL_OVERRIDE = process.env.EXPO_PUBLIC_SERVER_URL;

// Host + port for dev / staging / self-hosted
// Works in both debug and release builds (env vars are baked at build time)
const SERVER_HOST = process.env.EXPO_PUBLIC_SERVER_HOST;
const SERVER_PORT = process.env.EXPO_PUBLIC_SERVER_PORT || '4000';

/**
 * Server Configuration
 * Priority: EXPO_PUBLIC_SERVER_URL > EXPO_PUBLIC_SERVER_HOST:PORT > production default
 *
 * Remote:    EXPO_PUBLIC_SERVER_HOST=39.105.213.147 EXPO_PUBLIC_SERVER_PORT=4000
 * LAN:      EXPO_PUBLIC_SERVER_HOST=192.168.1.4 EXPO_PUBLIC_SERVER_PORT=3000
 * Full URL: EXPO_PUBLIC_SERVER_URL=https://vibe.yourdomain.com
 * Default:  http://39.105.213.147:4000 (production server)
 */
export const SERVER_URL = SERVER_URL_OVERRIDE
  || (SERVER_HOST
    ? `http://${SERVER_HOST}:${SERVER_PORT}`
    : 'http://39.105.213.147:4000');

// Socket.io uses HTTP URL (auto-upgrades to WebSocket)
export const WEBSOCKET_URL = SERVER_URL;

/**
 * Timing Configuration
 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const RECONNECT_INITIAL_DELAY_MS = 1000; // 1 second
export const RECONNECT_MAX_DELAY_MS = 30 * 1000; // 30 seconds
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Application-layer keepalive ping interval (must be < NAT timeout, typically 30s) */
export const KEEPALIVE_INTERVAL_MS = 15 * 1000; // 15 seconds
/** Max wait for keepalive pong before declaring connection dead */
export const KEEPALIVE_TIMEOUT_MS = 10 * 1000; // 10 seconds
/** Max wait for WS handshake to complete after socket creation */
export const CONNECT_WATCHDOG_TIMEOUT_MS = 15 * 1000; // 15 seconds
