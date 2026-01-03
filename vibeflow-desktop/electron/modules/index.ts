/**
 * Electron Modules Index
 * 
 * Exports all modules for the VibeFlow desktop application.
 */

// Focus Enforcer Module
export {
  FocusEnforcer,
  getFocusEnforcer,
  resetFocusEnforcer,
  setupFocusEnforcerIpc,
  focusEnforcerService,
  shouldTriggerIntervention,
  getInterventionAction,
  shouldRepeatIntervention,
  isWithinWorkHours,
  parseTimeToMinutes,
  getCurrentTimeMinutes,
  type FocusEnforcerConfig,
  type FocusEnforcerState,
  type WorkTimeSlot,
  type SkipTokenConfig,
  type InterventionAction,
  type InterventionCallback,
} from './focus-enforcer';

// Enforcement Mode Module
export {
  enforcementModeService,
  getModeBehavior,
  getBrowserBlockingBehavior,
  getSkipTokenLimits,
  canSwitchMode,
  isValidEnforcementMode,
  getModeDisplayName,
  getModeDescription,
  DEFAULT_ENFORCEMENT_CONFIG,
  type EnforcementMode,
  type EnforcementModeConfig,
  type ModeBehavior,
  type BrowserBlockingBehavior,
} from './enforcement-mode';

// App Controller Module (macOS)
export {
  appControllerService,
  getRunningApps,
  isAppRunning,
  quitApp,
  quitAppByName,
  hideApp,
  hideAppByName,
  activateApp,
  getFrontmostApp,
  closeDistractionApps,
  getRunningDistractionApps,
} from './app-controller';

// Permissions Module (macOS)
export {
  permissionsService,
  checkAccessibilityPermission,
  checkNotificationsPermission,
  checkAllPermissions,
  requestAccessibilityPermission,
  openAccessibilityPreferences,
  openNotificationsPreferences,
  showPermissionExplanation,
  showPermissionSetupGuide,
  showPermissionMissingWarning,
  isAppControlAvailable,
  getUnavailableFeatures,
  PERMISSION_DESCRIPTIONS,
  type PermissionType,
  type PermissionStatus,
  type PermissionCheckResult,
  type PermissionGuideStep,
} from './permissions';

// Tray Manager Module
export {
  TrayManager,
  getTrayManager,
  resetTrayManager,
  type TrayMenuState,
  type TrayManagerConfig,
} from './tray-manager';

// Notification Manager Module
export {
  NotificationManager,
  getNotificationManager,
  resetNotificationManager,
  type NotificationType,
  type NotificationOptions,
  type NotificationAction,
  type NotificationCallbacks,
} from './notification-manager';

// Auto-Launch Manager Module
export {
  AutoLaunchManager,
  getAutoLaunchManager,
  resetAutoLaunchManager,
  type AutoLaunchConfig,
  type AutoLaunchStatus,
  type AutoLaunchResult,
} from './auto-launch-manager';

// Connection Manager Module (Requirements: 1.7)
export {
  ConnectionManager,
  getConnectionManager,
  initializeConnectionManager,
  type ConnectionStatus,
  type ConnectionEvent,
  type ConnectionManagerConfig,
  type RetryStrategy,
  type SecurityConfig,
  type CertificateInfo,
} from './connection-manager';

// Sensor Reporter Module (Requirements: 4.1-4.5)
export {
  SensorReporter,
  getSensorReporter,
  resetSensorReporter,
  type SensorReporterConfig,
} from './sensor-reporter';

// Sleep Enforcer Module (Requirements: 11.1-11.5)
export {
  SleepEnforcer,
  getSleepEnforcer,
  resetSleepEnforcer,
  setupSleepEnforcerIpc,
  sleepEnforcerService,
  isTimeInSleepWindow,
  type SleepEnforcerConfig,
  type SleepEnforcerState,
  type SnoozeRequestCallback,
} from './sleep-enforcer';

// App Monitor Module (Unified app monitoring for sleep and focus enforcement)
export {
  AppMonitor,
  appMonitorService,
  createSleepTimeMonitor,
  createFocusTimeMonitor,
  type MonitoredApp,
  type AppMonitorConfig,
  type EnforcementResult,
  type EnforcementCallback,
} from './app-monitor';

// Over Rest Enforcer Module (Requirements: 15.2, 15.3, 16.1-16.5)
export {
  getOverRestEnforcer,
  handleOverRestPolicyUpdate,
  type OverRestEnforcerConfig,
  type OverRestEnforcerState,
} from './over-rest-enforcer';


// Configuration
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
} from '../config';
