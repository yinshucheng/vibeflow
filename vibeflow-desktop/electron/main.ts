import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
} from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { setupFocusEnforcerIpc, getFocusEnforcer } from './modules/focus-enforcer';
import { getSensorReporter } from './modules/sensor-reporter';
import { getSleepEnforcer, setupSleepEnforcerIpc } from './modules/sleep-enforcer';
import { createFocusTimeMonitor, AppMonitor } from './modules/app-monitor';
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

// Store for persisting configuration
const store = new Store<{
  config: ElectronMainConfig;
  windowState: WindowState;
  hasShownPermissionSetup: boolean;
}>();

// Detect development mode - true if NODE_ENV is not 'production'
// This ensures development mode is the default when NODE_ENV is not set
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

// Default configuration
const DEFAULT_CONFIG: ElectronMainConfig = {
  serverUrl: process.env.VIBEFLOW_SERVER_URL || 'http://localhost:3000',
  isDevelopment: IS_DEVELOPMENT,
  autoLaunch: false,
};

// Global references
let mainWindow: BrowserWindow | null = null;
let trayManager: TrayManager | null = null;

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
    title: 'VibeFlow',
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
  mainWindow.on('close', (event) => {
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
    onShowWindow: showWindow,
    onStartPomodoro: () => {
      mainWindow?.webContents.send('tray:start-pomodoro');
    },
    onViewStatus: () => {
      mainWindow?.webContents.send('tray:view-status');
    },
    onOpenSettings: () => {
      mainWindow?.webContents.send('tray:open-settings');
    },
    onQuit: () => {
      app.quit();
    },
  });

  if (mainWindow) {
    trayManager.setMainWindow(mainWindow);
  }

  trayManager.create();
}

// Update tray menu state
function updateTrayMenu(state: Partial<TrayMenuState>): void {
  trayManager?.updateState(state);
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
  const connectionManager = getConnectionManager();

  ipcMain.handle('connection:getStatus', () => {
    return connectionManager.getStatus();
  });

  ipcMain.handle('connection:getInfo', () => {
    return connectionManager.getConnectionInfo();
  });

  ipcMain.handle('connection:connect', async () => {
    try {
      await connectionManager.connect();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('connection:disconnect', () => {
    connectionManager.disconnect();
    return { success: true };
  });

  ipcMain.handle('connection:reconnect', async () => {
    try {
      await connectionManager.reconnect();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Security handlers (Requirements: 9.4, 9.5, 9.6)
  ipcMain.handle('connection:getSecurityConfig', () => {
    return connectionManager.getSecurityConfig();
  });

  ipcMain.handle('connection:isSecure', () => {
    return connectionManager.isSecureConnection();
  });

  ipcMain.handle('connection:verifyCertificate', async () => {
    return await connectionManager.verifyCertificate();
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
  ipcMain.on('tray:updateMenu', (_, state: Partial<TrayMenuState>) => {
    updateTrayMenu(state);
  });

  // Legacy support for simple pomodoro active boolean
  ipcMain.on('tray:updatePomodoroState', (_, pomodoroActive: boolean) => {
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
}

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  createTray();
  setupIpcHandlers();
  setupFocusEnforcerIpc();
  setupSleepEnforcerIpc();
  await setupAutoLaunch();

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
  // Start connection monitoring
  connectionManager.connect();

  // Focus time app monitor for pomodoro/focus session enforcement
  let focusTimeMonitor: AppMonitor | null = null;

  // Connect sleep enforcer to policy updates (Requirements: 11.1, 11.2)
  connectionManager.onPolicyUpdate((policy) => {
    console.log('[Main] Received policy update:', {
      sleepTime: policy.sleepTime ? 'present' : 'absent',
      adhocFocusSession: policy.adhocFocusSession ? 'present' : 'absent',
      distractionAppsCount: policy.distractionApps?.length ?? 0,
    });
    
    // Update sleep enforcer config from policy
    if (policy.sleepTime) {
      console.log('[Main] Updating sleep enforcer config:', {
        enabled: policy.sleepTime.enabled,
        startTime: policy.sleepTime.startTime,
        endTime: policy.sleepTime.endTime,
        appsCount: policy.sleepTime.enforcementApps?.length ?? 0,
        isCurrentlyActive: policy.sleepTime.isCurrentlyActive,
        isSnoozed: policy.sleepTime.isSnoozed,
      });
      sleepEnforcer.updateConfig({
        enabled: policy.sleepTime.enabled,
        startTime: policy.sleepTime.startTime,
        endTime: policy.sleepTime.endTime,
        enforcementApps: policy.sleepTime.enforcementApps,
        isCurrentlyActive: policy.sleepTime.isCurrentlyActive,
        isSnoozed: policy.sleepTime.isSnoozed,
        snoozeEndTime: policy.sleepTime.snoozeEndTime,
      });
      
      // Start monitoring if enabled
      if (policy.sleepTime.enabled) {
        sleepEnforcer.start();
      }
    }
    
    // Handle focus session enforcement (pomodoro time)
    const isFocusSessionActive = policy.adhocFocusSession?.active ?? false;
    const hasDistractionApps = (policy.distractionApps?.length ?? 0) > 0;
    
    if (isFocusSessionActive && hasDistractionApps) {
      // Focus session is active - start monitoring distraction apps
      console.log('[Main] Focus session active, starting distraction app monitoring');
      
      // Update focus enforcer state
      focusEnforcer.setPomodoroActive(true);
      
      // Map policy distraction apps to the format expected by createFocusTimeMonitor
      const distractionAppsForMonitor = policy.distractionApps.map(app => ({
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
          apps: policy.distractionApps.map(app => ({
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

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });
});


// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app quit
app.on('before-quit', () => {
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
