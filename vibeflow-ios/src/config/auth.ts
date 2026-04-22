/**
 * Auth Configuration
 *
 * Token-based authentication for iOS client.
 * Stores API token (vf_xxx) in SecureStore.
 * Single HTTP path — no fallbacks.
 */

import * as SecureStore from 'expo-secure-store';
import { serverConfigService } from '@/services/server-config.service';

const TOKEN_KEY = 'vibeflow_api_token';
const FETCH_TIMEOUT_MS = 15000;

// =============================================================================
// HTTP FETCH WITH TIMEOUT
// =============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const method = options.method || 'GET';
    console.log(`[Auth] ${method} ${url} → ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================================
// TOKEN STORAGE
// =============================================================================

/**
 * Read API token from SecureStore.
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
 * Login with email + password via HTTP.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  const serverUrl = serverConfigService.getServerUrlSync();
  const url = `${serverUrl}/api/auth/token`;
  console.log('[Auth] Login to:', url);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, clientType: 'mobile' }),
  });

  const data = (await response.json()) as {
    success: boolean;
    token?: string;
    error?: { message: string };
  };

  if (!response.ok || !data.success || !data.token) {
    return { success: false, error: data.error?.message || 'Login failed' };
  }

  await saveToken(data.token);

  // Verify to get user info
  const verifyResult = await verifyToken(data.token);
  if (verifyResult.success && verifyResult.user) {
    return { success: true, user: verifyResult.user };
  }

  return { success: true };
}

/**
 * Register a new account, then login to get an API token.
 */
export async function register(email: string, password: string): Promise<AuthResult> {
  const serverUrl = serverConfigService.getServerUrlSync();

  const registerResponse = await fetchWithTimeout(`${serverUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const registerData = (await registerResponse.json()) as {
    success: boolean;
    error?: { message: string };
  };

  if (!registerResponse.ok || !registerData.success) {
    return { success: false, error: registerData.error?.message || 'Registration failed' };
  }

  return await login(email, password);
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
      fetchWithTimeout(`${serverUrl}/api/auth/token`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }, 3000).catch(() => {});
    }
  } finally {
    await deleteToken();
  }
}

/**
 * Verify a token with the server via HTTP.
 */
export async function verifyToken(
  token?: string | null
): Promise<{ success: boolean; user?: { id: string; email: string } }> {
  const t = token ?? (await getToken());
  if (!t) {
    console.log('[Auth] No token to verify');
    return { success: false };
  }

  const serverUrl = serverConfigService.getServerUrlSync();
  const response = await fetchWithTimeout(`${serverUrl}/api/auth/token`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${t}` },
  });

  if (!response.ok) {
    console.log('[Auth] Token verify failed:', response.status);
    return { success: false };
  }

  const data = (await response.json()) as {
    valid?: boolean;
    user?: { id: string; email: string };
  };

  if (data.valid && data.user) {
    console.log('[Auth] Token verified for:', data.user.email);
    return { success: true, user: data.user };
  }

  return { success: false };
}

// =============================================================================
// HTTP HEADERS
// =============================================================================

/**
 * Get HTTP headers for authenticated requests (async — reads SecureStore).
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Cached token for sync access (populated by refreshCachedToken)
let cachedToken: string | null = null;
let cachedEmail: string | null = null;

/**
 * Get HTTP headers synchronously (uses cached token, must call refreshCachedToken first).
 */
export function getAuthHeadersSync(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cachedToken) {
    headers['Authorization'] = `Bearer ${cachedToken}`;
  }
  return headers;
}

/**
 * Get cached email (populated by refreshCachedToken or setCachedEmail).
 */
export function getCachedEmail(): string | null {
  return cachedEmail;
}

/**
 * Set cached email directly (used by AppProvider after login).
 */
export function setCachedEmail(email: string | null): void {
  cachedEmail = email;
}

/**
 * Get auth payload for socket.io connection (uses cached values).
 */
export function getSocketAuthPayload(): Record<string, string> {
  const payload: Record<string, string> = {};
  if (cachedToken) payload.token = cachedToken;
  if (cachedEmail) payload.email = cachedEmail;
  return payload;
}

/**
 * Refresh the cached token and email (call after login/logout).
 */
export async function refreshCachedToken(): Promise<void> {
  cachedToken = await getToken();
  if (cachedToken) {
    const result = await verifyToken(cachedToken);
    cachedEmail = result.user?.email ?? null;
  } else {
    cachedEmail = null;
  }
}
