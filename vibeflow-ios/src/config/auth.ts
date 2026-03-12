/**
 * Auth Configuration
 *
 * Token-based authentication for iOS client.
 * Stores API token (vf_xxx) in SecureStore.
 * Provides login/register/logout functions and auth headers.
 */

import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';
import { serverConfigService } from '@/services/server-config.service';

const TOKEN_KEY = 'vibeflow_api_token';
const FETCH_TIMEOUT_MS = 15000;
const WS_AUTH_TIMEOUT_MS = 10000;

/**
 * XHR-based HTTP request as fallback for when Hermes fetch() is broken.
 * Uses React Native's RCTNetworking (XMLHttpRequest) instead of Hermes fetch.
 * Reference: https://github.com/expo/expo/issues/40061
 */
function xhrRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs: number
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const method = options.method || 'GET';

    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText),
      });
    };
    xhr.onerror = () => {
      reject(new TypeError(`XHR Network request failed: ${method} ${url}`));
    };
    xhr.ontimeout = () => {
      reject(new TypeError(`XHR timeout: ${method} ${url}`));
    };

    xhr.open(method, url, true);
    xhr.timeout = timeoutMs;

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.send(options.body || null);
  });
}

/**
 * Fetch with timeout + XHR fallback.
 * Tries Hermes fetch() first. If it fails instantly (< 500ms, known Hermes bug),
 * falls back to XMLHttpRequest which uses a different native networking path.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  const method = (options.method || 'GET') as string;
  const start = Date.now();

  // Attempt 1: native fetch
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      console.log(`[Auth/fetch] ${method} ${url} → ${response.status} (${Date.now() - start}ms)`);
      return response;
    } finally {
      clearTimeout(timer);
    }
  } catch (fetchError) {
    const elapsed = Date.now() - start;
    console.warn(`[Auth/fetch] ${method} ${url} failed (${elapsed}ms), trying XHR fallback...`);
  }

  // Attempt 2: XHR fallback (bypasses Hermes fetch bug)
  try {
    const headers: Record<string, string> = {};
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((v, k) => { headers[k] = v; });
      } else if (typeof options.headers === 'object') {
        Object.assign(headers, options.headers);
      }
    }
    const response = await xhrRequest(url, {
      method,
      headers,
      body: options.body as string | undefined,
    }, timeoutMs);
    console.log(`[Auth/xhr] ${method} ${url} → ${response.status} (${Date.now() - start}ms)`);
    return response;
  } catch (xhrError) {
    console.error(`[Auth/xhr] ${method} ${url} also failed (${Date.now() - start}ms):`, xhrError);
    throw xhrError;
  }
}

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
// WEBSOCKET AUTH FALLBACK
// When HTTP fetch fails (e.g., carrier DPI blocking non-standard ports),
// fall back to authenticating over WebSocket which uses a different protocol.
// =============================================================================

interface WsAuthResponse {
  success: boolean;
  token?: string;
  user?: { id: string; email: string };
  error?: { code: string; message: string };
}

/**
 * Login via WebSocket — creates a temporary guest connection,
 * sends credentials through WS, and receives the token back.
 */
function wsLogin(email: string, password: string): Promise<WsAuthResponse> {
  return new Promise((resolve) => {
    const serverUrl = serverConfigService.getServerUrlSync();
    console.log('[Auth/ws] Attempting WS login to:', serverUrl);

    const socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: WS_AUTH_TIMEOUT_MS,
    });

    const timer = setTimeout(() => {
      console.warn('[Auth/ws] Login timeout');
      socket.disconnect();
      resolve({ success: false, error: { code: 'TIMEOUT', message: 'WS login timeout' } });
    }, WS_AUTH_TIMEOUT_MS);

    socket.on('connect', () => {
      socket.emit('AUTH_LOGIN', { email, password, clientType: 'mobile' }, (response: WsAuthResponse) => {
        clearTimeout(timer);
        socket.disconnect();
        resolve(response);
      });
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      console.error('[Auth/ws] Connect error:', err.message);
      resolve({ success: false, error: { code: 'CONNECT_ERROR', message: err.message } });
    });
  });
}

/**
 * Verify token via WebSocket fallback.
 */
