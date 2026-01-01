/**
 * Configuration Index
 * 
 * Exports all configuration modules for the VibeFlow desktop application.
 */

export {
  PRESET_DISTRACTION_APPS,
  APP_CATEGORIES,
  APP_CATEGORY_MAP,
  getAppCategory,
  getAppsByCategory,
  getPresetAppsByCategory,
  isPresetApp,
  getPresetApp,
  createCustomApp,
  mergeWithPresets,
  getDefaultActionForCategory,
  presetDistractionAppsConfig,
  type AppCategory,
  type CategoryInfo,
} from './preset-distraction-apps';
