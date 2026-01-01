/**
 * Preset Distraction Apps Configuration
 * 
 * Defines a list of commonly used applications that are typically
 * considered distractions during focus sessions.
 * 
 * Requirements: 3.1, 3.7
 */

import type { DistractionApp } from '../types';

// ============================================================================
// Preset Distraction Apps
// ============================================================================

/**
 * Preset list of common distraction applications for macOS
 * Requirements: 3.1
 * 
 * These are organized by category for easier management.
 * Users can add/remove apps from this list in their settings.
 */
export const PRESET_DISTRACTION_APPS: DistractionApp[] = [
  // ============================================================================
  // Social & Messaging
  // ============================================================================
  {
    bundleId: 'com.tencent.xinWeChat',
    name: 'WeChat',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.apple.MobileSMS',
    name: 'Messages',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.slack.Slack',
    name: 'Slack',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.hnc.Discord',
    name: 'Discord',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'ru.keepcoder.Telegram',
    name: 'Telegram',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.facebook.Messenger',
    name: 'Messenger',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.skype.skype',
    name: 'Skype',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'us.zoom.xos',
    name: 'Zoom',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.microsoft.teams',
    name: 'Microsoft Teams',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.whatsapp.WhatsApp',
    name: 'WhatsApp',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.line.LineClient',
    name: 'LINE',
    action: 'hide_window',
    isPreset: true,
  },

  // ============================================================================
  // Music & Audio
  // ============================================================================
  {
    bundleId: 'com.spotify.client',
    name: 'Spotify',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.apple.Music',
    name: 'Music',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.apple.podcasts',
    name: 'Podcasts',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.netease.163music',
    name: 'NetEase Music',
    action: 'hide_window',
    isPreset: true,
  },
  {
    bundleId: 'com.tencent.QQMusicMac',
    name: 'QQ Music',
    action: 'hide_window',
    isPreset: true,
  },

  // ============================================================================
  // Video & Entertainment
  // ============================================================================
  {
    bundleId: 'com.bilibili.app.mac',
    name: 'Bilibili',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.netflix.Netflix',
    name: 'Netflix',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.apple.TV',
    name: 'Apple TV',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.google.Chrome.app.YouTube',
    name: 'YouTube (Chrome App)',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.iqiyi.player',
    name: 'iQIYI',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.youku.mac',
    name: 'Youku',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'tv.twitch.TwitchApp',
    name: 'Twitch',
    action: 'force_quit',
    isPreset: true,
  },

  // ============================================================================
  // Gaming
  // ============================================================================
  {
    bundleId: 'com.valvesoftware.steam',
    name: 'Steam',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.epicgames.EpicGamesLauncher',
    name: 'Epic Games Launcher',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.blizzard.bna',
    name: 'Battle.net',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.riotgames.LeagueofLegends.LeagueClient',
    name: 'League of Legends',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.apple.Chess',
    name: 'Chess',
    action: 'force_quit',
    isPreset: true,
  },

  // ============================================================================
  // Social Media
  // ============================================================================
  {
    bundleId: 'com.twitter.twitter-mac',
    name: 'Twitter',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.facebook.Facebook',
    name: 'Facebook',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.burbn.instagram',
    name: 'Instagram',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.zhihu.mac',
    name: 'Zhihu',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.reddit.Reddit',
    name: 'Reddit',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.tiktok.TikTok',
    name: 'TikTok',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.ss.mac.ugc.AwemeMac',
    name: 'Douyin',
    action: 'force_quit',
    isPreset: true,
  },
  {
    bundleId: 'com.sina.weibo',
    name: 'Weibo',
    action: 'force_quit',
    isPreset: true,
  },
];

// ============================================================================
// Category Definitions
// ============================================================================

/**
 * App categories for organization and filtering
 */
export type AppCategory = 
  | 'social_messaging'
  | 'music_audio'
  | 'video_entertainment'
  | 'gaming'
  | 'social_media'
  | 'other';

/**
 * Category metadata
 */
export interface CategoryInfo {
  id: AppCategory;
  name: string;
  description: string;
  defaultAction: 'force_quit' | 'hide_window';
}

/**
 * Category definitions
 */
export const APP_CATEGORIES: CategoryInfo[] = [
  {
    id: 'social_messaging',
    name: 'Social & Messaging',
    description: 'Chat and communication apps',
    defaultAction: 'hide_window',
  },
  {
    id: 'music_audio',
    name: 'Music & Audio',
    description: 'Music players and audio apps',
    defaultAction: 'hide_window',
  },
  {
    id: 'video_entertainment',
    name: 'Video & Entertainment',
    description: 'Video streaming and entertainment apps',
    defaultAction: 'force_quit',
  },
  {
    id: 'gaming',
    name: 'Gaming',
    description: 'Games and game launchers',
    defaultAction: 'force_quit',
  },
  {
    id: 'social_media',
    name: 'Social Media',
    description: 'Social networking apps',
    defaultAction: 'force_quit',
  },
  {
    id: 'other',
    name: 'Other',
    description: 'Other distraction apps',
    defaultAction: 'hide_window',
  },
];

