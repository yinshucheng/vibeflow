/**
 * Dev Auth Configuration
 * 
 * MVP uses a default user without login flow.
 * All HTTP requests include X-Dev-User-Email header.
 */

/** Default user email for MVP development */
export const DEV_USER_EMAIL = 'test@example.com';

/** App version for heartbeat events */
export const APP_VERSION = '1.0.0';

/** Platform identifier for heartbeat events */
export const PLATFORM = 'ios';

/** Client type for octopus protocol */
export const CLIENT_TYPE = 'mobile' as const;

/** Capabilities declared during registration */
export const CAPABILITIES = ['sensor:heartbeat', 'action:app_block'] as const;

/**
 * Get HTTP headers for authenticated requests
 * Uses X-Dev-User-Email header for dev auth bypass
 */
export function getAuthHeaders(): Record<string, string> {
  return {
    'X-Dev-User-Email': DEV_USER_EMAIL,
    'Content-Type': 'application/json',
  };
}

/**
 * Get WebSocket auth payload
 */
export function getSocketAuthPayload(): { email: string } {
  return {
    email: DEV_USER_EMAIL,
  };
}
