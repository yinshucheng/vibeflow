import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Type definitions for the exposed API
export interface ElectronMainConfig {
  serverUrl: string;
  isDevelopment: boolean;
  autoLaunch: boolean;
}

// Connection status types (Requirements: 1.7)
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ConnectionInfo {
  status: ConnectionStatus;
  serverUrl: string;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
  nextRetryIn: number | null;
  error: string | null;
  isSecure: boolean;
  certificateInfo: CertificateInfo | null;
}

export interface ConnectionEvent {
  status: ConnectionStatus;
  previousStatus?: ConnectionStatus;
  timestamp: number;
  error?: string;
  attemptNumber?: number;
  nextRetryIn?: number;
}

// Security types (Requirements: 9.4, 9.5, 9.6)
export interface SecurityConfig {
  useSecureConnection: boolean;
  verifyCertificate: boolean;
  rejectUnauthorized: boolean;
  minTLSVersion: 'TLSv1.2' | 'TLSv1.3';
}

export interface CertificateInfo {
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  isValid: boolean;
}

export interface CertificateVerificationResult {
  valid: boolean;
  info: CertificateInfo | null;
  error?: string;
}

export interface AppControlResult {
  success: boolean;
  error?: string;
}

export interface RunningApp {
  bundleId: string;
  name: string;
  pid: number;
  isActive: boolean;
}

// Tray menu state for dynamic updates
// Enhanced to support system state display and rest time tracking
export interface TrayMenuState {
  // Existing fields
  pomodoroActive: boolean;
  pomodoroTimeRemaining?: string; // MM:SS format (e.g., "15:30")
  currentTask?: string;
  isWithinWorkHours: boolean; // Reserved for future use
  skipTokensRemaining: number;
  enforcementMode: 'strict' | 'gentle';
  /** Current app mode (development, staging, production) */
  appMode?: 'development' | 'staging' | 'production';
  /** Whether demo mode is active */
  isInDemoMode?: boolean;
  
  // New fields for enhanced functionality
  /** Current system state for non-pomodoro display */
  systemState: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST' | 'OVER_REST';
  /** Rest countdown time in MM:SS format (pre-formatted) */
  restTimeRemaining?: string;
  /** Over-rest duration display (e.g., "15 min") (pre-formatted) */
  overRestDuration?: string;
  /** Daily pomodoro progress (e.g., "3/6") */
  dailyProgress?: string;
  /** Whether it's sleep time */
  isInSleepTime?: boolean;
}

// Work time slot configuration
export interface WorkTimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

// Skip token configuration
export interface SkipTokenConfig {
  dailyLimit: number;
  maxDelayMinutes: number;
  usedToday: number;
  lastResetDate: string;
}

// Distraction app configuration
export interface DistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
  isPreset: boolean;
}

// App category type
export type AppCategory = 
  | 'social_messaging'
  | 'music_audio'
  | 'video_entertainment'
  | 'gaming'
  | 'social_media'
  | 'other';

// Category info
export interface CategoryInfo {
  id: AppCategory;
  name: string;
  description: string;
  defaultAction: 'force_quit' | 'hide_window';
}

// Focus enforcer configuration
export interface FocusEnforcerConfig {
  workTimeSlots: WorkTimeSlot[];
  maxIdleMinutes: number;
  enforcementMode: 'strict' | 'gentle';
  repeatIntervalMinutes: number;
  distractionApps: DistractionApp[];
  skipTokens: SkipTokenConfig;
}

// Focus enforcer state
export interface FocusEnforcerState {
  isMonitoring: boolean;
  isWithinWorkHours: boolean;
  isPomodoroActive: boolean;
  idleSeconds: number;
  lastActivityTime: number;
  lastInterventionTime: number | null;
  interventionCount: number;
}

// Mode behavior result
export interface ModeBehavior {
  showWarningFirst: boolean;
  warningDurationSeconds: number;
  appAction: 'force_quit' | 'hide_window';
  skipTokenLimit: number;
  maxDelayMinutes: number;
  allowContinue: boolean;
}

