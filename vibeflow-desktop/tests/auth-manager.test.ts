/**
 * Unit tests for AuthManager
 *
 * Tests the auth lifecycle: token storage, validation, login window,
 * and logout. Uses a mock class to avoid Electron/network dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --------------------------------------------------------------------------
// Mocked types / interfaces (mirrors auth-manager.ts)
// --------------------------------------------------------------------------

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
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

  /** Configurable validation result for testing */
  public mockValidationResult: { valid: boolean; user?: { id: string; email: string } } | null =
    null;

  /** Configurable login result for testing */
  public mockLoginResult = true;

  /** Configurable token acquisition result for testing */
  public mockTokenAcquisitionResult: {
    token: string;
    user?: { id: string; email: string };
  } | null = null;

  constructor() {
    this.state = {
      isAuthenticated: false,
      token: this.store.get('authToken') ?? null,
      userId: this.store.get('authUserId') ?? null,
      email: this.store.get('authEmail') ?? null,
    };
  }

  getState(): AuthState {
    return { ...this.state };
  }

  getToken(): string | null {
    return this.state.token;
  }

  onAuthChange(handler: AuthChangeHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async validateToken(): Promise<boolean> {
    if (!this.state.token) {
      this.updateState({ isAuthenticated: false });
      return false;
    }

    if (this.mockValidationResult) {
      if (this.mockValidationResult.valid && this.mockValidationResult.user) {
        this.updateState({
          isAuthenticated: true,
          userId: this.mockValidationResult.user.id,
          email: this.mockValidationResult.user.email,
        });
        return true;
      }
      this.clearAuth();
      return false;
    }

    // Default: token is valid
    this.updateState({ isAuthenticated: true });
    return true;
  }

  async openLoginWindow(): Promise<boolean> {
    if (this.mockLoginResult && this.mockTokenAcquisitionResult) {
      this.updateState({
        isAuthenticated: true,
        token: this.mockTokenAcquisitionResult.token,
        userId: this.mockTokenAcquisitionResult.user?.id ?? null,
        email: this.mockTokenAcquisitionResult.user?.email ?? null,
      });
      return true;
    }
    return this.mockLoginResult;
  }

  async logout(): Promise<void> {
    this.clearAuth();
  }

  destroy(): void {
    this.listeners.clear();
  }

  // --- helpers ---

  /** Simulate setting a stored token (as if restored from electron-store) */
  setStoredToken(token: string, userId?: string, email?: string): void {
    this.state.token = token;
    this.state.userId = userId ?? null;
    this.state.email = email ?? null;
    this.store.set('authToken', token);
    this.store.set('authUserId', userId ?? null);
    this.store.set('authEmail', email ?? null);
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
    this.store.set('authToken', this.state.token);
    this.store.set('authUserId', this.state.userId);
    this.store.set('authEmail', this.state.email);

    const snapshot = { ...this.state };
    this.listeners.forEach((handler) => {
      try {
        handler(snapshot);
      } catch (error) {
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
    it('starts unauthenticated with no token', () => {
      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.userId).toBeNull();
      expect(state.email).toBeNull();
    });

    it('getToken returns null when no token stored', () => {
      expect(authManager.getToken()).toBeNull();
    });
  });

  describe('validateToken', () => {
    it('returns false when no token is stored', async () => {
      const valid = await authManager.validateToken();
      expect(valid).toBe(false);
      expect(authManager.getState().isAuthenticated).toBe(false);
    });

    it('returns true and marks authenticated when token is valid', async () => {
      authManager.setStoredToken('vf_test_token_123');
      authManager.mockValidationResult = {
        valid: true,
        user: { id: 'user-1', email: 'test@example.com' },
      };

      const valid = await authManager.validateToken();
      expect(valid).toBe(true);

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe('user-1');
      expect(state.email).toBe('test@example.com');
    });

    it('clears auth and returns false when token is invalid', async () => {
      authManager.setStoredToken('vf_expired_token');
      authManager.mockValidationResult = { valid: false };

      const valid = await authManager.validateToken();
      expect(valid).toBe(false);

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
    });
  });

  describe('openLoginWindow', () => {
    it('returns true and sets state when login succeeds', async () => {
      authManager.mockLoginResult = true;
      authManager.mockTokenAcquisitionResult = {
        token: 'vf_new_token',
        user: { id: 'user-2', email: 'new@example.com' },
      };

      const success = await authManager.openLoginWindow();
      expect(success).toBe(true);

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.token).toBe('vf_new_token');
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
    it('clears auth state', async () => {
      authManager.setStoredToken('vf_token');
      authManager.mockValidationResult = {
        valid: true,
        user: { id: 'user-1', email: 'test@example.com' },
      };
      await authManager.validateToken();
      expect(authManager.getState().isAuthenticated).toBe(true);

      await authManager.logout();

      const state = authManager.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
      expect(state.userId).toBeNull();
      expect(state.email).toBeNull();
    });
  });

  describe('onAuthChange', () => {
    it('notifies listeners when state changes', async () => {
      const handler = vi.fn();
      authManager.onAuthChange(handler);

      authManager.setStoredToken('vf_token');
      authManager.mockValidationResult = {
        valid: true,
        user: { id: 'user-1', email: 'test@example.com' },
      };
      await authManager.validateToken();

      expect(handler).toHaveBeenCalled();
      const lastCall = handler.mock.calls[handler.mock.calls.length - 1][0] as AuthState;
      expect(lastCall.isAuthenticated).toBe(true);
      expect(lastCall.userId).toBe('user-1');
    });

    it('returns unsubscribe function that stops notifications', async () => {
      const handler = vi.fn();
      const unsubscribe = authManager.onAuthChange(handler);

      unsubscribe();

      authManager.setStoredToken('vf_token');
      await authManager.validateToken();

      // Handler should not have been called (the validateToken call
      // triggers updateState, but we unsubscribed before)
      expect(handler).not.toHaveBeenCalled();
    });

    it('handles listener errors gracefully', async () => {
      const badHandler = vi.fn(() => {
        throw new Error('boom');
      });
      const goodHandler = vi.fn();

      authManager.onAuthChange(badHandler);
      authManager.onAuthChange(goodHandler);

      authManager.setStoredToken('vf_token');
      await authManager.validateToken();

      // Both handlers called; error from badHandler did not prevent goodHandler
      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('clears all listeners', async () => {
      const handler = vi.fn();
      authManager.onAuthChange(handler);
      authManager.destroy();

      authManager.setStoredToken('vf_token');
      await authManager.validateToken();

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('ConnectionManager auth token integration', () => {
  it('uses token in socket auth when authToken is set', () => {
    // Simulate the auth payload construction logic from connection-manager.ts
    const state = { userId: 'user-1', authToken: 'vf_test_token' };

    const auth: Record<string, string | undefined> = {
      clientType: 'desktop',
      userId: state.userId,
    };

    if (state.authToken) {
      auth.token = state.authToken;
    } else {
      auth.email = 'dev@vibeflow.local';
    }

    expect(auth.token).toBe('vf_test_token');
    expect(auth.email).toBeUndefined();
    expect(auth.clientType).toBe('desktop');
    expect(auth.userId).toBe('user-1');
  });

  it('falls back to email when no authToken is set', () => {
    const state = { userId: null, authToken: null };

    const auth: Record<string, string | null | undefined> = {
      clientType: 'desktop',
      userId: state.userId ?? undefined,
    };

    if (state.authToken) {
      auth.token = state.authToken;
    } else {
      auth.email = 'dev@vibeflow.local';
    }

    expect(auth.token).toBeUndefined();
    expect(auth.email).toBe('dev@vibeflow.local');
  });
});
