import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  globalShortcut,
} from 'electron';
import * as path from 'path';

// Handle EPIPE errors from console.log when pipe is closed
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

import Store from 'electron-store';
import { setupFocusEnforcerIpc, getFocusEnforcer } from './modules/focus-enforcer';
import { getSensorReporter } from './modules/sensor-reporter';
import { getSleepEnforcer, setupSleepEnforcerIpc } from './modules/sleep-enforcer';
import { createFocusTimeMonitor, AppMonitor } from './modules/app-monitor';
import { getOverRestEnforcer, handleOverRestPolicyUpdate } from './modules/over-rest-enforcer';
import { getRestEnforcer, handleRestEnforcementPolicyUpdate } from './modules/rest-enforcer';
import { getHeartbeatManager } from './modules/heartbeat-manager';
import {
  getQuitPrevention,
  setupQuitPreventionIpc,
  isDevelopmentMode,
} from './modules/quit-prevention';
import { initializeAuthManager, getAuthManager } from './modules/auth-manager';
import {
  getModeDetector,
  detectAppMode,
} from './modules/mode-detector';
import {
  getRunningApps,
  quitApp,
  hideApp,
  closeDistractionApps,
  getRunningDistractionApps,
} from './modules/app-controller';
import {
  checkAccessibilityPermission,
  checkAllPermissions,
  requestAccessibilityPermission,
  showPermissionSetupGuide,
  isAppControlAvailable,
  getUnavailableFeatures,
} from './modules/permissions';
import { TrayManager, type TrayMenuState } from './modules/tray-manager';
import { getNotificationManager } from './modules/notification-manager';
import { getAutoLaunchManager } from './modules/auto-launch-manager';
import { getConnectionManager, initializeConnectionManager } from './modules/connection-manager';
import { getGuardianClient } from '../guardian/guardian-client';
import { getPolicyCache } from './modules/policy-cache';
import { getOfflineEventQueue } from './modules/offline-event-queue';
import {
  PRESET_DISTRACTION_APPS,
  APP_CATEGORIES,
  getPresetAppsByCategory,
  isPresetApp,
  mergeWithPresets,
} from './config';
import type { DistractionApp } from './types';

// Configuration interface
interface ElectronMainConfig {
  serverUrl: string;
  isDevelopment: boolean;
  autoLaunch: boolean;
}

// Window state interface
interface WindowState {
  isVisible: boolean;
  isFocused: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

// Support running two instances concurrently: local dev + remote production
// When VIBEFLOW_SERVER_URL is set, use a different app name to get separate
// single-instance lock and userData directory (config, cache, offline queue)
const isRemoteMode = !!process.env.VIBEFLOW_SERVER_URL;
if (isRemoteMode) {
  app.setName('vibeflow-desktop-remote');
  app.setPath('userData', path.join(app.getPath('appData'), 'vibeflow-desktop-remote'));
}

// Store for persisting configuration
const store = new Store<{
  config: ElectronMainConfig;
  windowState: WindowState;
  hasShownPermissionSetup: boolean;
}>();

// Detect development mode:
// - When running via `npm run dev` (NODE_ENV=development), it's dev mode
// - When packaged by electron-builder (app.isPackaged=true), it's production
// - Fallback: NODE_ENV not set + not packaged = dev mode (local `electron .`)
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development' || (!app.isPackaged && process.env.NODE_ENV !== 'production');

// Default configuration
const DEFAULT_CONFIG: ElectronMainConfig = {
  serverUrl: process.env.VIBEFLOW_SERVER_URL
    || (IS_DEVELOPMENT ? 'http://localhost:3000' : 'http://39.105.213.147:4000'),
  isDevelopment: IS_DEVELOPMENT,
  autoLaunch: false,
};

console.log('[Main] Server URL:', DEFAULT_CONFIG.serverUrl, '| IS_DEV:', IS_DEVELOPMENT, '| ENV:', process.env.VIBEFLOW_SERVER_URL || '(not set)');

// Global references
let mainWindow: BrowserWindow | null = null;
let trayManager: TrayManager | null = null;

// ============================================================================
// Pomodoro Countdown State (main process)
// Maintains countdown independently of renderer process to ensure updates
// continue when app is in background (Chromium throttles renderer timers)
// ============================================================================
let pomodoroCountdown: {
  active: boolean;
  startTime: number;
  durationMs: number;
  taskTitle?: string;
  timerId?: ReturnType<typeof setInterval>;
} | null = null;

// Get current configuration
function getConfig(): ElectronMainConfig {
  return store.get('config', DEFAULT_CONFIG);
}

// Update configuration
function updateConfig(config: Partial<ElectronMainConfig>): void {
  const currentConfig = getConfig();
  store.set('config', { ...currentConfig, ...config });
}

// Get saved window state
function getWindowState(): WindowState | undefined {
  return store.get('windowState');
}

// Save window state
function saveWindowState(): void {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    store.set('windowState', {
      isVisible: mainWindow.isVisible(),
      isFocused: mainWindow.isFocused(),
      bounds,
    });
  }
}


