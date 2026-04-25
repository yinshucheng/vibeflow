/**
 * Auth Manager Module
 *
 * Manages authentication state for the VibeFlow desktop client:
 * - Session cookie management via Electron's session store
 * - Session validation against the server
 * - Login window management (loads Web /login page in a BrowserWindow)
 *
 * Design: Desktop reuses the Web login page inside a BrowserWindow.
 * After successful login, NextAuth sets a session cookie in the
 * BrowserWindow's session. The main process reads this cookie and
 * passes it to the ConnectionManager via extraHeaders for WebSocket auth.
 * This is the same auth path as the Web client — no API token needed.
 */

import { BrowserWindow, session } from 'electron';
import Store from 'electron-store';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface AuthState {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
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
        authUserId: null,
        authEmail: null,
      },
    });

    // Restore persisted auth state (userId/email for display; actual credential is the session cookie)
    this.state = {
      isAuthenticated: false,
      userId: this.store.get('authUserId') ?? null,
      email: this.store.get('authEmail') ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Read the NextAuth session cookie from Electron's session store.
   * Returns the full cookie header string, or null if no session cookie exists.
   */
  async getSessionCookieHeader(): Promise<string | null> {
    try {
      const cookies = await session.defaultSession.cookies.get({
        url: this.config.serverUrl,
      });

      const hasSessionToken = cookies.some(
        (c) => c.name === 'next-auth.session-token' || c.name === '__Secure-next-auth.session-token'
      );

      if (!hasSessionToken) return null;

      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch {
      return null;
    }
  }

  onAuthChange(handler: AuthChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Validate the session cookie against the server.
   * Calls GET /api/auth/session with the cookie to check if the session is valid.
   */
  async validateSession(): Promise<boolean> {
    const cookieHeader = await this.getSessionCookieHeader();
    if (!cookieHeader) {
      this.updateState({ isAuthenticated: false });
      return false;
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/api/auth/session`, {
        method: 'GET',
        headers: { Cookie: cookieHeader },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          user?: { id?: string; name?: string; email?: string; image?: string };
        };

        if (data?.user?.email) {
          this.updateState({
            isAuthenticated: true,
            userId: data.user.id ?? null,
            email: data.user.email,
          });
          return true;
        }
      }

      this.clearAuth();
      return false;
    } catch {
      // Network error — cookie exists in Electron session, try to connect anyway.
      // The server will validate the cookie on WebSocket handshake.
      console.warn('[AuthManager] Session validation failed (network error), will try socket connect');
      return false;
    }
  }

  /**
   * Open a BrowserWindow with the web login page.
   * After login, NextAuth sets the session cookie in the BrowserWindow's session.
   * We then validate the session to capture user info.
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

      // Use an ephemeral partition so no saved passwords carry over between logins.
      // The NextAuth cookie will be copied to defaultSession after successful login.
      const loginPartition = `login-${Date.now()}`;

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
          partition: loginPartition,
        },
      });

      const loginUrl = `${this.config.serverUrl}/login`;
      this.loginWindow.loadURL(loginUrl);

      // Watch for navigation away from /login (indicates successful login).
      // Use both did-navigate (same-page) and did-navigate-in-page (SPA routing)
      // to handle all redirect patterns.
      const handleNavigation = async (url: string) => {
        console.log('[AuthManager] Navigation detected:', url);
        const parsed = new URL(url);
        if (
          parsed.pathname !== '/login' &&
          parsed.pathname !== '/register' &&
          !parsed.pathname.startsWith('/api/auth')
        ) {
          console.log('[AuthManager] Login succeeded, copying cookie to default session…');
          // Copy session cookie from login partition to defaultSession
          await this.copySessionCookieToDefault(loginPartition);
          const sessionValid = await this.validateSession();
          console.log('[AuthManager] Session valid:', sessionValid);
          if (sessionValid) {
            this.closeLoginWindow();
            resolve(true);
          }
        }
      };

      this.loginWindow.webContents.on('did-navigate', (_event, url) => handleNavigation(url));
      this.loginWindow.webContents.on('did-navigate-in-page', (_event, url) => handleNavigation(url));

      this.loginWindow.on('closed', () => {
        this.loginWindow = null;
        if (!this.state.isAuthenticated) {
          resolve(false);
        }
      });
    });
  }

  /**
   * Log out: clear the session cookies from Electron's session store.
   */
  async logout(): Promise<void> {
    try {
      const serverUrl = this.config.serverUrl;
      await session.defaultSession.cookies.remove(serverUrl, 'next-auth.session-token');
      await session.defaultSession.cookies.remove(serverUrl, '__Secure-next-auth.session-token');
      // Clear saved form data and auth cache so login window doesn't auto-fill
      await session.defaultSession.clearAuthCache();
      await session.defaultSession.clearStorageData({
        origin: serverUrl,
        storages: ['localstorage'],
      });
    } catch {
      // Best-effort
    }

    this.clearAuth();
  }

  destroy(): void {
    this.closeLoginWindow();
    this.listeners.clear();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Copy the NextAuth session cookie from a login partition to defaultSession.
   */
  private async copySessionCookieToDefault(partition: string): Promise<void> {
    try {
      const loginSession = session.fromPartition(partition);
      const cookies = await loginSession.cookies.get({ url: this.config.serverUrl });

      for (const cookie of cookies) {
        if (cookie.name === 'next-auth.session-token' || cookie.name === '__Secure-next-auth.session-token') {
          await session.defaultSession.cookies.set({
            url: this.config.serverUrl,
            name: cookie.name,
            value: cookie.value,
            path: cookie.path || '/',
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            expirationDate: cookie.expirationDate,
            sameSite: cookie.sameSite || 'lax',
          });
          console.log('[AuthManager] Copied session cookie to defaultSession:', cookie.name);
        }
      }
    } catch (error) {
      console.error('[AuthManager] Failed to copy session cookie:', error);
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
      userId: null,
      email: null,
    });
  }

  private updateState(partial: Partial<AuthState>): void {
    this.state = { ...this.state, ...partial };

    this.store.set('authUserId', this.state.userId);
    this.store.set('authEmail', this.state.email);

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

export function initializeAuthManager(config: AuthManagerConfig): AuthManager {
  if (authManager) {
    authManager.destroy();
  }
  authManager = new AuthManager(config);
  return authManager;
}

export function getAuthManager(): AuthManager {
  if (!authManager) {
    throw new Error('[AuthManager] Not initialized. Call initializeAuthManager() first.');
  }
  return authManager;
}

export function resetAuthManager(): void {
  if (authManager) {
    authManager.destroy();
    authManager = null;
  }
}

export { AuthManager };