/**
 * Map of bundle IDs to categories
 */
export const APP_CATEGORY_MAP: Record<string, AppCategory> = {
  // Social & Messaging
  'com.tencent.xinWeChat': 'social_messaging',
  'com.apple.MobileSMS': 'social_messaging',
  'com.slack.Slack': 'social_messaging',
  'com.hnc.Discord': 'social_messaging',
  'ru.keepcoder.Telegram': 'social_messaging',
  'com.facebook.Messenger': 'social_messaging',
  'com.skype.skype': 'social_messaging',
  'us.zoom.xos': 'social_messaging',
  'com.microsoft.teams': 'social_messaging',
  'com.whatsapp.WhatsApp': 'social_messaging',
  'com.line.LineClient': 'social_messaging',
  
  // Music & Audio
  'com.spotify.client': 'music_audio',
  'com.apple.Music': 'music_audio',
  'com.apple.podcasts': 'music_audio',
  'com.netease.163music': 'music_audio',
  'com.tencent.QQMusicMac': 'music_audio',
  
  // Video & Entertainment
  'com.bilibili.app.mac': 'video_entertainment',
  'com.netflix.Netflix': 'video_entertainment',
  'com.apple.TV': 'video_entertainment',
  'com.google.Chrome.app.YouTube': 'video_entertainment',
  'com.iqiyi.player': 'video_entertainment',
  'com.youku.mac': 'video_entertainment',
  'tv.twitch.TwitchApp': 'video_entertainment',
  
  // Gaming
  'com.valvesoftware.steam': 'gaming',
  'com.epicgames.EpicGamesLauncher': 'gaming',
  'com.blizzard.bna': 'gaming',
  'com.riotgames.LeagueofLegends.LeagueClient': 'gaming',
  'com.apple.Chess': 'gaming',
  
  // Social Media
  'com.twitter.twitter-mac': 'social_media',
  'com.facebook.Facebook': 'social_media',
  'com.burbn.instagram': 'social_media',
  'com.zhihu.mac': 'social_media',
  'com.reddit.Reddit': 'social_media',
  'com.tiktok.TikTok': 'social_media',
  'com.ss.mac.ugc.AwemeMac': 'social_media',
  'com.sina.weibo': 'social_media',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the category for an app by bundle ID
 */
export function getAppCategory(bundleId: string): AppCategory {
  return APP_CATEGORY_MAP[bundleId] || 'other';
}

/**
 * Get apps by category
 */
export function getAppsByCategory(category: AppCategory): DistractionApp[] {
  return PRESET_DISTRACTION_APPS.filter(
    app => getAppCategory(app.bundleId) === category
  );
}

/**
 * Get all preset apps grouped by category
 */
export function getPresetAppsByCategory(): Record<AppCategory, DistractionApp[]> {
  const result: Record<AppCategory, DistractionApp[]> = {
    social_messaging: [],
    music_audio: [],
    video_entertainment: [],
    gaming: [],
    social_media: [],
    other: [],
  };
  
  for (const app of PRESET_DISTRACTION_APPS) {
    const category = getAppCategory(app.bundleId);
    result[category].push(app);
  }
  
  return result;
}

/**
 * Check if an app is in the preset list
 */
export function isPresetApp(bundleId: string): boolean {
  return PRESET_DISTRACTION_APPS.some(app => app.bundleId === bundleId);
}

/**
 * Get a preset app by bundle ID
 */
export function getPresetApp(bundleId: string): DistractionApp | undefined {
  return PRESET_DISTRACTION_APPS.find(app => app.bundleId === bundleId);
}

/**
 * Create a custom distraction app entry
 */
export function createCustomApp(
  bundleId: string,
  name: string,
  action: 'force_quit' | 'hide_window' = 'hide_window'
): DistractionApp {
  return {
    bundleId,
    name,
    action,
    isPreset: false,
  };
}

/**
 * Merge user's custom apps with preset apps
 * User's custom settings override preset defaults
 */
export function mergeWithPresets(
  userApps: DistractionApp[]
): DistractionApp[] {
  const userAppMap = new Map(userApps.map(app => [app.bundleId, app]));
  const result: DistractionApp[] = [];
  
  // Add preset apps (with user overrides if any)
  for (const presetApp of PRESET_DISTRACTION_APPS) {
    const userApp = userAppMap.get(presetApp.bundleId);
    if (userApp) {
      // User has customized this preset app
      result.push({ ...userApp, isPreset: true });
      userAppMap.delete(presetApp.bundleId);
    } else {
      result.push(presetApp);
    }
  }
  
  // Add remaining custom apps
  userAppMap.forEach((customApp) => {
    result.push({ ...customApp, isPreset: false });
  });
  
  return result;
}

/**
 * Get the default action for a category
 */
export function getDefaultActionForCategory(
  category: AppCategory
): 'force_quit' | 'hide_window' {
  const categoryInfo = APP_CATEGORIES.find(c => c.id === category);
  return categoryInfo?.defaultAction || 'hide_window';
}

// ============================================================================
// Export
// ============================================================================

export const presetDistractionAppsConfig = {
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
};

export default presetDistractionAppsConfig;