// Intervention event
export interface InterventionEvent {
  type: 'idle_alert' | 'distraction_detected';
  timestamp: number;
  idleSeconds?: number;
  distractionApp?: string;
}

// Mode detection types (Requirements: 2.3, 2.5, 6.5, 10.1-10.8)
export type AppMode = 'development' | 'staging' | 'production';
export type ModeSource = 
  | 'env_vibeflow_mode'
  | 'env_node_env'
  | 'cli_dev_flag'
  | 'cli_staging_flag'
  | 'app_packaged'
  | 'default';

export interface ModeDetectionResult {
  mode: AppMode;
  source: ModeSource;
  isPackaged: boolean;
  isInDemoMode: boolean;
}

export interface ModeDisplayInfo {
  displayName: string;
  shortLabel: string;
  description: string;
  showIndicator: boolean;
  indicatorColor: string;
}

// Policy Cache types (Requirements: 9.1, 9.2)
export interface PolicyTimeSlot {
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface PolicySkipTokenConfig {
  remaining: number;
  maxPerDay: number;
  delayMinutes: number;
}

export interface PolicyDistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
}

export interface DesktopPolicy {
  version: number;
  enforcementMode: 'strict' | 'gentle';
  workTimeSlots: PolicyTimeSlot[];
  skipTokens: PolicySkipTokenConfig;
  distractionApps: PolicyDistractionApp[];
  updatedAt: number;
}

export interface CachedPolicy {
  policy: DesktopPolicy;
  cachedAt: number;
  lastSyncedAt: number;
  isStale: boolean;
}

export interface PolicyCacheState {
  isInitialized: boolean;
  hasValidPolicy: boolean;
  isStale: boolean;
  lastCachedAt: number | null;
  lastSyncedAt: number | null;
  policyVersion: number | null;
}

// Offline Event Queue types (Requirements: 9.3, 9.6)
export type QueuedEventType = 
  | 'skip_token_usage'
  | 'bypass_event'
  | 'offline_period'
  | 'heartbeat_missed';

export interface EventQueueState {
  queueSize: number;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: string[];
}

// IPC Channel definitions
const IPC_CHANNELS = {
  // Window control
  WINDOW_SHOW: 'window:show',
  WINDOW_HIDE: 'window:hide',
  WINDOW_BRING_TO_FRONT: 'window:bringToFront',
  WINDOW_TOGGLE: 'window:toggle',

  // Configuration
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',

  // Auto-launch
  AUTO_LAUNCH_ENABLE: 'autoLaunch:enable',
  AUTO_LAUNCH_DISABLE: 'autoLaunch:disable',
  AUTO_LAUNCH_IS_ENABLED: 'autoLaunch:isEnabled',

  // Connection management (Requirements: 1.7)
  CONNECTION_GET_STATUS: 'connection:getStatus',
  CONNECTION_GET_INFO: 'connection:getInfo',
  CONNECTION_CONNECT: 'connection:connect',
  CONNECTION_DISCONNECT: 'connection:disconnect',
  CONNECTION_RECONNECT: 'connection:reconnect',
  CONNECTION_STATUS_CHANGE: 'connection:statusChange',

  // Tray
  TRAY_UPDATE_MENU: 'tray:updateMenu',
  TRAY_START_POMODORO: 'tray:start-pomodoro',
  TRAY_VIEW_STATUS: 'tray:view-status',
  TRAY_OPEN_SETTINGS: 'tray:open-settings',

  // App control (for future implementation)
  APP_QUIT: 'app:quit',
  APP_HIDE: 'app:hide',
  APP_GET_RUNNING: 'app:getRunning',

  // Permissions
  PERMISSION_CHECK_ACCESSIBILITY: 'permission:checkAccessibility',
  PERMISSION_REQUEST_ACCESSIBILITY: 'permission:requestAccessibility',

  // Focus enforcer events
  FOCUS_INTERVENTION_TRIGGERED: 'focus:interventionTriggered',
  FOCUS_INTERVENTION_DISMISSED: 'focus:interventionDismissed',
  FOCUS_START_MONITORING: 'focus:startMonitoring',
  FOCUS_STOP_MONITORING: 'focus:stopMonitoring',
  FOCUS_GET_STATE: 'focus:getState',
  FOCUS_GET_CONFIG: 'focus:getConfig',
  FOCUS_UPDATE_CONFIG: 'focus:updateConfig',
  FOCUS_RECORD_ACTIVITY: 'focus:recordActivity',
  FOCUS_SET_POMODORO_ACTIVE: 'focus:setPomodoroActive',
  FOCUS_SKIP_INTERVENTION: 'focus:skipIntervention',
  FOCUS_DELAY_INTERVENTION: 'focus:delayIntervention',
  FOCUS_GET_REMAINING_TOKENS: 'focus:getRemainingSkipTokens',
  FOCUS_GET_MODE_BEHAVIOR: 'focus:getModeBehavior',
  FOCUS_GET_SKIP_TOKEN_LIMITS: 'focus:getSkipTokenLimits',
  FOCUS_SET_ENFORCEMENT_MODE: 'focus:setEnforcementMode',

  // Notifications
  NOTIFICATION_SHOW: 'notification:show',
} as const;


