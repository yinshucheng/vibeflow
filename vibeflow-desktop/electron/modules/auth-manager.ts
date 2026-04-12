/**
 * Auth Manager Module
 *
 * Manages authentication state for the VibeFlow desktop client:
 * - Token storage/retrieval via electron-store
 * - Token validation against the server
 * - Login window management (loads Web /login page in a BrowserWindow)
 * - Token acquisition after login via POST /api/auth/token
 *
 * Design: Desktop reuses the Web login page inside a BrowserWindow.
 * After successful login, it calls POST /api/auth/token (with the
 * session cookie set by NextAuth) to obtain a long-lived API token,
 * which is persisted locally for subsequent launches.
 */

import { BrowserWindow, session } from 'electron';
import Store from 'electron-store';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface AuthState {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** The API token (vf_xxx format) */
  token: string | null;
  /** User ID from the server */
  userId: string | null;
  /** User email from the server */
  email: string | null;
}

export type AuthChangeHandler = (state: AuthState) => void;

export interface AuthManagerConfig {
  /** Base URL of the VibeFlow server (e.g. http://localhost:3000) */
  serverUrl: string;
  /** Whether connected to a remote server (via VIBEFLOW_SERVER_URL) */
  isRemoteMode?: boolean;
}

interface AuthStoreSchema {
  authToken: string | null;
  authUserId: string | null;
  authEmail: string | null;
}

// --------------------------------------------------------------------------
// AuthManager class
// --------------------------------------------------------------------------

class AuthManager {
  private config: AuthManagerConfig;
  private store: Store<AuthStoreSchema>;
  private state: AuthState;
  private loginWindow: BrowserWindow | null = null;
  private listeners: Set<AuthChangeHandler> = new Set();