// Create the main application window
function createWindow(): void {
  const config = getConfig();
  const savedState = getWindowState();

  // Default window options
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedState?.bounds.width || 1200,
    height: savedState?.bounds.height || 800,
    x: savedState?.bounds.x,
    y: savedState?.bounds.y,
    minWidth: 800,
    minHeight: 600,
    title: isRemoteMode ? 'VibeFlow (Remote)' : 'VibeFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false, // Don't show until ready
    titleBarStyle: 'hiddenInset', // macOS native title bar
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#1a1a2e', // Dark background to match app theme
  };

  mainWindow = new BrowserWindow(windowOptions);

  // Load the remote web application
  mainWindow.loadURL(config.serverUrl);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (config.isDevelopment) {
      mainWindow?.webContents.openDevTools();
    }
  });

  // Handle window close - hide instead of quit on macOS
  mainWindow.on('close', async (event) => {
    // In production mode, check quit prevention
    if (!isDevelopmentMode()) {
      const quitPrevention = getQuitPrevention();
      const canQuitResult = quitPrevention.canQuit();
      
      if (!canQuitResult.allowed) {
        event.preventDefault();
        
        // Show confirmation dialog
        const canProceed = await quitPrevention.handleQuitAttempt();
        if (canProceed) {
          // User confirmed, allow quit
          quitPrevention.forceQuit();
        }
        return;
      }
    }
    
    if (process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
    saveWindowState();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Save window state on move/resize
  mainWindow.on('moved', saveWindowState);
  mainWindow.on('resized', saveWindowState);
}

// Window management functions
function showWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function hideWindow(): void {
  mainWindow?.hide();
}

function bringToFront(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    // On macOS, also bring app to front
    if (process.platform === 'darwin') {
      app.dock?.show();
    }
  }
}

function toggleWindow(): void {
  if (mainWindow?.isVisible()) {
    hideWindow();
  } else {
    showWindow();
  }
}


// Create system tray using TrayManager
function createTray(): void {
  trayManager = new TrayManager({
    onShowWindow: toggleWindow, // Use toggle for tray click (Requirements: 6.1)
    onStartPomodoro: () => {
      // Always show window and navigate to pomodoro page (Requirements: 6.4)
      bringToFront();
      mainWindow?.webContents.send('tray:start-pomodoro');
    },
    onViewStatus: () => {
      // Always show window and navigate to dashboard (Requirements: 6.5)
      bringToFront();
      mainWindow?.webContents.send('tray:view-status');
    },
    onOpenSettings: () => {
      // Always show window and navigate to settings (Requirements: 6.6)
      bringToFront();
      mainWindow?.webContents.send('tray:open-settings');
    },
    onToggleChat: () => {
      // S3.3: Toggle AI Chat panel
      bringToFront();
      mainWindow?.webContents.send('chat:toggle');
    },
    onQuit: async () => {
      // Use quit prevention for tray quit
      if (!isDevelopmentMode()) {
        const quitPrevention = getQuitPrevention();
        const canProceed = await quitPrevention.handleQuitAttempt();
        if (canProceed) {
          app.quit();
        }
      } else {
        app.quit();
      }
    },
  });

  if (mainWindow) {
    trayManager.setMainWindow(mainWindow);
    console.log('[Main] TrayManager initialized with main window reference');
  } else {
    console.warn('[Main] TrayManager created without main window reference');
  }

  // Propagate remote mode to tray manager
  if (isRemoteMode) {
    const config = store.get('config', DEFAULT_CONFIG);
    trayManager.updateState({
      isRemoteMode: true,
      serverUrl: config.serverUrl,
    });
  }

  trayManager.create();
  console.log('[Main] System tray created and ready for state updates');
}

// Update tray menu state (full rebuild: menu + tooltip + title)
function updateTrayMenu(state: Partial<TrayMenuState>): void {
  trayManager?.updateState(state);
}

// Lightweight tray update: only title text, no menu rebuild (for high-frequency timer ticks)
function updateTrayTitleOnly(state: Partial<TrayMenuState>): void {
  trayManager?.updateTitleOnly(state);
}

// Helper function to get current tray state
function getTrayState(): TrayMenuState | null {
  return trayManager?.getState() ?? null;
}

// ============================================================================
// Pomodoro Countdown Functions (main process)
// ============================================================================

function startPomodoroCountdown(startTime: number, durationMs: number, taskTitle?: string): void {
  stopPomodoroCountdown();

  pomodoroCountdown = {
    active: true,
    startTime,
    durationMs,
    taskTitle,
  };

  // Full menu rebuild on pomodoro start (sets pomodoroActive, task, state)
  const elapsed = Date.now() - startTime;
  const remainingMs = Math.max(0, durationMs - elapsed);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  updateTrayMenu({
    pomodoroActive: true,
    pomodoroTimeRemaining: timeStr,
    currentTask: taskTitle,
    systemState: 'FOCUS',
    isInSleepTime: false, // Active pomodoro overrides sleep display
  });

  // Subsequent ticks only update title text (lightweight, no menu rebuild)
  pomodoroCountdown.timerId = setInterval(updatePomodoroCountdown, 1000);
  console.log('[Main] Pomodoro countdown started:', { startTime, durationMs, taskTitle });
}

function updatePomodoroCountdown(): void {
  if (!pomodoroCountdown?.active) return;

  const elapsed = Date.now() - pomodoroCountdown.startTime;
  const remainingMs = Math.max(0, pomodoroCountdown.durationMs - elapsed);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Use lightweight title-only update for timer ticks (every 1s).
  // Full menu rebuild is expensive on macOS (triggers GPU compositing).
  // The full menu was already built when the pomodoro started.
  updateTrayTitleOnly({
    pomodoroTimeRemaining: timeStr,
  });

  // Timer complete - stop countdown (notification handled by EXECUTE event from server)
  if (remainingMs <= 0) {
    stopPomodoroCountdown();
  }
}

function stopPomodoroCountdown(): void {
  if (pomodoroCountdown?.timerId) {
    clearInterval(pomodoroCountdown.timerId);
  }
  pomodoroCountdown = null;
  updateTrayMenu({
    pomodoroActive: false,
    pomodoroTimeRemaining: undefined,
    currentTask: undefined,
  });
  console.log('[Main] Pomodoro countdown stopped');
}

// ============================================================================
// Rest Elapsed Timer (main process)
// Count-up timer showing how long the user has been resting.
// Runs independently of renderer process to ensure tray updates
// continue when app is in background.
// ============================================================================
let restTimer: {
  active: boolean;
  startTime: number;
  isOverRest: boolean;
  timerId?: ReturnType<typeof setInterval>;
} | null = null;

function startRestTimer(): void {
  stopRestTimer();

  restTimer = {
    active: true,
    startTime: Date.now(),
    isOverRest: false,
  };

  // Full menu rebuild on rest start
  updateTrayMenu({
    pomodoroActive: false,
    pomodoroTimeRemaining: undefined,
    currentTask: undefined,
    systemState: 'RESTING',
    restTimeRemaining: '+0:00',
    overRestDuration: undefined,
  });

  // Subsequent ticks only update title text (lightweight)
  restTimer.timerId = setInterval(updateRestElapsed, 1000);
  console.log('[Main] Rest timer started');
}

function updateRestElapsed(): void {
  if (!restTimer?.active) return;

  const elapsedMs = Date.now() - restTimer.startTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = `+${minutes}:${seconds.toString().padStart(2, '0')}`;

  if (restTimer.isOverRest) {
    updateTrayTitleOnly({ overRestDuration: timeStr });
  } else {
    updateTrayTitleOnly({ restTimeRemaining: timeStr });
  }
}

function transitionToOverRest(): void {
  if (!restTimer?.active) return;

  restTimer.isOverRest = true;

  // Full menu rebuild for over-rest display
  const elapsedMs = Date.now() - restTimer.startTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = `+${minutes}:${seconds.toString().padStart(2, '0')}`;

  updateTrayMenu({
    systemState: 'OVER_REST',
    overRestDuration: timeStr,
    restTimeRemaining: undefined,
  });
  console.log('[Main] Rest timer transitioned to OVER_REST');
}

function stopRestTimer(): void {
  if (restTimer?.timerId) {
    clearInterval(restTimer.timerId);
  }
  restTimer = null;
  console.log('[Main] Rest timer stopped');
}

// Setup auto-launch using AutoLaunchManager
async function setupAutoLaunch(): Promise<void> {
  const autoLaunchManager = getAutoLaunchManager();
  autoLaunchManager.initialize();

  const config = getConfig();
  
  // Sync auto-launch state with saved config
  await autoLaunchManager.syncWithSetting(config.autoLaunch);
}


// IPC Handlers
function setupIpcHandlers(): void {
  // Window control
  ipcMain.handle('window:show', () => showWindow());
  ipcMain.handle('window:hide', () => hideWindow());
  ipcMain.handle('window:bringToFront', () => bringToFront());
  ipcMain.handle('window:toggle', () => toggleWindow());

  // Configuration
  ipcMain.handle('config:get', () => getConfig());
  ipcMain.handle('config:update', (_, config: Partial<ElectronMainConfig>) => {
    updateConfig(config);
    return getConfig();
  });

  // Connection management (Requirements: 1.7)
  // Note: Don't cache connectionManager here - use getConnectionManager() each time
  // because initializeConnectionManager() is called later and creates a new instance

  ipcMain.handle('connection:getStatus', () => {
    return getConnectionManager().getStatus();
  });

  ipcMain.handle('connection:getInfo', () => {
    return getConnectionManager().getConnectionInfo();
  });

  ipcMain.handle('connection:connect', async () => {
    try {
      await getConnectionManager().connect();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('connection:disconnect', () => {
    getConnectionManager().disconnect();
    return { success: true };
  });

  ipcMain.handle('connection:reconnect', async () => {
    try {
      await getConnectionManager().reconnect();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Security handlers (Requirements: 9.4, 9.5, 9.6)
  ipcMain.handle('connection:getSecurityConfig', () => {
    return getConnectionManager().getSecurityConfig();
  });

  ipcMain.handle('connection:isSecure', () => {
    return getConnectionManager().isSecureConnection();
  });

  ipcMain.handle('connection:verifyCertificate', async () => {
    return await getConnectionManager().verifyCertificate();
  });

  // Auto-launch (Requirements: 1.6)
  const autoLaunchManager = getAutoLaunchManager();

  ipcMain.handle('autoLaunch:enable', async () => {
    const result = await autoLaunchManager.enable();
    if (result.success) {
      updateConfig({ autoLaunch: true });
    }
    return result;
  });

  ipcMain.handle('autoLaunch:disable', async () => {
    const result = await autoLaunchManager.disable();
    if (result.success) {
      updateConfig({ autoLaunch: false });
    }
    return result;
  });

  ipcMain.handle('autoLaunch:isEnabled', async () => {
    return await autoLaunchManager.isEnabled();
  });

  ipcMain.handle('autoLaunch:getStatus', async () => {
    return await autoLaunchManager.getStatus();
  });

  ipcMain.handle('autoLaunch:toggle', async () => {
    const result = await autoLaunchManager.toggle();
    if (result.success) {
      updateConfig({ autoLaunch: result.isEnabled });
    }
    return result;
  });

  // Tray menu update - now accepts full state object
  // IMPORTANT: renderer's isInSleepTime is IGNORED — main process owns this via sleep enforcer.
  // This prevents stale remote-page code from overriding tray during active pomodoro.
  ipcMain.on('tray:updateMenu', (_, state: Partial<TrayMenuState>) => {
    // Main process owns pomodoroActive and isInSleepTime — never accept from renderer.
    // Renderer (especially stale remote code) sends wrong values during sleep time.
    // The only source of truth for pomodoro: startPomodoroCountdown/stopPomodoroCountdown IPC.
    // The only source of truth for sleep: sleepEnforcer in onPolicyUpdate.
    delete state.isInSleepTime;
    delete state.pomodoroActive;
    updateTrayMenu(state);
  });

  // Enhanced IPC handlers for new state types (Requirements: 5.1-5.5)
  
  // Handle system state changes
  ipcMain.on('system:stateChange', (_, payload: {
    state: string; // 3-state model: IDLE/FOCUS/OVER_REST (may also receive legacy values)
    restTimeRemaining?: string; // Pre-formatted MM:SS
    overRestDuration?: string; // Pre-formatted duration (e.g., "15 min")
  }) => {
    console.log('[Main] System state change received:', payload);
    updateTrayMenu({
      systemState: payload.state as TrayMenuState['systemState'],
      restTimeRemaining: payload.restTimeRemaining,
      overRestDuration: payload.overRestDuration,
    });
  });

  // Handle enhanced pomodoro state changes
  ipcMain.on('pomodoro:stateChange', (_, payload: {
    active: boolean;
    timeRemaining?: string; // Pre-formatted MM:SS
    taskName?: string;
    taskId?: string;
  }) => {
    if (!payload.active && pomodoroCountdown?.active) {
      return; // Don't let renderer deactivate while main countdown is running
    }
    updateTrayMenu({
      pomodoroActive: payload.active,
      pomodoroTimeRemaining: payload.timeRemaining,
      currentTask: payload.taskName,
    });
  });

  // Handle general tray state updates (enhanced version)
  ipcMain.on('tray:updateState', (_, payload: Partial<TrayMenuState>) => {
    delete payload.isInSleepTime;
    delete payload.pomodoroActive;
    updateTrayMenu(payload);
  });

  // Get current tray state (for testing and debugging)
  ipcMain.handle('tray:getState', () => {
    return getTrayState();
  });

  // Legacy support for simple pomodoro active boolean
  ipcMain.on('tray:updatePomodoroState', (_, pomodoroActive: boolean) => {
    if (!pomodoroActive && pomodoroCountdown?.active) {
      return;
    }
    updateTrayMenu({ pomodoroActive });
  });

  // App control (macOS)
  ipcMain.handle('app:getRunning', async () => {
    try {
      return await getRunningApps();
    } catch (error) {
      console.error('Failed to get running apps:', error);
      return [];
    }
  });

  ipcMain.handle('app:quit', async (_, bundleId: string) => {
    return await quitApp(bundleId);
  });

  ipcMain.handle('app:hide', async (_, bundleId: string) => {
    return await hideApp(bundleId);
  });

  ipcMain.handle('app:closeDistractionApps', async (_, apps: DistractionApp[]) => {
    const results = await closeDistractionApps(apps);
    // Convert Map to object for IPC serialization
    const resultsObj: Record<string, { success: boolean; error?: string }> = {};
    results.forEach((value, key) => {
      resultsObj[key] = value;
    });
    return resultsObj;
  });

  // Permissions (macOS)
  ipcMain.handle('permission:checkAccessibility', () => {
    return checkAccessibilityPermission(false);
  });

  ipcMain.handle('permission:requestAccessibility', () => {
    return requestAccessibilityPermission();
  });

  ipcMain.handle('permission:checkAll', () => {
    return checkAllPermissions();
  });

  ipcMain.handle('permission:showSetupGuide', async () => {
    return await showPermissionSetupGuide(mainWindow);
  });

  ipcMain.handle('permission:isAppControlAvailable', () => {
    return isAppControlAvailable();
  });

  ipcMain.handle('permission:getUnavailableFeatures', () => {
    return getUnavailableFeatures();
  });

  // Distraction Apps Management (Requirements: 3.1, 3.7)
  ipcMain.handle('distractionApps:getPresets', () => {
    return PRESET_DISTRACTION_APPS;
  });

  ipcMain.handle('distractionApps:getCategories', () => {
    return APP_CATEGORIES;
  });

  ipcMain.handle('distractionApps:getByCategory', () => {
    return getPresetAppsByCategory();
  });

  ipcMain.handle('distractionApps:isPreset', (_, bundleId: string) => {
    return isPresetApp(bundleId);
  });

  ipcMain.handle('distractionApps:mergeWithPresets', (_, userApps: DistractionApp[]) => {
    return mergeWithPresets(userApps);
  });

  ipcMain.handle('distractionApps:getRunning', async (_, distractionApps: DistractionApp[]) => {
    return await getRunningDistractionApps(distractionApps);
  });

  // Notification handlers (Requirements: 2.2, 2.3)
  const notificationManager = getNotificationManager();

  ipcMain.handle('notification:show', (_, options: { title: string; body: string; type?: string; silent?: boolean }) => {
    notificationManager.show({
      title: options.title,
      body: options.body,
      type: (options.type as 'intervention' | 'pomodoro_complete' | 'break_complete' | 'reminder' | 'warning' | 'info') ?? 'info',
      silent: options.silent,
    });
    return { success: true };
  });

  ipcMain.handle('notification:showIntervention', (_, options: { idleMinutes: number; skipTokensRemaining: number }) => {
    notificationManager.showIntervention(options.idleMinutes, options.skipTokensRemaining);
    return { success: true };
  });

  ipcMain.handle('notification:showPomodoroComplete', (_, taskName?: string) => {
    notificationManager.showPomodoroComplete(taskName);
    return { success: true };
  });

  ipcMain.handle('notification:showBreakComplete', () => {
    notificationManager.showBreakComplete();
    return { success: true };
  });

  ipcMain.handle('notification:bringToFront', () => {
    notificationManager.bringWindowToFront();
    return { success: true };
  });

  ipcMain.handle('notification:setAlwaysOnTop', (_, alwaysOnTop: boolean) => {
    notificationManager.setWindowAlwaysOnTop(alwaysOnTop);
    return { success: true };
  });

  ipcMain.handle('notification:isSupported', () => {
    return notificationManager.isSupported();
  });

  // Sensor Reporter handlers (Requirements: 4.1-4.5)
  const sensorReporter = getSensorReporter();

  ipcMain.handle('sensor:start', () => {
    sensorReporter.start();
    return { success: true };
  });

  ipcMain.handle('sensor:stop', () => {
    sensorReporter.stop();
    return { success: true };
  });

  ipcMain.handle('sensor:getState', () => {
    return sensorReporter.getState();
  });

  ipcMain.handle('sensor:setUserId', (_, userId: string) => {
    sensorReporter.setUserId(userId);
    return { success: true };
  });

  ipcMain.handle('sensor:recordActivity', () => {
    sensorReporter.recordActivity();
    return { success: true };
  });

  // Heartbeat Manager handlers (Requirements: 3.1, 1.4)
  const heartbeatManager = getHeartbeatManager();

  ipcMain.handle('heartbeat:start', () => {
    heartbeatManager.start();
    return { success: true };
  });

  ipcMain.handle('heartbeat:stop', () => {
    heartbeatManager.stop();
    return { success: true };
  });

  ipcMain.handle('heartbeat:getState', () => {
    return heartbeatManager.getState();
  });

  ipcMain.handle('heartbeat:getLastHeartbeat', () => {
    return heartbeatManager.getLastHeartbeat();
  });

  ipcMain.handle('heartbeat:isConnected', () => {
    return heartbeatManager.isConnected();
  });

  ipcMain.handle('heartbeat:setUserId', (_, userId: string) => {
    heartbeatManager.setUserId(userId);
    return { success: true };
  });

  ipcMain.handle('heartbeat:setDemoMode', (_, isInDemoMode: boolean) => {
    heartbeatManager.setDemoMode(isInDemoMode);
    return { success: true };
  });

  ipcMain.handle('heartbeat:setActivePomodoroId', (_, pomodoroId: string | null) => {
    heartbeatManager.setActivePomodoroId(pomodoroId);
    return { success: true };
  });

  // Pomodoro countdown handlers (main process countdown for background updates)
  ipcMain.handle('pomodoro:startCountdown', (_, data: { startTime: number; durationMs: number; taskTitle?: string }) => {
    startPomodoroCountdown(data.startTime, data.durationMs, data.taskTitle);
    return { success: true };
  });

  ipcMain.handle('pomodoro:stopCountdown', () => {
    stopPomodoroCountdown();
    return { success: true };
  });

  ipcMain.handle('heartbeat:sendHeartbeat', async () => {
    return await heartbeatManager.sendHeartbeat();
  });

  ipcMain.handle('heartbeat:getConfig', () => {
    return heartbeatManager.getConfig();
  });

  // Guardian Client handlers (Requirements: 8.7, 8.8)
  const guardianClient = getGuardianClient();

  ipcMain.handle('guardian:connect', async () => {
    const success = await guardianClient.connect();
    return { success };
  });

  ipcMain.handle('guardian:disconnect', () => {
    guardianClient.disconnect();
    return { success: true };
  });

  ipcMain.handle('guardian:getState', () => {
    return guardianClient.getState();
  });

  ipcMain.handle('guardian:isConnected', () => {
    return guardianClient.isConnected();
  });

  ipcMain.handle('guardian:requestStatus', () => {
    guardianClient.requestStatus();
    return { success: true };
  });

  ipcMain.handle('guardian:sendHeartbeat', () => {
    guardianClient.sendHeartbeat();
    return { success: true };
  });

  ipcMain.handle('guardian:requestShutdown', () => {
    guardianClient.requestShutdown();
    return { success: true };
  });

  // Policy Cache handlers (Requirements: 9.1, 9.2)
  const policyCache = getPolicyCache();

  ipcMain.handle('policyCache:getPolicy', () => {
    return policyCache.getPolicy();
  });

  ipcMain.handle('policyCache:getCachedPolicy', () => {
    return policyCache.getCachedPolicy();
  });

  ipcMain.handle('policyCache:getState', () => {
    return policyCache.getState();
  });

  ipcMain.handle('policyCache:isStale', () => {
    return policyCache.isStale();
  });

  ipcMain.handle('policyCache:hasValidPolicy', () => {
    return policyCache.hasValidPolicy();
  });

  ipcMain.handle('policyCache:isWithinWorkHours', () => {
    return policyCache.isWithinWorkHours();
  });

  ipcMain.handle('policyCache:getEnforcementMode', () => {
    return policyCache.getEnforcementMode();
  });

  ipcMain.handle('policyCache:getDistractionApps', () => {
    return policyCache.getDistractionApps();
  });

  ipcMain.handle('policyCache:getSkipTokenConfig', () => {
    return policyCache.getSkipTokenConfig();
  });

  // Offline Event Queue handlers (Requirements: 9.3, 9.6)
  const offlineEventQueue = getOfflineEventQueue();

  ipcMain.handle('offlineQueue:getState', () => {
    return offlineEventQueue.getState();
  });

  ipcMain.handle('offlineQueue:getQueue', () => {
    return offlineEventQueue.getQueue();
  });

  ipcMain.handle('offlineQueue:getPendingEvents', () => {
    return offlineEventQueue.getPendingEvents();
  });

  ipcMain.handle('offlineQueue:getFailedEvents', () => {
    return offlineEventQueue.getFailedEvents();
  });

  ipcMain.handle('offlineQueue:syncAll', async () => {
    return await offlineEventQueue.syncAll();
  });

  ipcMain.handle('offlineQueue:retryFailed', async () => {
    return await offlineEventQueue.retryFailed();
  });

  ipcMain.handle('offlineQueue:clearQueue', () => {
    offlineEventQueue.clearQueue();
    return { success: true };
  });

  ipcMain.handle('offlineQueue:clearFailed', () => {
    offlineEventQueue.clearFailed();
    return { success: true };
  });

  // Mode Detector handlers (Requirements: 2.3, 2.5, 6.5, 10.1-10.8)
  const modeDetector = getModeDetector();

  ipcMain.handle('mode:getMode', () => {
    return modeDetector.getMode();
  });

  ipcMain.handle('mode:getCurrentMode', () => {
    return modeDetector.getCurrentMode();
  });

  ipcMain.handle('mode:isDevelopment', () => {
    return modeDetector.isDevelopment();
  });

  ipcMain.handle('mode:isProduction', () => {
    return modeDetector.isProduction();
  });

  ipcMain.handle('mode:isStaging', () => {
    return modeDetector.isStaging();
  });

  ipcMain.handle('mode:isInDemoMode', () => {
    return modeDetector.isInDemoMode();
  });

  ipcMain.handle('mode:setDemoMode', (_, isActive: boolean) => {
    modeDetector.setDemoMode(isActive);
    // Also update heartbeat manager
    heartbeatManager.setDemoMode(isActive);
    // Update tray menu
    trayManager?.updateState({ isInDemoMode: isActive });
    return { success: true };
  });

  ipcMain.handle('mode:getDisplayInfo', () => {
    return modeDetector.getDisplayInfo();
  });

  ipcMain.handle('mode:shouldEnforce', () => {
    return modeDetector.shouldEnforce();
  });

  ipcMain.handle('mode:canQuitFreely', () => {
    return modeDetector.canQuitFreely();
  });

  // Auth Manager IPC handlers
  ipcMain.handle('auth:getState', () => {
    try {
      return getAuthManager().getState();
    } catch {
      return { isAuthenticated: false, token: null, userId: null, email: null };
    }
  });

  ipcMain.handle('auth:login', async () => {
    try {
      const authManager = getAuthManager();
      const success = await authManager.openLoginWindow();
      return { success };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      const authManager = getAuthManager();
      await authManager.logout();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  createTray();
  setupIpcHandlers();
  setupFocusEnforcerIpc();
  setupSleepEnforcerIpc();
  setupQuitPreventionIpc();
  await setupAutoLaunch();

  // Initialize quit prevention with main window reference
  const quitPrevention = getQuitPrevention();
  if (mainWindow) {
    quitPrevention.setMainWindow(mainWindow);
  }
  
  // Log current app mode
  const appMode = detectAppMode();
  console.log('[Main] App mode:', appMode);

  // Set up focus enforcer with main window reference
  const focusEnforcer = getFocusEnforcer();
  if (mainWindow) {
    focusEnforcer.setMainWindow(mainWindow);
  }

  // Set up notification manager with main window reference (Requirements: 2.2, 2.3)
  const notificationManager = getNotificationManager();
  if (mainWindow) {
    notificationManager.setMainWindow(mainWindow);
  }

  // Set up sleep enforcer with main window reference (Requirements: 11.1-11.5)
  const sleepEnforcer = getSleepEnforcer();
  if (mainWindow) {
    sleepEnforcer.setMainWindow(mainWindow);
  }

  // Set up connection manager with main window reference (Requirements: 1.7, 9.4, 9.5, 9.6)
  const config = getConfig();
  const connectionManager = initializeConnectionManager({
    serverUrl: config.serverUrl,
    // Security configuration for WSS connections
    security: {
      // Use secure connection in production, allow insecure in development
      useSecureConnection: !config.isDevelopment,
      // Verify certificates in production
      verifyCertificate: !config.isDevelopment,
      // Reject unauthorized certificates in production
      rejectUnauthorized: !config.isDevelopment,
      // Minimum TLS version for security
      minTLSVersion: 'TLSv1.2',
    },
  });
  if (mainWindow) {
    connectionManager.setMainWindow(mainWindow);
  }

  // Initialize auth manager and authenticate before connecting
  const authManager = initializeAuthManager({ serverUrl: config.serverUrl, isRemoteMode });
  let isAuthenticated = false;

  if (authManager.getToken()) {
    // Validate the stored token
    console.log('[Main] Validating stored auth token…');
    isAuthenticated = await authManager.validateToken();
  }

  if (!isAuthenticated) {
    // Production: open login window to get a proper API token
    console.log('[Main] No valid token, opening login window…');
    isAuthenticated = await authManager.openLoginWindow();
  }

  if (isAuthenticated) {
    // Provide token and userId to connection manager
    const authState = authManager.getState();
    if (authState.userId) {
      connectionManager.setUserId(authState.userId);
    }
    if (authState.token) {
      connectionManager.setAuthToken(authState.token);
    }
    console.log('[Main] Authenticated as:', authState.email);
  } else {
    console.log('[Main] No auth token — socket will use email fallback');
  }

  // Start connection monitoring
  connectionManager.connect();

  // Focus time app monitor for pomodoro/focus session enforcement
  let focusTimeMonitor: AppMonitor | null = null;

  // Track health limit notification timing
  let lastHealthLimitNotified: string | null = null;
  let healthLimitRepeatTimer: ReturnType<typeof setInterval> | null = null;

  // Connect sleep enforcer to policy updates (Requirements: 11.1, 11.2)
  connectionManager.onPolicyUpdate((policy) => {
    console.log('[Main] Received policy update:', {
      sleepTime: policy.config.sleepTime ? 'present' : 'absent',
      adhocFocusSession: policy.state.adhocFocusSession ? 'present' : 'absent',
      distractionAppsCount: policy.config.distractionApps?.length ?? 0,
    });

    // Cache the policy for offline mode (Requirements: 9.1, 9.2)
    const policyCache = getPolicyCache();
    policyCache.updatePolicy(policy);
    console.log('[Main] Policy cached for offline mode, version:', policy.config.version);

    // Update sleep enforcer config from policy
    if (policy.config.sleepTime) {
      console.log('[Main] Updating sleep enforcer config:', {
        enabled: policy.config.sleepTime.enabled,
        startTime: policy.config.sleepTime.startTime,
        endTime: policy.config.sleepTime.endTime,
        appsCount: policy.config.sleepTime.enforcementApps?.length ?? 0,
        isCurrentlyActive: policy.state.isSleepTimeActive,
        isSnoozed: policy.state.isSleepSnoozed,
      });
      sleepEnforcer.updateConfig({
        enabled: policy.config.sleepTime.enabled,
        startTime: policy.config.sleepTime.startTime,
        endTime: policy.config.sleepTime.endTime,
        enforcementApps: policy.config.sleepTime.enforcementApps,
        isCurrentlyActive: policy.state.isSleepTimeActive,
        isSnoozed: policy.state.isSleepSnoozed,
        snoozeEndTime: policy.state.sleepSnoozeEndTime,
      });

      // Start monitoring if enabled
      if (policy.config.sleepTime.enabled) {
        sleepEnforcer.start();
      }
    }

    // Handle focus session enforcement (pomodoro time)
    const isFocusSessionActive = policy.state.adhocFocusSession?.active ?? false;

    // Auto-start main process countdown when policy reports active focus session
    // but main process doesn't have a running countdown (e.g. renderer's old code
    // skipped startCountdown during sleep time)
    if (isFocusSessionActive && !pomodoroCountdown?.active) {
      const snapshot = connectionManager.getStateSnapshot();
      if (snapshot.activePomodoro) {
        const pom = snapshot.activePomodoro;
        const durationMs = pom.duration * 60 * 1000;
        console.log('[Main] Auto-starting pomodoro countdown from policy update:', {
          id: pom.id, startTime: pom.startTime, duration: pom.duration, task: pom.taskTitle,
        });
        startPomodoroCountdown(pom.startTime, durationMs, pom.taskTitle ?? undefined);
      }
    }

    // Sync isInSleepTime to tray from sleep enforcer (main process owns this, not renderer)
    const isSleepActive = sleepEnforcer.isInSleepTime();
    updateTrayMenu({ isInSleepTime: pomodoroCountdown?.active ? false : isSleepActive });
    const focusSessionOverridesSleepTime = policy.state.adhocFocusSession?.overridesSleepTime ?? false;
    const hasDistractionApps = (policy.config.distractionApps?.length ?? 0) > 0;
    
    // If focus session overrides sleep time, pause sleep enforcer (Requirements: 13.2, 13.4)
    if (isFocusSessionActive && focusSessionOverridesSleepTime) {
      console.log('[Main] Focus session overrides sleep time, pausing sleep enforcer');
      sleepEnforcer.updateConfig({ isSnoozed: true });
    } else if (!isFocusSessionActive && sleepEnforcer.getConfig().isSnoozed) {
      // If focus session ended and sleep enforcer was paused due to override, resume it
      // Note: Only resume if the snooze was due to focus session override, not user snooze
      // We check if there's no snoozeEndTime (user snooze has an end time)
      const sleepConfig = sleepEnforcer.getConfig();
      if (!sleepConfig.snoozeEndTime) {
        console.log('[Main] Focus session ended, resuming sleep enforcer');
        sleepEnforcer.updateConfig({ isSnoozed: false });
      }
    }
    
    if (isFocusSessionActive && hasDistractionApps) {
      // Focus session is active - start monitoring distraction apps
      console.log('[Main] Focus session active, starting distraction app monitoring');

      // Update focus enforcer state
      focusEnforcer.setPomodoroActive(true);

      // Stop over-rest enforcement when pomodoro starts (fixes window switching during focus)
      const overRestEnforcer = getOverRestEnforcer();
      if (overRestEnforcer.isActive()) {
        console.log('[Main] Stopping over-rest enforcement due to pomodoro start');
        overRestEnforcer.stop();
      }
      
      // Map policy distraction apps to the format expected by createFocusTimeMonitor
      const distractionAppsForMonitor = policy.config.distractionApps.map(app => ({
        bundleId: app.bundleId,
        name: app.name,
        action: app.action,
        isPreset: false, // Policy apps don't have isPreset, default to false
      }));
      
      // Create or update focus time monitor
      if (!focusTimeMonitor) {
        focusTimeMonitor = createFocusTimeMonitor(distractionAppsForMonitor, {
          checkIntervalMs: 10 * 1000, // Check every 10 seconds
          warningDelayMs: 5 * 1000,   // 5 second warning before closing
        });
        
        // Subscribe to enforcement events
        focusTimeMonitor.onEnforcement((result) => {
          console.log('[Main] Focus time enforcement:', {
            closedApps: result.closedApps,
            failedApps: result.failedApps,
          });
          
          // Notify renderer about enforcement
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('focus:appsEnforced', {
              closedApps: result.closedApps,
              failedApps: result.failedApps,
              timestamp: result.timestamp,
            });
          }
        });
      } else {
        // Update the apps list
        focusTimeMonitor.updateConfig({
          apps: policy.config.distractionApps.map(app => ({
            name: app.name,
            bundleId: app.bundleId,
            action: app.action,
          })),
        });
      }
      
      // Start monitoring if not already active
      if (!focusTimeMonitor.isActive()) {
        focusTimeMonitor.start();
      }
    } else {
      // Focus session ended or no distraction apps - stop monitoring
      if (focusTimeMonitor?.isActive()) {
        console.log('[Main] Focus session ended, stopping distraction app monitoring');
        focusTimeMonitor.stop();
      }
      
      // Update focus enforcer state
      focusEnforcer.setPomodoroActive(false);
    }
    
    // Handle over rest enforcement (Requirements: 15.2, 15.3, 16.1-16.5)
    const overRestEnforcer = getOverRestEnforcer();
    if (mainWindow) {
      overRestEnforcer.setMainWindow(mainWindow);
    }

    // Diagnostic: always log over rest state on every policy update
    console.log('[Main] Over rest policy field:', policy.state.isOverRest ? {
      isOverRest: policy.state.isOverRest,
      overRestMinutes: policy.state.overRestMinutes,
      appsCount: policy.config.overRestEnforcementApps?.length ?? 0,
      bringToFront: policy.state.overRestBringToFront,
    } : 'absent');

    if (policy.state.isOverRest) {
      console.log('[Main] Over rest detected, starting enforcement:', {
        overRestMinutes: policy.state.overRestMinutes,
        appsCount: policy.config.overRestEnforcementApps?.length ?? 0,
        bringToFront: policy.state.overRestBringToFront,
      });

      // Reconstruct legacy OverRestPolicy for handleOverRestPolicyUpdate
      handleOverRestPolicyUpdate({
        isOverRest: policy.state.isOverRest,
        overRestMinutes: policy.state.overRestMinutes,
        enforcementApps: policy.config.overRestEnforcementApps ?? [],
        bringToFront: policy.state.overRestBringToFront,
      });

      // Transition rest timer to over-rest if it's active but not yet marked
      if (restTimer?.active && !restTimer.isOverRest) {
        console.log('[Main] Policy indicates over-rest, transitioning rest timer');
        transitionToOverRest();
      }
    } else {
      // Not in over rest - stop enforcement if active
      if (overRestEnforcer.isActive()) {
        console.log('[Main] Over rest ended, stopping enforcement');
        handleOverRestPolicyUpdate(undefined);
      }
    }

    // Handle REST enforcement (close/hide work apps during rest)
    const restEnforcer = getRestEnforcer();
    if (mainWindow) {
      restEnforcer.setMainWindow(mainWindow);
    }

    if (policy.state.isRestEnforcementActive) {
      console.log('[Main] REST enforcement active, starting/updating enforcer:', {
        appsCount: policy.config.restEnforcement?.workApps?.length ?? 0,
        actions: policy.config.restEnforcement?.actions,
        graceAvailable: policy.state.restGrace?.available,
      });
      // Reconstruct legacy RestEnforcementPolicy for handleRestEnforcementPolicyUpdate
      handleRestEnforcementPolicyUpdate({
        isActive: policy.state.isRestEnforcementActive,
        workApps: policy.config.restEnforcement?.workApps ?? [],
        actions: policy.config.restEnforcement?.actions ?? [],
        grace: {
          available: policy.state.restGrace?.available ?? false,
          remaining: policy.state.restGrace?.remaining ?? 0,
          durationMinutes: policy.config.restEnforcement?.graceDurationMinutes ?? 5,
        },
      });
    } else {
      if (restEnforcer.isActive()) {
        console.log('[Main] REST enforcement ended, stopping enforcer');
        handleRestEnforcementPolicyUpdate(undefined);
      }
    }

    // Handle health limit notifications with repeating support
    if (policy.state.healthLimit) {
      const hl = policy.state.healthLimit as { type: string; message: string; repeating?: boolean; intervalMinutes?: number };
      const intervalMs = (hl.intervalMinutes ?? 10) * 60 * 1000;

      // Show notification on first trigger or type change
      if (hl.type !== lastHealthLimitNotified) {
        getNotificationManager().show({
          title: '⏰ 健康提醒',
          body: hl.message,
          type: 'info',
          urgency: 'normal',
        });
        lastHealthLimitNotified = hl.type;
        console.log('[Main] Health limit notification shown:', hl.type);

        // Set up repeating timer if enabled
        if (healthLimitRepeatTimer) {
          clearInterval(healthLimitRepeatTimer);
          healthLimitRepeatTimer = null;
        }
        if (hl.repeating) {
          healthLimitRepeatTimer = setInterval(() => {
            getNotificationManager().show({
              title: '⏰ 健康提醒',
              body: hl.message,
              type: 'info',
              urgency: 'normal',
            });
            console.log('[Main] Health limit repeat notification:', hl.type);
          }, intervalMs);
        }
      }
    } else {
      lastHealthLimitNotified = null;
      if (healthLimitRepeatTimer) {
        clearInterval(healthLimitRepeatTimer);
        healthLimitRepeatTimer = null;
      }
    }

    // Update quit prevention config with work time slots (Requirements: 1.6)
    const quitPrevention = getQuitPrevention();
    quitPrevention.updateConfig({
      workTimeSlots: policy.config.workTimeSlots.map(slot => ({
        id: `${slot.dayOfWeek}-${slot.startHour}-${slot.startMinute}`,
        startTime: `${slot.startHour.toString().padStart(2, '0')}:${slot.startMinute.toString().padStart(2, '0')}`,
        endTime: `${slot.endHour.toString().padStart(2, '0')}:${slot.endMinute.toString().padStart(2, '0')}`,
        enabled: true,
      })),
      hasActivePomodoro: isFocusSessionActive,
    });
    console.log('[Main] Updated quit prevention config with work time slots');
  });

  // Subscribe to real-time state changes from server
  // This handles automatic state transitions (e.g., FOCUS -> REST when pomodoro ends)
  connectionManager.onStateChange((state: string) => {
    console.log('[Main] Received STATE_CHANGE from server:', state);

    // Map server state to tray menu state format
    // Server now sends 3-state model (idle/focus/over_rest).
    // Legacy values mapped for backward compat during transition.
    const stateMapping: Record<string, 'READY' | 'RESTING' | 'FOCUS' | 'OVER_REST'> = {
      // New 3-state values (server sends these)
      'idle': 'READY',          // IDLE maps to READY (rest detection handled by startRestTimer)
      'IDLE': 'READY',
      'focus': 'FOCUS',
      'FOCUS': 'FOCUS',
      'over_rest': 'OVER_REST',
      'OVER_REST': 'OVER_REST',
      // Legacy values (may still arrive during transition)
      'locked': 'READY',
      'planning': 'READY',
      'rest': 'READY',
      'LOCKED': 'READY',
      'PLANNING': 'READY',
      'REST': 'READY',
    };

    const mappedState = stateMapping[state];
    if (mappedState) {
      console.log('[Main] Updating tray menu with state:', mappedState);

      // Stop main process countdown when leaving FOCUS state
      if (mappedState !== 'FOCUS' && pomodoroCountdown?.active) {
        console.log('[Main] Stopping main process countdown due to state change to:', mappedState);
        stopPomodoroCountdown();
      }

      // Auto-start main process countdown when entering FOCUS (in case renderer doesn't trigger it,
      // e.g. remote page's old code skips startCountdown during sleep time)
      if (mappedState === 'FOCUS' && !pomodoroCountdown?.active) {
        const snapshot = connectionManager.getStateSnapshot();
        if (snapshot.activePomodoro) {
          const pom = snapshot.activePomodoro;
          const durationMs = pom.duration * 60 * 1000;
          console.log('[Main] Auto-starting pomodoro countdown from state snapshot:', {
            id: pom.id, startTime: pom.startTime, duration: pom.duration, task: pom.taskTitle,
          });
          startPomodoroCountdown(pom.startTime, durationMs, pom.taskTitle ?? undefined);
        }
      }

      // Handle rest timer based on state transitions
      // In 3-state model, REST is gone. Start rest timer when transitioning
      // from FOCUS to non-FOCUS (i.e., IDLE/PLANNING after pomodoro complete).
      const prevTrayState = getTrayState()?.systemState;
      const wasInFocus = prevTrayState === 'FOCUS';
      if (wasInFocus && mappedState !== 'FOCUS' && mappedState !== 'OVER_REST') {
        startRestTimer();
      } else if (mappedState === 'OVER_REST') {
        if (restTimer?.active && !restTimer.isOverRest) {
          transitionToOverRest();
        } else if (!restTimer?.active) {
          // Fresh over-rest without prior rest timer (e.g., reconnect)
          startRestTimer();
          transitionToOverRest();
        }
      } else {
        // Any other state: update tray, but preserve active rest timer
        if (restTimer?.active) {
          // Rest timer is running — don't stop it, don't override tray state
          // (subsequent idle STATE_CHANGE events should not kill the rest timer)
          console.log('[Main] Preserving active rest timer, ignoring state:', mappedState);
        } else {
          updateTrayMenu({ systemState: mappedState });
        }
      }
    } else {
      console.warn('[Main] Unknown state received:', state);
    }
  });

  // Subscribe to execute commands from server for notifications
  // This handles POMODORO_COMPLETE, IDLE_ALERT, etc.
  connectionManager.onExecuteCommand((command) => {
    console.log('[Main] Received EXECUTE command:', command.action);

    switch (command.action) {
      case 'POMODORO_COMPLETE': {
        // Show notification and bring to front
        const taskTitle = command.params?.taskTitle as string | undefined;
        notificationManager.showPomodoroComplete(taskTitle);
        // Stop the main process countdown
        stopPomodoroCountdown();
        break;
      }
      case 'HABIT_REMINDER': {
        const title = command.params?.title as string | undefined;
        const question = command.params?.question as string | undefined;
        const streak = command.params?.streak as number | undefined;
        const body = question
          ?? (streak && streak > 1
            ? `「${title}」已连续 ${streak} 天，今天还没打卡！`
            : `该完成「${title}」了`);
        notificationManager.showReminder(body);
        break;
      }
      // IDLE_ALERT is handled by focusEnforcer.onIntervention
    }
  });

  // Set up snooze request callback to communicate with server
  sleepEnforcer.setSnoozeRequestCallback(async (_durationMinutes: number) => {
    // The snooze request will be handled by the server via the web app
    // For now, we'll send a notification to the renderer to handle the snooze request
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sleep:snoozeRequested', { durationMinutes: _durationMinutes });
    }
    
    // Return true optimistically - the server will respond with a policy update
    // If snooze is denied, the policy update will reflect that
    return true;
  });

  // Connect focus enforcer to notification manager for intervention notifications
  focusEnforcer.onIntervention((event) => {
    if (event.type === 'idle_alert') {
      const idleMinutes = Math.floor((event.idleSeconds ?? 0) / 60);
      const skipTokensRemaining = focusEnforcer.getRemainingSkipTokens();
      notificationManager.showIntervention(idleMinutes, skipTokensRemaining);
    }
  });

  // Initialize sensor reporter (Requirements: 4.1-4.5)
  const sensorReporter = getSensorReporter();
  // Note: userId will be set when user authenticates
  // sensorReporter.setUserId(userId);
  // Start sensor reporting when connection is established
  connectionManager.onConnectionChange((event) => {
    if (event.status === 'connected') {
      sensorReporter.start();
    } else if (event.status === 'disconnected' || event.status === 'error') {
      sensorReporter.stop();
    }
  });

  // Initialize heartbeat manager (Requirements: 3.1, 1.4)
  const heartbeatManager = getHeartbeatManager();
  // Note: userId will be set when user authenticates
  // heartbeatManager.setUserId(userId);
  
  // Start heartbeat manager when connection is established
  connectionManager.onConnectionChange((event) => {
    if (event.status === 'connected') {
      console.log('[Main] Connection established, starting heartbeat manager');
      heartbeatManager.start();
    } else if (event.status === 'disconnected' || event.status === 'error') {
      console.log('[Main] Connection lost, stopping heartbeat manager');
      heartbeatManager.stop();
    }
  });

  // Sync offline event queue when connection is restored (Requirements: 9.3, 9.6)
  const offlineQueue = getOfflineEventQueue();
  
  // Set up sync handler to send events to server
  offlineQueue.setSyncHandler(async (event) => {
    try {
      // Send event to server via connection manager
      // Use DESKTOP_APP_USAGE event type for offline activity sync
      const success = connectionManager.sendEvent({
        eventType: 'DESKTOP_APP_USAGE',
        userId: event.userId,
        payload: {
          source: 'desktop_app',
          identifier: event.type,
          title: `Offline Event: ${event.type}`,
          duration: 0,
          category: 'neutral',
          metadata: {
            appBundleId: event.type,
            windowTitle: `Offline: ${event.id}`,
            isActive: false,
          },
        },
      });
      return success;
    } catch (error) {
      console.error('[Main] Failed to sync offline event:', error);
      return false;
    }
  });

  // Sync offline events when connection is restored
  // Wait for full sync (SYNC_STATE) before flushing — ensures server state is current
  let fullSyncReceived = false;
  let pendingFlush: (() => void) | null = null;

  connectionManager.onStateChange(() => {
    // First SYNC_STATE after reconnect — trigger deferred flush
    if (!fullSyncReceived) {
      fullSyncReceived = true;
      if (pendingFlush) {
        pendingFlush();
        pendingFlush = null;
      }
    }
  });

  connectionManager.onConnectionChange(async (event) => {
    if (event.status === 'connected') {
      fullSyncReceived = false;
      const queueState = offlineQueue.getState();
      if (queueState.pendingCount > 0) {
        console.log('[Main] Connection restored, waiting for full sync before flushing', queueState.pendingCount, 'offline events');
        const flushFn = async () => {
          console.log('[Main] Full sync received, flushing offline events');
          const result = await offlineQueue.syncAll();
          console.log('[Main] Offline event sync result:', result);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('offlineQueue:syncComplete', result);
          }
        };
        // Wait up to 10s for full sync, then flush anyway (best effort)
        const timeout = setTimeout(() => {
          if (!fullSyncReceived) {
            console.log('[Main] Full sync timeout (10s), flushing offline events anyway');
            fullSyncReceived = true;
            pendingFlush = null;
            flushFn();
          }
        }, 10000);
        pendingFlush = () => {
          clearTimeout(timeout);
          flushFn();
        };
      }
    } else if (event.status === 'disconnected' || event.status === 'reconnecting') {
      fullSyncReceived = false;
      pendingFlush = null;
    }
  });

  // Log heartbeat events for debugging
  heartbeatManager.onHeartbeatEvent((event) => {
    if (event.type === 'failure') {
      console.warn('[Main] Heartbeat failed:', event.error);
    } else if (event.type === 'reconnecting') {
      console.log('[Main] Heartbeat manager triggering reconnection');
    } else if (event.type === 'reconnected') {
      console.log('[Main] Heartbeat manager reconnected');
    }
  });

  // Notify renderer of heartbeat status changes
  heartbeatManager.onHeartbeatEvent((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('heartbeat:event', event);
    }
  });

  // Initialize guardian client (Requirements: 8.7, 8.8)
  // Only connect to guardian in production mode
  if (!isDevelopmentMode()) {
    const guardianClient = getGuardianClient();
    
    // Attempt to connect to guardian
    guardianClient.connect().then((connected) => {
      if (connected) {
        console.log('[Main] Connected to Process Guardian');
      } else {
        console.warn('[Main] Process Guardian not available - app may not auto-restart on crash');
      }
    });

    // Listen for guardian events
    guardianClient.onEvent((event) => {
      switch (event.type) {
        case 'connected':
          console.log('[Main] Guardian connection established');
          break;
        case 'disconnected':
          console.warn('[Main] Guardian connection lost');
          break;
        case 'guardian_missing':
          console.warn('[Main] Process Guardian not running:', event.error);
          // Notify renderer about missing guardian
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('guardian:missing', { error: event.error });
          }
          break;
        case 'guardian_status':
          console.log('[Main] Guardian status:', event.data);
          // Notify renderer about guardian status
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('guardian:status', event.data);
          }
          break;
        case 'error':
          console.error('[Main] Guardian error:', event.error);
          break;
      }
    });
  } else {
    console.log('[Main] Development mode - skipping guardian connection');
  }

  // Connect focus enforcer activity recording to sensor reporter
  focusEnforcer.onIntervention(() => {
    sensorReporter.recordActivity();
  });

  // Show permission setup guide on first launch (Requirements: 9.1)
  const hasShownPermissionSetup = store.get('hasShownPermissionSetup', false);
  if (!hasShownPermissionSetup && process.platform === 'darwin') {
    // Wait for window to be ready before showing permission guide
    mainWindow?.once('ready-to-show', async () => {
      // Small delay to let the window fully render
      setTimeout(async () => {
        await showPermissionSetupGuide(mainWindow);
        store.set('hasShownPermissionSetup', true);
      }, 1000);
    });
  }

  // S3.3: Register global shortcut ⌘⇧Space for AI Chat toggle
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('chat:toggle');
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  });

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });
});


// Unregister all shortcuts when app quits
app.on('will-quit', () => {
  if (app.isReady()) {
    globalShortcut.unregisterAll();
  }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app quit
app.on('before-quit', async (event) => {
  // In production mode, check quit prevention
  if (!isDevelopmentMode()) {
    const quitPrevention = getQuitPrevention();
    
    // If already in the process of quitting (user confirmed), allow it
    if (quitPrevention.isCurrentlyQuitting()) {
      saveWindowState();
      return;
    }
    
    const canQuitResult = quitPrevention.canQuit();
    
    if (!canQuitResult.allowed) {
      event.preventDefault();
      
      // Show confirmation dialog
      const canProceed = await quitPrevention.handleQuitAttempt();
      if (canProceed) {
        // User confirmed, allow quit
        quitPrevention.forceQuit();
      }
      return;
    }
  }
  
  saveWindowState();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the main window if a second instance is launched
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Export for testing
export { getConfig, updateConfig, showWindow, hideWindow, bringToFront };
