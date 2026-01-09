/**
 * Settings Persistence
 *
 * Key-value store for app settings, preferences, and API test state.
 */

import { db, type SettingsRecord } from './index';

// ============================================================================
// Settings Keys
// ============================================================================

/**
 * Well-known settings keys used throughout the app
 */
export const SETTINGS_KEYS = {
  // API Test page settings
  API_TEST_ENDPOINT: 'apiTest:endpoint',
  API_TEST_API_KEY: 'apiTest:apiKey',
  API_TEST_MODEL: 'apiTest:model',
  API_TEST_TEMPERATURE: 'apiTest:temperature',
  API_TEST_MAX_TOKENS: 'apiTest:maxTokens',
  API_TEST_TOP_P: 'apiTest:topP',
  API_TEST_STREAMING: 'apiTest:streaming',
  API_TEST_STOP_SEQUENCES: 'apiTest:stopSequences',
  API_TEST_SYSTEM_PROMPT: 'apiTest:systemPrompt',
  API_TEST_MESSAGES: 'apiTest:messages',

  // App preferences
  PREFERENCES_ACTIVE_PAGE: 'preferences:activePage',
  PREFERENCES_SHOW_SETTINGS: 'preferences:showSettings'
} as const;

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Save a setting to the database
 */
export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const record: SettingsRecord = {
    key,
    value: JSON.stringify(value),
    updatedAt: Date.now()
  };

  await db.settings.put(record);
}

/**
 * Load a setting from the database
 * Returns defaultValue if the setting doesn't exist
 */
export async function loadSetting<T>(key: string, defaultValue: T): Promise<T> {
  const record = await db.settings.get(key);
  if (!record) return defaultValue;

  try {
    return JSON.parse(record.value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Delete a setting from the database
 */
export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key);
}

/**
 * Check if a setting exists
 */
export async function settingExists(key: string): Promise<boolean> {
  const count = await db.settings.where('key').equals(key).count();
  return count > 0;
}

/**
 * Get all settings matching a prefix (e.g., 'apiTest:')
 */
export async function getSettingsByPrefix(prefix: string): Promise<Record<string, unknown>> {
  const records = await db.settings
    .filter(record => record.key.startsWith(prefix))
    .toArray();

  const result: Record<string, unknown> = {};
  for (const record of records) {
    try {
      result[record.key] = JSON.parse(record.value);
    } catch {
      // Skip invalid JSON
    }
  }
  return result;
}

/**
 * Delete all settings matching a prefix
 */
export async function deleteSettingsByPrefix(prefix: string): Promise<void> {
  await db.settings
    .filter(record => record.key.startsWith(prefix))
    .delete();
}

/**
 * Clear all settings from the database
 */
export async function clearAllSettings(): Promise<void> {
  await db.settings.clear();
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Save multiple settings at once
 */
export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  const now = Date.now();
  const records: SettingsRecord[] = Object.entries(settings).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updatedAt: now
  }));

  await db.settings.bulkPut(records);
}

/**
 * Load multiple settings at once
 * Returns an object with the requested keys and their values (or defaults)
 */
export async function loadSettings<T extends Record<string, unknown>>(
  defaults: T
): Promise<T> {
  const keys = Object.keys(defaults);
  const records = await db.settings.bulkGet(keys);

  const result = { ...defaults };
  for (let i = 0; i < keys.length; i++) {
    const record = records[i];
    if (record) {
      try {
        (result as Record<string, unknown>)[keys[i]] = JSON.parse(record.value);
      } catch {
        // Keep default value
      }
    }
  }

  return result;
}