function wsVerifyToken(token: string): Promise<{ success: boolean; user?: { id: string; email: string } }> {
  return new Promise((resolve) => {
    const serverUrl = serverConfigService.getServerUrlSync();
    console.log('[Auth/ws] Attempting WS verify to:', serverUrl);

    const socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: WS_AUTH_TIMEOUT_MS,
    });

    const timer = setTimeout(() => {
      console.warn('[Auth/ws] Verify timeout');
      socket.disconnect();
      resolve({ success: false });
    }, WS_AUTH_TIMEOUT_MS);

    socket.on('connect', () => {
      socket.emit('AUTH_VERIFY', { token }, (response: { success: boolean; user?: { id: string; email: string } }) => {
        clearTimeout(timer);
        socket.disconnect();
        resolve(response);
      });
    });

    socket.on('connect_error', () => {
      clearTimeout(timer);
      resolve({ success: false });
    });
  });
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
 * Tries HTTP first, falls back to WebSocket if HTTP fails.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  // Try HTTP first
  try {
    const serverUrl = serverConfigService.getServerUrlSync();
    const url = `${serverUrl}/api/auth/token`;
    console.log('[Auth] Login to:', url);
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, clientType: 'mobile' }),
    });

    console.log('[Auth] Login response status:', response.status);
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
  } catch (httpError) {
    console.warn('[Auth] HTTP login failed, trying WebSocket fallback...');
  }

  // Fallback: login via WebSocket
  try {
    const wsResult = await wsLogin(email, password);
    if (wsResult.success && wsResult.token) {
      await saveToken(wsResult.token);
      if (wsResult.user) {
        return { success: true, user: wsResult.user };
      }
      return { success: true };
    }
    return {
      success: false,
      error: wsResult.error?.message || 'Login failed',
    };
  } catch (wsError) {
    const msg = wsError instanceof Error ? `${wsError.name}: ${wsError.message}` : String(wsError);
    console.error('[Auth] WS login also failed:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Register a new account, then login to get an API token.
 */
export async function register(email: string, password: string): Promise<AuthResult> {
  try {
    const serverUrl = serverConfigService.getServerUrlSync();

    // Step 1: Register
    const registerResponse = await fetchWithTimeout(`${serverUrl}/api/auth/register`, {
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
 * Verify a token with the server.
 * Tries HTTP first, falls back to WebSocket.
 */
export async function verifyToken(
  token?: string | null
): Promise<{ success: boolean; user?: { id: string; email: string } }> {
  const t = token ?? (await getToken());
  if (!t) {
    console.log('[Auth] No token to verify');
    return { success: false };
  }

  // Try HTTP first
  try {
    const serverUrl = serverConfigService.getServerUrlSync();
    console.log('[Auth] Verifying token at:', `${serverUrl}/api/auth/token`);
    const response = await fetchWithTimeout(`${serverUrl}/api/auth/token`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${t}` },
    });

    if (!response.ok) {
      console.log('[Auth] Token verify failed:', response.status);
      return { success: false };
    }

    const data = await response.json();
    if (data.valid && data.user) {
      console.log('[Auth] Token verified for:', data.user.email);
      return { success: true, user: data.user };
    }

    return { success: false };
  } catch {
    console.warn('[Auth] HTTP verify failed, trying WebSocket fallback...');
  }

  // Fallback: verify via WebSocket
  try {
    return await wsVerifyToken(t);
  } catch (error) {
    console.error('[Auth] WS verify also failed:', error);
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (_cachedEmail) {
    headers['x-dev-user-email'] = _cachedEmail;
  }
  return headers;
}

/**
 * Get synchronous auth headers (for use in contexts where async isn't available).
 * Uses a cached token value. Must call getToken() first to populate.
 */
let _cachedToken: string | null = null;
let _cachedEmail: string | null = null;

export function getAuthHeadersSync(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (_cachedToken) {
    headers['Authorization'] = `Bearer ${_cachedToken}`;
  }
  if (_cachedEmail) {
    headers['x-dev-user-email'] = _cachedEmail;
  }
  return headers;
}

/**
 * Refresh the cached token and email (call after login/logout).
 */
export async function refreshCachedToken(): Promise<void> {
  _cachedToken = await getToken();
}

/**
 * Set the cached user email for dev mode header injection.
 * Called after successful login/verify to ensure x-dev-user-email
 * is included in all subsequent requests (HTTP + WebSocket).
 */
export function setCachedEmail(email: string | null): void {
  _cachedEmail = email;
}

/**
 * Get the cached user email.
 */
export function getCachedEmail(): string | null {
  return _cachedEmail;
}

// =============================================================================
// SOCKET AUTH
// =============================================================================

/**
 * Get WebSocket auth payload.
 * Returns { token, email } for socket.io auth.
 * The email field ensures DEV_MODE server resolves the correct user
 * (server logic: email || x-dev-user-email header || defaultUserEmail).
 */
export function getSocketAuthPayload(): Record<string, string> {
  const payload: Record<string, string> = {};
  if (_cachedToken) {
    payload.token = _cachedToken;
  }
  if (_cachedEmail) {
    payload.email = _cachedEmail;
  }
  return payload;
}