// Define the API exposed to the renderer process
const vibeflowAPI = {
  // Window control
  window: {
    show: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SHOW),
    hide: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_HIDE),
    bringToFront: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_BRING_TO_FRONT),
    toggle: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE),
  },

  // Configuration
  config: {
    get: (): Promise<ElectronMainConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
    update: (
      config: Partial<ElectronMainConfig>
    ): Promise<ElectronMainConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_UPDATE, config),
  },

  // Auto-launch (Requirements: 1.6)
  autoLaunch: {
    enable: (): Promise<{ success: boolean; isEnabled: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTO_LAUNCH_ENABLE),
    disable: (): Promise<{ success: boolean; isEnabled: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTO_LAUNCH_DISABLE),
    isEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTO_LAUNCH_IS_ENABLED),
    getStatus: (): Promise<{ isEnabled: boolean; isSupported: boolean; error?: string }> =>
      ipcRenderer.invoke('autoLaunch:getStatus'),
    toggle: (): Promise<{ success: boolean; isEnabled: boolean; error?: string }> =>
      ipcRenderer.invoke('autoLaunch:toggle'),
  },

  // Connection management (Requirements: 1.7, 9.4, 9.5, 9.6)
  connection: {
    getStatus: (): Promise<ConnectionStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_STATUS),
    getInfo: (): Promise<ConnectionInfo> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_INFO),
    connect: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CONNECT),
    disconnect: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_DISCONNECT),
    reconnect: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_RECONNECT),
    // Security methods (Requirements: 9.4, 9.5, 9.6)
    getSecurityConfig: (): Promise<SecurityConfig> =>
      ipcRenderer.invoke('connection:getSecurityConfig'),
    isSecure: (): Promise<boolean> =>
      ipcRenderer.invoke('connection:isSecure'),
    verifyCertificate: (): Promise<CertificateVerificationResult> =>
      ipcRenderer.invoke('connection:verifyCertificate'),
  },

  // Tray
  tray: {
    updateMenu: (state: Partial<TrayMenuState>): void => {
      ipcRenderer.send(IPC_CHANNELS.TRAY_UPDATE_MENU, state);
    },
    // Legacy support for simple boolean
    updatePomodoroState: (pomodoroActive: boolean): void => {
      ipcRenderer.send('tray:updatePomodoroState', pomodoroActive);
    },
  },

  // App control (placeholders for future implementation)
  appControl: {
    quitApp: (bundleId: string): Promise<AppControlResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT, bundleId),
    hideApp: (bundleId: string): Promise<AppControlResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_HIDE, bundleId),
    getRunningApps: (): Promise<RunningApp[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_RUNNING),
    closeDistractionApps: (apps: DistractionApp[]): Promise<Record<string, AppControlResult>> =>
      ipcRenderer.invoke('app:closeDistractionApps', apps),
  },

  // Permissions
  permissions: {
    checkAccessibility: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_CHECK_ACCESSIBILITY),
    requestAccessibility: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_REQUEST_ACCESSIBILITY),
    checkAll: (): Promise<{
      accessibility: { granted: boolean; canRequest: boolean };
      notifications: { granted: boolean; canRequest: boolean };
      allGranted: boolean;
    }> =>
      ipcRenderer.invoke('permission:checkAll'),
    showSetupGuide: (): Promise<{
      accessibility: { granted: boolean; canRequest: boolean };
      notifications: { granted: boolean; canRequest: boolean };
      allGranted: boolean;
    }> =>
      ipcRenderer.invoke('permission:showSetupGuide'),
    isAppControlAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('permission:isAppControlAvailable'),
    getUnavailableFeatures: (): Promise<string[]> =>
      ipcRenderer.invoke('permission:getUnavailableFeatures'),
  },

  // Distraction Apps Management (Requirements: 3.1, 3.7)
  distractionApps: {
    getPresets: (): Promise<DistractionApp[]> =>
      ipcRenderer.invoke('distractionApps:getPresets'),
    getCategories: (): Promise<CategoryInfo[]> =>
      ipcRenderer.invoke('distractionApps:getCategories'),
    getByCategory: (): Promise<Record<AppCategory, DistractionApp[]>> =>
      ipcRenderer.invoke('distractionApps:getByCategory'),
    isPreset: (bundleId: string): Promise<boolean> =>
      ipcRenderer.invoke('distractionApps:isPreset', bundleId),
    mergeWithPresets: (userApps: DistractionApp[]): Promise<DistractionApp[]> =>
      ipcRenderer.invoke('distractionApps:mergeWithPresets', userApps),
    getRunning: (distractionApps: DistractionApp[]): Promise<RunningApp[]> =>
      ipcRenderer.invoke('distractionApps:getRunning', distractionApps),
  },

  // Notifications (Requirements: 2.2, 2.3)
  notification: {
    show: (options: { title: string; body: string; type?: string; silent?: boolean }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('notification:show', options),
    showIntervention: (options: { idleMinutes: number; skipTokensRemaining: number }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('notification:showIntervention', options),
    showPomodoroComplete: (taskName?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('notification:showPomodoroComplete', taskName),
    showBreakComplete: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('notification:showBreakComplete'),
    bringToFront: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('notification:bringToFront'),
    setAlwaysOnTop: (alwaysOnTop: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('notification:setAlwaysOnTop', alwaysOnTop),
    isSupported: (): Promise<boolean> =>
      ipcRenderer.invoke('notification:isSupported'),
  },

  // Pomodoro countdown (main process for background updates)
  pomodoro: {
    startCountdown: (data: { startTime: number; durationMs: number; taskTitle?: string }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('pomodoro:startCountdown', data),
    stopCountdown: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('pomodoro:stopCountdown'),
  },

  // Focus Enforcer
  focusEnforcer: {
    startMonitoring: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_START_MONITORING),
    stopMonitoring: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_STOP_MONITORING),
    getState: (): Promise<FocusEnforcerState> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_GET_STATE),
    getConfig: (): Promise<FocusEnforcerConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_GET_CONFIG),
    updateConfig: (config: Partial<FocusEnforcerConfig>): Promise<FocusEnforcerConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_UPDATE_CONFIG, config),
    recordActivity: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_RECORD_ACTIVITY),
    setPomodoroActive: (isActive: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_SET_POMODORO_ACTIVE, isActive),
    skipIntervention: (): Promise<{ success: boolean; remaining: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_SKIP_INTERVENTION),
    delayIntervention: (minutes: number): Promise<{ success: boolean; remaining: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_DELAY_INTERVENTION, minutes),
    getRemainingSkipTokens: (): Promise<{ remaining: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_GET_REMAINING_TOKENS),
    getModeBehavior: (): Promise<ModeBehavior> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_GET_MODE_BEHAVIOR),
    getSkipTokenLimits: (): Promise<{ dailyLimit: number; maxDelayMinutes: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_GET_SKIP_TOKEN_LIMITS),
    setEnforcementMode: (mode: 'strict' | 'gentle'): Promise<{
      success: boolean;
      mode: string;
      behavior: ModeBehavior;
      limits: { dailyLimit: number; maxDelayMinutes: number };
    }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FOCUS_SET_ENFORCEMENT_MODE, mode),
  },

  // Event listeners for main process events
  on: {
    startPomodoro: (callback: () => void): (() => void) => {
      const handler = (_event: IpcRendererEvent) => callback();
      ipcRenderer.on(IPC_CHANNELS.TRAY_START_POMODORO, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.TRAY_START_POMODORO, handler);
    },
    viewStatus: (callback: () => void): (() => void) => {
      const handler = (_event: IpcRendererEvent) => callback();
      ipcRenderer.on(IPC_CHANNELS.TRAY_VIEW_STATUS, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.TRAY_VIEW_STATUS, handler);
    },
    openSettings: (callback: () => void): (() => void) => {
      const handler = (_event: IpcRendererEvent) => callback();
      ipcRenderer.on(IPC_CHANNELS.TRAY_OPEN_SETTINGS, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.TRAY_OPEN_SETTINGS, handler);
    },
    interventionTriggered: (
      callback: (event: { type: string; timestamp: number }) => void
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: { type: string; timestamp: number }
      ) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.FOCUS_INTERVENTION_TRIGGERED, handler);
      return () =>
        ipcRenderer.removeListener(
          IPC_CHANNELS.FOCUS_INTERVENTION_TRIGGERED,
          handler
        );
    },
    notificationInterventionClicked: (callback: () => void): (() => void) => {
      const handler = (_event: IpcRendererEvent) => callback();
      ipcRenderer.on('notification:interventionClicked', handler);
      return () =>
        ipcRenderer.removeListener('notification:interventionClicked', handler);
    },
    // Connection status change listener (Requirements: 1.7)
    connectionStatusChange: (
      callback: (event: ConnectionEvent) => void
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: ConnectionEvent
      ) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATUS_CHANGE, handler);
      return () =>
        ipcRenderer.removeListener(
          IPC_CHANNELS.CONNECTION_STATUS_CHANGE,
          handler
        );
    },
    // Offline queue sync complete listener (Requirements: 9.3, 9.6)
    offlineQueueSyncComplete: (
      callback: (result: SyncResult) => void
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: SyncResult
      ) => callback(data);
      ipcRenderer.on('offlineQueue:syncComplete', handler);
      return () =>
        ipcRenderer.removeListener('offlineQueue:syncComplete', handler);
    },
    // Octopus protocol events (forwarded from main process WebSocket)
    // These allow the renderer to receive server events via IPC instead of creating its own socket
    policyUpdated: (
      callback: (policy: DesktopPolicy) => void
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: DesktopPolicy
      ) => callback(data);
      ipcRenderer.on('octopus:policyUpdated', handler);
      return () =>
        ipcRenderer.removeListener('octopus:policyUpdated', handler);
    },
    stateSync: (
      callback: (state: unknown) => void
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: unknown
      ) => callback(data);
      ipcRenderer.on('octopus:stateSync', handler);
      return () =>
        ipcRenderer.removeListener('octopus:stateSync', handler);
    },
    commandReceived: (
      callback: (command: unknown) => void
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: unknown
      ) => callback(data);
      ipcRenderer.on('octopus:commandReceived', handler);
      return () =>
        ipcRenderer.removeListener('octopus:commandReceived', handler);
    },
  },

  // Platform info
  platform: {
    isMac: process.platform === 'darwin',
    isWindows: process.platform === 'win32',
    isLinux: process.platform === 'linux',
    isElectron: true,
  },

  // Mode Detector (Requirements: 2.3, 2.5, 6.5, 10.1-10.8)
  mode: {
    getMode: (): Promise<ModeDetectionResult> =>
      ipcRenderer.invoke('mode:getMode'),
    getCurrentMode: (): Promise<AppMode> =>
      ipcRenderer.invoke('mode:getCurrentMode'),
    isDevelopment: (): Promise<boolean> =>
      ipcRenderer.invoke('mode:isDevelopment'),
    isProduction: (): Promise<boolean> =>
      ipcRenderer.invoke('mode:isProduction'),
    isStaging: (): Promise<boolean> =>
      ipcRenderer.invoke('mode:isStaging'),
    isInDemoMode: (): Promise<boolean> =>
      ipcRenderer.invoke('mode:isInDemoMode'),
    setDemoMode: (isActive: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('mode:setDemoMode', isActive),
    getDisplayInfo: (): Promise<ModeDisplayInfo> =>
      ipcRenderer.invoke('mode:getDisplayInfo'),
    shouldEnforce: (): Promise<boolean> =>
      ipcRenderer.invoke('mode:shouldEnforce'),
    canQuitFreely: (): Promise<boolean> =>
      ipcRenderer.invoke('mode:canQuitFreely'),
  },

  // Policy Cache (Requirements: 9.1, 9.2)
  policyCache: {
    getPolicy: (): Promise<DesktopPolicy> =>
      ipcRenderer.invoke('policyCache:getPolicy'),
    getCachedPolicy: (): Promise<CachedPolicy | null> =>
      ipcRenderer.invoke('policyCache:getCachedPolicy'),
    getState: (): Promise<PolicyCacheState> =>
      ipcRenderer.invoke('policyCache:getState'),
    isStale: (): Promise<boolean> =>
      ipcRenderer.invoke('policyCache:isStale'),
    hasValidPolicy: (): Promise<boolean> =>
      ipcRenderer.invoke('policyCache:hasValidPolicy'),
    isWithinWorkHours: (): Promise<boolean> =>
      ipcRenderer.invoke('policyCache:isWithinWorkHours'),
    getEnforcementMode: (): Promise<'strict' | 'gentle'> =>
      ipcRenderer.invoke('policyCache:getEnforcementMode'),
    getDistractionApps: (): Promise<PolicyDistractionApp[]> =>
      ipcRenderer.invoke('policyCache:getDistractionApps'),
    getSkipTokenConfig: (): Promise<PolicySkipTokenConfig> =>
      ipcRenderer.invoke('policyCache:getSkipTokenConfig'),
  },

  // Offline Event Queue (Requirements: 9.3, 9.6)
  offlineQueue: {
    getState: (): Promise<EventQueueState> =>
      ipcRenderer.invoke('offlineQueue:getState'),
    getQueue: (): Promise<unknown[]> =>
      ipcRenderer.invoke('offlineQueue:getQueue'),
    getPendingEvents: (): Promise<unknown[]> =>
      ipcRenderer.invoke('offlineQueue:getPendingEvents'),
    getFailedEvents: (): Promise<unknown[]> =>
      ipcRenderer.invoke('offlineQueue:getFailedEvents'),
    syncAll: (): Promise<SyncResult> =>
      ipcRenderer.invoke('offlineQueue:syncAll'),
    retryFailed: (): Promise<SyncResult> =>
      ipcRenderer.invoke('offlineQueue:retryFailed'),
    clearQueue: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('offlineQueue:clearQueue'),
    clearFailed: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('offlineQueue:clearFailed'),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('vibeflow', vibeflowAPI);

// Type declaration for the global window object
// Note: The optional modifier (?) is used to match the declaration in src/types/electron.d.ts
declare global {
  interface Window {
    vibeflow?: typeof vibeflowAPI;
  }
}

export type VibeflowAPI = typeof vibeflowAPI;
