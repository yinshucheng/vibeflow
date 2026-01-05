/**
 * Policy Cache Service
 *
 * Provides read-only state caching using AsyncStorage.
 * Cache is used for offline viewing only - no write operations to server.
 *
 * Requirements: 7.1, 7.3, 7.6, 7.7
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CachedState,
  DailyStateData,
  ActivePomodoroData,
  TaskData,
  PolicyData,
} from '@/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_KEY = '@vibeflow/cached_state';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// CACHE SERVICE INTERFACE
// =============================================================================

export interface CacheService {
  /**
   * Save state to cache
   * @param state The state to cache
   */
  saveState(state: CachedState): Promise<void>;

  /**
   * Load cached state
   * @returns Cached state or null if not found/expired
   */
  loadState(): Promise<CachedState | null>;

  /**
   * Check if cached state is expired
   * @param cachedAt Timestamp when state was cached
   * @returns true if expired (older than 24 hours)
   */
  isExpired(cachedAt: number): boolean;

  /**
   * Clear all cached data
   */
  clearCache(): Promise<void>;

  /**
   * Create a CachedState from current app state
   */
  createCachedState(
    dailyState: DailyStateData,
    activePomodoro: ActivePomodoroData | null,
    todayTasks: TaskData[],
    policy: PolicyData
  ): CachedState;
}

// =============================================================================
// CACHE SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Check if a timestamp is expired (older than 24 hours)
 * @param cachedAt Unix timestamp when state was cached
 * @returns true if expired
 */
export function isExpired(cachedAt: number): boolean {
  const now = Date.now();
  return now - cachedAt > CACHE_EXPIRY_MS;
}

/**
 * Create a CachedState object from app state components
 */
export function createCachedState(
  dailyState: DailyStateData,
  activePomodoro: ActivePomodoroData | null,
  todayTasks: TaskData[],
  policy: PolicyData
): CachedState {
  return {
    dailyState,
    activePomodoro,
    todayTasks,
    policy,
    cachedAt: Date.now(),
  };
}

/**
 * Validate that a cached state object has all required fields
 */
function isValidCachedState(obj: unknown): obj is CachedState {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const state = obj as Record<string, unknown>;

  // Check required fields exist
  if (!state.dailyState || typeof state.dailyState !== 'object') {
    return false;
  }

  if (!Array.isArray(state.todayTasks)) {
    return false;
  }

  if (!state.policy || typeof state.policy !== 'object') {
    return false;
  }

  if (typeof state.cachedAt !== 'number') {
    return false;
  }

  // activePomodoro can be null
  if (state.activePomodoro !== null && typeof state.activePomodoro !== 'object') {
    return false;
  }

  return true;
}

/**
 * Cache service singleton
 */
export const cacheService: CacheService = {
  /**
   * Save state to AsyncStorage
   * Requirements: 7.1, 7.3
   */
  async saveState(state: CachedState): Promise<void> {
    try {
      const jsonValue = JSON.stringify(state);
      await AsyncStorage.setItem(CACHE_KEY, jsonValue);
    } catch (error) {
      console.error('[CacheService] Failed to save state:', error);
      throw error;
    }
  },

  /**
   * Load cached state from AsyncStorage
   * Returns null if not found, invalid, or expired
   * Requirements: 7.1, 7.6
   */
  async loadState(): Promise<CachedState | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(CACHE_KEY);
      
      if (jsonValue === null) {
        return null;
      }

      const parsed = JSON.parse(jsonValue);

      // Validate structure
      if (!isValidCachedState(parsed)) {
        console.warn('[CacheService] Invalid cached state structure, clearing cache');
        await this.clearCache();
        return null;
      }

      // Check expiry
      if (isExpired(parsed.cachedAt)) {
        console.info('[CacheService] Cached state expired, clearing cache');
        await this.clearCache();
        return null;
      }

      return parsed;
    } catch (error) {
      console.error('[CacheService] Failed to load state:', error);
      return null;
    }
  },

  /**
   * Check if cached state is expired
   * Requirements: 7.6
   */
  isExpired,

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('[CacheService] Failed to clear cache:', error);
      throw error;
    }
  },

  /**
   * Create a CachedState from current app state
   * Requirements: 7.3
   */
  createCachedState,
};

// =============================================================================
// EXPORTS
// =============================================================================

export { CACHE_KEY, CACHE_EXPIRY_MS };

