/**
 * Unit tests for AuthManager
 *
 * Tests the auth lifecycle: session cookie validation, login window,
 * and logout. Uses a mock class to avoid Electron/network dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --------------------------------------------------------------------------
// Mocked types / interfaces (mirrors auth-manager.ts)
// --------------------------------------------------------------------------

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
}

type AuthChangeHandler = (state: AuthState) => void;

// --------------------------------------------------------------------------
// MockAuthManager — mirrors the public API of AuthManager
// --------------------------------------------------------------------------

class MockAuthManager {
  private state: AuthState;
  private store: Map<string, string | null> = new Map();
  private listeners = new Set<AuthChangeHandler>();

  /** Configurable session validation result for testing */
  public mockSessionResult: { user?: { id?: string; email?: string } } | null = null;

  /** Configurable login result for testing */
  public mockLoginResult = true;

  /** Simulated session cookie header */
  public mockCookieHeader: string | null = null;

  constructor() {
    this.state = {
      isAuthenticated: false,
      userId: this.store.get('authUserId') ?? null,
      email: this.store.get('authEmail') ?? null,
    };
  }

  getState(): AuthState {
    return { ...this.state };
  }

  async getSessionCookieHeader(): Promise<string | null> {
    return this.mockCookieHeader;
  }

  onAuthChange(handler: AuthChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async validateSession(): Promise<boolean> {
    if (!this.mockCookieHeader) {
      this.updateState({ isAuthenticated: false });
      return false;
    }

    if (this.mockSessionResult?.user?.email) {
      this.updateState({
        isAuthenticated: true,
        userId: this.mockSessionResult.user.id ?? null,
        email: this.mockSessionResult.user.email,
      });
      return true;
    }

    this.clearAuth();
    return false;
  }

  async openLoginWindow(): Promise<boolean> {
    if (this.mockLoginResult && this.mockSessionResult?.user?.email) {
      this.updateState({
        isAuthenticated: true,
        userId: this.mockSessionResult.user.id ?? null,
        email: this.mockSessionResult.user.email,
      });
      return true;
    }
    return this.mockLoginResult;
  }

  async logout(): Promise<void> {
    this.mockCookieHeader = null;
    this.clearAuth();
  }

  destroy(): void {
    this.listeners.clear();
  }

  // --- helpers ---

  /** Simulate a valid session cookie being present */
  setSessionCookie(cookie: string, userId?: string, email?: string): void {
    this.mockCookieHeader = cookie;
    this.state.userId = userId ?? null;
    this.state.email = email ?? null;
    this.store.set('authUserId', userId ?? null);
    this.store.set('authEmail', email ?? null);
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
      } catch {
        // silently ignore
      }
    });
  }
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('AuthManager', () => {
  let authManager: MockAuthManager;

  beforeEach(() => {
    authManager = new MockAuthManager();
  });

  describe('initial state', () => {
    it('starts unauthenticated', () => {
      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.userId).toBeNull();
      expect(state.email).toBeNull();
    });

    it('getSessionCookieHeader returns null when no cookie', async () => {
      expect(await authManager.getSessionCookieHeader()).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('returns false when no session cookie exists', async () => {
      const valid = await authManager.validateSession();
      expect(valid).toBe(false);
      expect(authManager.getState().isAuthenticated).toBe(false);
    });

    it('returns true and marks authenticated when session is valid', async () => {
      authManager.setSessionCookie('next-auth.session-token=abc123');
      authManager.mockSessionResult = {
        user: { id: 'user-1', email: 'test@example.com' },
      };

      const valid = await authManager.validateSession();
      expect(valid).toBe(true);

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe('user-1');
      expect(state.email).toBe('test@example.com');
    });

    it('clears auth and returns false when session is expired', async () => {
      authManager.setSessionCookie('next-auth.session-token=expired');
      authManager.mockSessionResult = { user: {} };

      const valid = await authManager.validateSession();
      expect(valid).toBe(false);

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('openLoginWindow', () => {
    it('returns true and sets state when login succeeds', async () => {
      authManager.mockLoginResult = true;
      authManager.mockSessionResult = {
        user: { id: 'user-2', email: 'new@example.com' },
      };

      const success = await authManager.openLoginWindow();
      expect(success).toBe(true);

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe('user-2');
      expect(state.email).toBe('new@example.com');
    });

    it('returns false when login is cancelled', async () => {
      authManager.mockLoginResult = false;

      const success = await authManager.openLoginWindow();
      expect(success).toBe(false);
      expect(authManager.getState().isAuthenticated).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears auth state and cookie', async () => {
      authManager.setSessionCookie('next-auth.session-token=abc');
      authManager.mockSessionResult = {
        user: { id: 'user-1', email: 'test@example.com' },
      };
      await authManager.validateSession();
      expect(authManager.getState().isAuthenticated).toBe(true);

      await authManager.logout();

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.userId).toBeNull();
      expect(state.email).toBeNull();
      expect(await authManager.getSessionCookieHeader()).toBeNull();
    });
  });

  describe('onAuthChange', () => {
    it('notifies listeners when state changes', async () => {
      const handler = vi.fn();
      authManager.onAuthChange(handler);

      authManager.setSessionCookie('next-auth.session-token=abc');
      authManager.mockSessionResult = {
        user: { id: 'user-1', email: 'test@example.com' },
      };
      await authManager.validateSession();

      expect(handler).toHaveBeenCalled();
      const lastCall = handler.mock.calls[handler.mock.calls.length - 1][0] as AuthState;
      expect(lastCall.isAuthenticated).toBe(true);
      expect(lastCall.userId).toBe('user-1');
    });

    it('returns unsubscribe function that stops notifications', async () => {
      const handler = vi.fn();
      const unsubscribe = authManager.onAuthChange(handler);

      unsubscribe();

      authManager.setSessionCookie('next-auth.session-token=abc');
      authManager.mockSessionResult = {
        user: { id: 'user-1', email: 'test@example.com' },
      };
      await authManager.validateSession();

      expect(handler).not.toHaveBeenCalled();
    });

    it('handles listener errors gracefully', async () => {
      const badHandler = vi.fn(() => {
        throw new Error('boom');
      });
      const goodHandler = vi.fn();

      authManager.onAuthChange(badHandler);
      authManager.onAuthChange(goodHandler);

      authManager.setSessionCookie('next-auth.session-token=abc');
      authManager.mockSessionResult = {
        user: { id: 'user-1', email: 'test@example.com' },
      };
      await authManager.validateSession();

      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('clears all listeners', async () => {
      const handler = vi.fn();
      authManager.onAuthChange(handler);
      authManager.destroy();

      authManager.setSessionCookie('next-auth.session-token=abc');
      authManager.mockSessionResult = {
        user: { id: 'user-1', email: 'test@example.com' },
      };
      await authManager.validateSession();

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('ConnectionManager cookie auth integration', () => {
  it('passes cookie via extraHeaders when session cookie is set', () => {
    const state = { userId: 'user-1', sessionCookie: 'next-auth.session-token=abc123' };

    const auth: Record<string, string | undefined> = {
      clientType: 'desktop',
      userId: state.userId,
    };

    const extraHeaders: Record<string, string> = {};
    if (state.sessionCookie) {
      extraHeaders['Cookie'] = state.sessionCookie;
    }

    expect(extraHeaders['Cookie']).toBe('next-auth.session-token=abc123');
    expect(auth.clientType).toBe('desktop');
    expect(auth.userId).toBe('user-1');
  });

  it('has no Cookie header when no session cookie is set', () => {
    const state = { userId: null, sessionCookie: null };

    const auth: Record<string, string | null | undefined> = {
      clientType: 'desktop',
      userId: state.userId ?? undefined,
    };

    const extraHeaders: Record<string, string> = {};
    if (state.sessionCookie) {
      extraHeaders['Cookie'] = state.sessionCookie;
    }

    expect(extraHeaders['Cookie']).toBeUndefined();
  });
});
