/**
 * Type declarations for the VibeFlow Electron API
 * 
 * This file declares the types for the window.vibeflow object
 * that is exposed by the Electron preload script.
 */

// Connection status types (Requirements: 1.7)
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface ConnectionInfo {
  status: ConnectionStatus;
  serverUrl: string;
  lastConnectedAt: number | null;
  reconnectAttempts: number;
  nextRetryIn: number | null;
  error: string | null;
  isSecure: boolean;
  certificateInfo: CertificateInfo | null;
}

interface ConnectionEvent {
  status: ConnectionStatus;
  previousStatus?: ConnectionStatus;
  timestamp: number;
  error?: string;
  attemptNumber?: number;
  nextRetryIn?: number;
}

// Security types (Requirements: 9.4, 9.5, 9.6)
interface SecurityConfig {
  useSecureConnection: boolean;
  verifyCertificate: boolean;
  rejectUnauthorized: boolean;
  minTLSVersion: 'TLSv1.2' | 'TLSv1.3';
}

interface CertificateInfo {
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  isValid: boolean;
}

interface CertificateVerificationResult {
  valid: boolean;
  info: CertificateInfo | null;
  error?: string;
}

// Distraction app types
interface DistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
  isPreset: boolean;
}

interface RunningApp {
  bundleId: string;
  name: string;
  pid: number;
  isActive: boolean;
}

type AppCategory = 
  | 'social_messaging'
  | 'music_audio'
  | 'video_entertainment'
  | 'gaming'
  | 'social_media'
  | 'other';

interface CategoryInfo {
  id: AppCategory;
  name: string;
  description: string;
  defaultAction: 'force_quit' | 'hide_window';
}

// App control result
interface AppControlResult {
  success: boolean;
  error?: string;
}

// Permission status
interface PermissionStatus {
  granted: boolean;
  canRequest: boolean;
}

interface PermissionCheckResult {
  accessibility: PermissionStatus;
  notifications: PermissionStatus;
  allGranted: boolean;
}

// Focus enforcer types
interface WorkTimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface SkipTokenConfig {
  dailyLimit: number;
  maxDelayMinutes: number;
  usedToday: number;
  lastResetDate: string;
}

interface FocusEnforcerConfig {
  workTimeSlots: WorkTimeSlot[];
  maxIdleMinutes: number;
  enforcementMode: 'strict' | 'gentle';
  repeatIntervalMinutes: number;
  distractionApps: DistractionApp[];
  skipTokens: SkipTokenConfig;
}

interface FocusEnforcerState {
  isMonitoring: boolean;
  isWithinWorkHours: boolean;
  isPomodoroActive: boolean;
  idleSeconds: number;
  lastActivityTime: number;
  lastInterventionTime: number | null;
  interventionCount: number;
}

interface ModeBehavior {
  showWarningFirst: boolean;
  warningDurationSeconds: number;
  appAction: 'force_quit' | 'hide_window';
  skipTokenLimit: number;
  maxDelayMinutes: number;
  allowContinue: boolean;
}

interface InterventionEvent {
  type: 'idle_alert' | 'distraction_detected';
  timestamp: number;
  idleSeconds?: number;
  distractionApp?: string;
}

// Tray menu state
interface TrayMenuState {
  pomodoroActive: boolean;
  pomodoroTimeRemaining?: string;
  currentTask?: string;
  isWithinWorkHours: boolean;
  skipTokensRemaining: number;
  enforcementMode: 'strict' | 'gentle';
}

// Auto-launch result
interface AutoLaunchResult {
  success: boolean;
  isEnabled: boolean;
  error?: string;
}

// Auto-launch status
interface AutoLaunchStatus {
  isEnabled: boolean;
  isSupported: boolean;
  error?: string;
}

// Notification options
interface NotificationShowOptions {
  title: string;
  body: string;
  type?: 'intervention' | 'pomodoro_complete' | 'break_complete' | 'reminder' | 'warning' | 'info';
  silent?: boolean;
}

// Electron main config
interface ElectronMainConfig {
  serverUrl: string;
  isDevelopment: boolean;
  autoLaunch: boolean;
}

// VibeFlow Electron API
interface VibeflowAPI {
  // Window control
  window: {
    show: () => Promise<void>;
    hide: () => Promise<void>;
    bringToFront: () => Promise<void>;
    toggle: () => Promise<void>;
  };

  // Configuration
  config: {
    get: () => Promise<ElectronMainConfig>;
    update: (config: Partial<ElectronMainConfig>) => Promise<ElectronMainConfig>;
  };

  // Auto-launch (Requirements: 1.6)
  autoLaunch: {
    enable: () => Promise<AutoLaunchResult>;
    disable: () => Promise<AutoLaunchResult>;
    isEnabled: () => Promise<boolean>;
    getStatus: () => Promise<AutoLaunchStatus>;
    toggle: () => Promise<AutoLaunchResult>;
  };

