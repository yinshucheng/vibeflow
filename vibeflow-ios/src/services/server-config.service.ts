/**
 * Server Config Service
 *
 * Manages the user-configurable server URL, persisted in AsyncStorage.
 * When the user changes the URL in Settings, the app reconnects to the new server.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@/config';

const STORAGE_KEY = '@vibeflow/server_url';

class ServerConfigService {
  private cachedUrl: string | null = null;

  /**
   * Get the active server URL.
   * Priority: AsyncStorage override > config default (env var / hardcoded)
   */
  async getServerUrl(): Promise<string> {
    if (this.cachedUrl !== null) return this.cachedUrl;

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        console.log('[ServerConfig] Using stored URL:', stored);
        this.cachedUrl = stored;
        return stored;
      }
    } catch (error) {
      console.error('[ServerConfig] Failed to read stored URL:', error);
    }

    console.log('[ServerConfig] Using default URL:', SERVER_URL);
    this.cachedUrl = SERVER_URL;
    return SERVER_URL;
  }

  /**
   * Get the cached URL synchronously (available after first getServerUrl call).
   * Falls back to config default if cache not populated.
   */
  getServerUrlSync(): string {
    return this.cachedUrl ?? SERVER_URL;
  }

  /**
   * Save a new server URL. Pass null to reset to default.
   */
  async setServerUrl(url: string | null): Promise<void> {
    try {
      if (url) {
        // Normalize: remove trailing slash
        const normalized = url.replace(/\/+$/, '');
        await AsyncStorage.setItem(STORAGE_KEY, normalized);
        this.cachedUrl = normalized;
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
        this.cachedUrl = SERVER_URL;
      }
    } catch (error) {
      console.error('[ServerConfig] Failed to save URL:', error);
      throw error;
    }
  }

  /**
   * Check if a custom URL is set (not using default).
   */
  isCustomUrl(): boolean {
    return this.cachedUrl !== null && this.cachedUrl !== SERVER_URL;
  }

  /**
   * Get the default URL from config (for display).
   */
  getDefaultUrl(): string {
    return SERVER_URL;
  }
}

export const serverConfigService = new ServerConfigService();
