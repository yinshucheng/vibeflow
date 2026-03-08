/**
 * Auth Configuration
 *
 * Token-based authentication for iOS client.
 * Stores API token (vf_xxx) in SecureStore.
 * Provides login/register/logout functions and auth headers.
 */

import * as SecureStore from 'expo-secure-store';
import { serverConfigService } from '@/services/server-config.service';

const TOKEN_KEY = 'vibeflow_api_token';

/** App version for heartbeat events */
export const APP_VERSION = '1.0.0';

/** Platform identifier for heartbeat events */
export const PLATFORM = 'ios';

/** Client type for octopus protocol */
export const CLIENT_TYPE = 'mobile' as const;

/** Capabilities declared during registration */
export const CAPABILITIES = ['sensor:heartbeat', 'action:app_block'] as const;

// =============================================================================
// TOKEN STORAGE
// =============================================================================

/**
 * Get stored API token from SecureStore.
 * Returns null if no token is stored.
 */
export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('[Auth] Failed to read token:', error);
    return null;
  }
}

/**
 * Save API token to SecureStore.
 */
async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('[Auth] Failed to save token:', error);
    throw error;
  }
}

/**
 * Delete API token from SecureStore.
 */
async function deleteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('[Auth] Failed to delete token:', error);
  }
}

// =============================================================================
// AUTH ACTIONS
// =============================================================================

export interface AuthResult {
  success: boolean;
  error?: string;
  user?: { id: string; email: string };
}

/**
 * Login with email + password.
 * Calls POST /api/auth/token to get an API token.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  try {
    const serverUrl = serverConfigService.getServerUrlSync();
    const response = await fetch(`${serverUrl}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, clientType: 'mobile' }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error?.message || 'Login failed',
      };
    }

    await saveToken(data.token);

    // Verify token to get user info
    const verifyResult = await verifyToken(data.token);
    if (verifyResult.success && verifyResult.user) {
      return { success: true, user: verifyResult.user };
    }

    return { success: true };
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Register a new account, then login to get an API token.
 */
export async function register(email: string, password: string): Promise<AuthResult> {
  try {
    const serverUrl = serverConfigService.getServerUrlSync();

    // Step 1: Register
    const registerResponse = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const registerData = await registerResponse.json();

    if (!registerResponse.ok || !registerData.success) {
      return {
        success: false,
        error: registerData.error?.message || 'Registration failed',
      };
    }

    // Step 2: Login to get API token
    return await login(email, password);
  } catch (error) {
    console.error('[Auth] Register error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Logout: revoke token on server and clear local storage.
 */
export async function logout(): Promise<void> {
  try {
    const token = await getToken();
    if (token) {
      const serverUrl = serverConfigService.getServerUrlSync();
      // Best effort — don't block on server response
      fetch(`${serverUrl}/api/auth/token`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  } finally {
    await deleteToken();
  }
}

/**
 * Verify a token with the server.
 * Returns user info if valid.
 */
export async function verifyToken(
  token?: string | null
): Promise<{ success: boolean; user?: { id: string; email: string } }> {
  try {
    const t = token ?? (await getToken());
    if (!t) return { success: false };

    const serverUrl = serverConfigService.getServerUrlSync();
    const response = await fetch(`${serverUrl}/api/auth/token`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${t}` },
    });

    if (!response.ok) return { success: false };

    const data = await response.json();
    if (data.valid && data.user) {
      return { success: true, user: data.user };
    }

    return { success: false };
  } catch {
    return { success: false };
  }
}

// =============================================================================
// HTTP HEADERS
// =============================================================================

/**
 * Get HTTP headers for authenticated requests.
 * Returns Authorization: Bearer vf_xxx header.
 * Must be called with await since token is stored in SecureStore.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Get synchronous auth headers (for use in contexts where async isn't available).
 * Uses a cached token value. Must call getToken() first to populate.
 */
let _cachedToken: string | null = null;

export function getAuthHeadersSync(): Record<string, string> {
  if (_cachedToken) {
    return {
      Authorization: `Bearer ${_cachedToken}`,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Refresh the cached token (call after login/logout).
 */
export async function refreshCachedToken(): Promise<void> {
  _cachedToken = await getToken();
}

// =============================================================================
// SOCKET AUTH
// =============================================================================

/**
 * Get WebSocket auth payload.
 * Returns { token: 'vf_xxx' } for socket.io auth.
 */
export function getSocketAuthPayload(): { token: string } | Record<string, never> {
  if (_cachedToken) {
    return { token: _cachedToken };
  }
  return {};
}