  constructor(config: AuthManagerConfig) {
    this.config = config;

    this.store = new Store<AuthStoreSchema>({
      name: 'vibeflow-auth',
      defaults: {
        authToken: null,
        authUserId: null,
        authEmail: null,
      },
    });

    // Restore persisted auth state
    this.state = {
      isAuthenticated: false,
      token: this.store.get('authToken') ?? null,
      userId: this.store.get('authUserId') ?? null,
      email: this.store.get('authEmail') ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Get the current auth state (snapshot).
   */
  getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Get the stored token (for use by ConnectionManager).
   */
  getToken(): string | null {
    return this.state.token;
  }

  /**
   * Subscribe to auth state changes. Returns an unsubscribe function.
   */
  onAuthChange(handler: AuthChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Validate the stored token against the server.
   * If valid, marks as authenticated. Otherwise clears stored token.
   *
   * Returns `true` if the token is valid.
   */
  async validateToken(): Promise<boolean> {
    const token = this.state.token;
    if (!token) {
      this.updateState({ isAuthenticated: false });
      return false;
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/api/auth/token`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          valid: boolean;
          user?: { id: string; email: string };
        };

        if (data.valid && data.user) {
          this.updateState({
            isAuthenticated: true,
            token,
            userId: data.user.id,
            email: data.user.email,
          });
          return true;
        }
      }

      // Token invalid — clear it
      this.clearAuth();
      return false;
    } catch {
      // Network error — keep the token but don't mark authenticated yet.
      // The connection manager's retry logic will handle reconnection.
      console.warn('[AuthManager] Token validation failed (network error), keeping token');
      return false;
    }
  }

  /**
   * Open a BrowserWindow with the web login page.
   *
   * Resolves with `true` when the user successfully logs in and we
   * acquire an API token, or `false` if the window is closed without login.
   */
  openLoginWindow(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.loginWindow && !this.loginWindow.isDestroyed()) {
        this.loginWindow.focus();
        return;
      }

      const loginTitle = this.config.isRemoteMode
        ? `VibeFlow — Login (远程: ${new URL(this.config.serverUrl).host})`
        : 'VibeFlow — Login';

      this.loginWindow = new BrowserWindow({
        width: 480,
        height: 640,
        title: loginTitle,
        resizable: false,
        minimizable: false,
        maximizable: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const loginUrl = `${this.config.serverUrl}/login`;
      this.loginWindow.loadURL(loginUrl);

      // Watch for navigation to the main page (indicates successful login)
      this.loginWindow.webContents.on('did-navigate', async (_event, url) => {
        const parsed = new URL(url);
        // After login the page redirects to "/" (or the callbackUrl).
        // If we're no longer on /login or /register, login succeeded.
        if (
          parsed.pathname !== '/login' &&
          parsed.pathname !== '/register' &&
          !parsed.pathname.startsWith('/api/auth')
        ) {
          console.log('[AuthManager] Login succeeded, acquiring API token…');
          const tokenAcquired = await this.acquireTokenFromSession();
          if (tokenAcquired) {
            this.closeLoginWindow();
            resolve(true);
          }
        }
      });

      this.loginWindow.on('closed', () => {
        this.loginWindow = null;
        // If we still don't have a token, resolve as failure
        if (!this.state.isAuthenticated) {
          resolve(false);
        }
      });
    });
  }

  /**
   * Log out: revoke the token on the server, clear local storage.
   */
  async logout(): Promise<void> {
    const token = this.state.token;

    if (token) {
      try {
        await fetch(`${this.config.serverUrl}/api/auth/token`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Best-effort revocation — ignore network errors
      }
    }

    this.clearAuth();
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.closeLoginWindow();
    this.listeners.clear();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * After Web login succeeds (NextAuth cookie is set in the BrowserWindow
   * session), call POST /api/auth/token with that cookie to get an API token.
   */
  private async acquireTokenFromSession(): Promise<boolean> {
    try {
      // Read cookies from the login window's session
      const cookies = await session.defaultSession.cookies.get({
        url: this.config.serverUrl,
      });

      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

      const response = await fetch(`${this.config.serverUrl}/api/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          token: string;
          expiresAt: string;
          user?: { id: string; email: string };
        };

        this.updateState({
          isAuthenticated: true,
          token: data.token,
          userId: data.user?.id ?? null,
          email: data.user?.email ?? null,
        });

        return true;
      }

      console.error('[AuthManager] Failed to acquire token, status:', response.status);
      return false;
    } catch (error) {
      console.error('[AuthManager] Failed to acquire token:', error);
      return false;
    }
  }

  private closeLoginWindow(): void {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.destroy();
      this.loginWindow = null;
    }
  }

  private clearAuth(): void {
    this.updateState({
      isAuthenticated: false,
      token: null,
      userId: null,
      email: null,
    });
  }

  private updateState(partial: Partial<AuthState>): void {
    this.state = { ...this.state, ...partial };

    // Persist token data
    this.store.set('authToken', this.state.token);
    this.store.set('authUserId', this.state.userId);
    this.store.set('authEmail', this.state.email);

    // Notify listeners
    const snapshot = { ...this.state };
    this.listeners.forEach((handler) => {
      try {
        handler(snapshot);
      } catch (error) {
        console.error('[AuthManager] Listener error:', error);
      }
    });
  }
}

// --------------------------------------------------------------------------
// Singleton management
// --------------------------------------------------------------------------

let authManager: AuthManager | null = null;

/**
 * Initialize the AuthManager singleton. Must be called before getAuthManager.
 */
export function initializeAuthManager(config: AuthManagerConfig): AuthManager {
  if (authManager) {
    authManager.destroy();
  }
  authManager = new AuthManager(config);
  return authManager;
}

/**
 * Get the AuthManager singleton.
 */
export function getAuthManager(): AuthManager {
  if (!authManager) {
    throw new Error('[AuthManager] Not initialized. Call initializeAuthManager() first.');
  }
  return authManager;
}

/**
 * Reset (for testing).
 */
export function resetAuthManager(): void {
  if (authManager) {
    authManager.destroy();
    authManager = null;
  }
}

export { AuthManager };
