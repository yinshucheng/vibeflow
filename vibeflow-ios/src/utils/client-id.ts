/**
 * Client ID Generation and Persistence
 *
 * Generates and persists a unique client ID for the iOS app.
 * The client ID is used to identify this device in the Octopus protocol.
 *
 * Requirements: 1.4
 */

import * as SecureStore from 'expo-secure-store';

const CLIENT_ID_KEY = 'vibeflow_client_id';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create a unique client ID for this device.
 * The ID is persisted in secure storage and remains consistent across app sessions.
 *
 * @returns Promise<string> The client ID in format "ios_{uuid}"
 */
export async function getOrCreateClientId(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(CLIENT_ID_KEY);
    if (stored) {
      return stored;
    }

    const newId = `ios_${generateUUID()}`;
    await SecureStore.setItemAsync(CLIENT_ID_KEY, newId);
    return newId;
  } catch (error) {
    // If secure store fails, generate a new ID each time
    // This is a fallback for development/testing
    console.warn('SecureStore unavailable, generating temporary client ID');
    return `ios_${generateUUID()}`;
  }
}

/**
 * Clear the stored client ID.
 * Useful for testing or when user wants to reset device identity.
 */
export async function clearClientId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CLIENT_ID_KEY);
  } catch (error) {
    console.warn('Failed to clear client ID:', error);
  }
}

/**
 * Check if a client ID exists in storage.
 */
export async function hasClientId(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(CLIENT_ID_KEY);
    return stored !== null;
  } catch {
    return false;
  }
}