  // Connection management (Requirements: 1.7, 9.4, 9.5, 9.6)
  connection: {
    getStatus: () => Promise<ConnectionStatus>;
    getInfo: () => Promise<ConnectionInfo>;
    connect: () => Promise<{ success: boolean; error?: string }>;
    disconnect: () => Promise<{ success: boolean }>;
    reconnect: () => Promise<{ success: boolean; error?: string }>;
    // Security methods (Requirements: 9.4, 9.5, 9.6)
    getSecurityConfig: () => Promise<SecurityConfig>;
    isSecure: () => Promise<boolean>;
    verifyCertificate: () => Promise<CertificateVerificationResult>;
  };

  // Tray
  tray: {
    updateMenu: (state: Partial<TrayMenuState>) => void;
    updatePomodoroState: (pomodoroActive: boolean) => void;
  };

  // App control
  appControl: {
    quitApp: (bundleId: string) => Promise<AppControlResult>;
    hideApp: (bundleId: string) => Promise<AppControlResult>;
    getRunningApps: () => Promise<RunningApp[]>;
    closeDistractionApps: (apps: DistractionApp[]) => Promise<Record<string, AppControlResult>>;
  };

  // Permissions
  permissions: {
    checkAccessibility: () => Promise<boolean>;
    requestAccessibility: () => Promise<boolean>;
    checkAll: () => Promise<PermissionCheckResult>;
    showSetupGuide: () => Promise<PermissionCheckResult>;
    isAppControlAvailable: () => Promise<boolean>;
    getUnavailableFeatures: () => Promise<string[]>;
  };

  // Distraction Apps
  distractionApps: {
    getPresets: () => Promise<DistractionApp[]>;
    getCategories: () => Promise<CategoryInfo[]>;
    getByCategory: () => Promise<Record<AppCategory, DistractionApp[]>>;
    isPreset: (bundleId: string) => Promise<boolean>;
    mergeWithPresets: (userApps: DistractionApp[]) => Promise<DistractionApp[]>;
    getRunning: (distractionApps: DistractionApp[]) => Promise<RunningApp[]>;
  };

  // Notifications (Requirements: 2.2, 2.3)
  notification: {
    show: (options: NotificationShowOptions) => Promise<{ success: boolean }>;
    showIntervention: (options: { idleMinutes: number; skipTokensRemaining: number }) => Promise<{ success: boolean }>;
    showPomodoroComplete: (taskName?: string) => Promise<{ success: boolean }>;
    showBreakComplete: () => Promise<{ success: boolean }>;
    bringToFront: () => Promise<{ success: boolean }>;
    setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<{ success: boolean }>;
    isSupported: () => Promise<boolean>;
  };

  // Focus Enforcer
  focusEnforcer: {
    startMonitoring: () => Promise<{ success: boolean }>;
    stopMonitoring: () => Promise<{ success: boolean }>;
    getState: () => Promise<FocusEnforcerState>;
    getConfig: () => Promise<FocusEnforcerConfig>;
    updateConfig: (config: Partial<FocusEnforcerConfig>) => Promise<FocusEnforcerConfig>;
    recordActivity: () => Promise<{ success: boolean }>;
    setPomodoroActive: (isActive: boolean) => Promise<{ success: boolean }>;
    skipIntervention: () => Promise<{ success: boolean; remaining: number }>;
    delayIntervention: (minutes: number) => Promise<{ success: boolean; remaining: number }>;
    getRemainingSkipTokens: () => Promise<{ remaining: number }>;
    getModeBehavior: () => Promise<ModeBehavior>;
    getSkipTokenLimits: () => Promise<{ dailyLimit: number; maxDelayMinutes: number }>;
    setEnforcementMode: (mode: 'strict' | 'gentle') => Promise<{
      success: boolean;
      mode: string;
      behavior: ModeBehavior;
      limits: { dailyLimit: number; maxDelayMinutes: number };
    }>;
  };

  // Event listeners
  on: {
    startPomodoro: (callback: () => void) => () => void;
    viewStatus: (callback: () => void) => () => void;
    openSettings: (callback: () => void) => () => void;
    interventionTriggered: (callback: (event: InterventionEvent) => void) => () => void;
    notificationInterventionClicked: (callback: () => void) => () => void;
    connectionStatusChange: (callback: (event: ConnectionEvent) => void) => () => void;
  };

  // Platform info
  platform: {
    isMac: boolean;
    isWindows: boolean;
    isLinux: boolean;
    isElectron: boolean;
  };
}

// Extend the Window interface
declare global {
  interface Window {
    vibeflow?: VibeflowAPI;
  }
}

export {};
