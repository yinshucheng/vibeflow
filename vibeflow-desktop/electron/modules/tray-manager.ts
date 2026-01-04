/**
 * Tray Manager Module
 * 
 * Manages the system tray icon and menu for VibeFlow desktop application.
 * Provides quick actions for starting pomodoro, viewing status, and accessing settings.
 * 
 * Requirements: 1.4, 2.4, 6.5, 10.5
 */

import {
  Tray,
  Menu,
  nativeImage,
  BrowserWindow,
  MenuItemConstructorOptions,
} from 'electron';
import * as path from 'path';
import { getModeDetector, type AppMode } from './mode-detector';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Tray menu state for dynamic updates
 */
export interface TrayMenuState {
  pomodoroActive: boolean;
  pomodoroTimeRemaining?: string; // e.g., "15:30"
  currentTask?: string;
  isWithinWorkHours: boolean;
  skipTokensRemaining: number;
  enforcementMode: 'strict' | 'gentle';
  /** Current app mode (development, staging, production) */
  appMode?: AppMode;
  /** Whether demo mode is active */
  isInDemoMode?: boolean;
}

/**
 * Tray manager configuration
 */
export interface TrayManagerConfig {
  onShowWindow: () => void;
  onStartPomodoro: () => void;
  onViewStatus: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
}

// ============================================================================
// Tray Manager Class
// ============================================================================

/**
 * TrayManager - Manages system tray icon and menu
 * 
 * This class handles:
 * - Creating and managing the system tray icon
 * - Building dynamic context menus based on app state
 * - Handling tray click events
 * - Updating tray tooltip with current status
 * - Displaying mode indicators (DEV, STAGING, DEMO)
 * 
 * Requirements: 1.4, 2.4, 6.5, 10.5
 */
export class TrayManager {
  private tray: Tray | null = null;
  private config: TrayManagerConfig;
  private menuState: TrayMenuState;
  private mainWindow: BrowserWindow | null = null;

  constructor(config: TrayManagerConfig) {
    this.config = config;
    
    // Initialize with mode detector state
    const modeDetector = getModeDetector();
    const modeResult = modeDetector.getMode();
    
    this.menuState = {
      pomodoroActive: false,
      isWithinWorkHours: false,
      skipTokensRemaining: 3,
      enforcementMode: 'gentle',
      appMode: modeResult.mode,
      isInDemoMode: modeResult.isInDemoMode,
    };
    
    // Listen for mode changes
    modeDetector.onModeChange((result) => {
      this.menuState.appMode = result.mode;
      this.menuState.isInDemoMode = result.isInDemoMode;
      this.updateMenu();
      this.updateTooltip();
      this.updateWindowTitle();
    });
  }

  /**
   * Set the main window reference
   * Requirements: 2.4
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    // Update window title with mode indicator
    this.updateWindowTitle();
  }
  
  /**
   * Update the window title with mode indicator
   * Requirements: 2.4
   */
  private updateWindowTitle(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }
    
    const modeDetector = getModeDetector();
    const suffix = modeDetector.getWindowTitleSuffix();
    const baseTitle = 'VibeFlow';
    
    this.mainWindow.setTitle(baseTitle + suffix);
  }

  /**
   * Create and initialize the system tray
   */
  create(): void {
    if (this.tray) {
      return; // Already created
    }

    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);

    // Set initial tooltip
    this.updateTooltip();

    // Build and set initial menu
    this.updateMenu();

    // Handle tray click - toggle window visibility
    this.tray.on('click', () => {
      this.config.onShowWindow();
    });

    // Handle right-click on Windows/Linux (macOS uses left-click for menu)
    if (process.platform !== 'darwin') {
      this.tray.on('right-click', () => {
        this.tray?.popUpContextMenu();
      });
    }

    console.log('[TrayManager] System tray created');
  }

  /**
   * Destroy the system tray
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      console.log('[TrayManager] System tray destroyed');
    }
  }

  /**
   * Update the tray menu state and rebuild menu
   */
  updateState(state: Partial<TrayMenuState>): void {
    this.menuState = { ...this.menuState, ...state };
    this.updateMenu();
    this.updateTooltip();
  }

  /**
   * Get current menu state
   */
  getState(): TrayMenuState {
    return { ...this.menuState };
  }

  /**
   * Create the tray icon
   * Uses template images on macOS for proper dark/light mode support
   */
  private createTrayIcon(): Electron.NativeImage {
    // Try to load icon from assets
    const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
    const iconPath = path.join(__dirname, '..', '..', 'assets', iconName);
    
    let icon = nativeImage.createFromPath(iconPath);
    
    // If icon doesn't exist, create a simple placeholder
    if (icon.isEmpty()) {
      // Create a simple 16x16 icon as fallback
      icon = this.createPlaceholderIcon();
    }

    // Mark as template image on macOS for proper dark/light mode
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }

    return icon;
  }

  /**
   * Create a placeholder icon when no icon file exists
   */
  private createPlaceholderIcon(): Electron.NativeImage {
    // For now, return an empty image - the tray will still work
    // In production, proper icons should be provided in assets/
    return nativeImage.createEmpty();
  }

  /**
   * Build and set the context menu
   */
  private updateMenu(): void {
    if (!this.tray) return;

    const menuTemplate = this.buildMenuTemplate();
    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Build the menu template based on current state
   * Requirements: 2.4, 6.5, 10.5
   */
  private buildMenuTemplate(): MenuItemConstructorOptions[] {
    const { 
      pomodoroActive, 
      pomodoroTimeRemaining, 
      currentTask,
      isWithinWorkHours,
      skipTokensRemaining,
      enforcementMode,
      appMode,
      isInDemoMode,
    } = this.menuState;

    const template: MenuItemConstructorOptions[] = [];

    // App name header with mode indicator
    // Requirements: 2.4, 6.5, 10.5
    let headerLabel = 'VibeFlow';
    if (isInDemoMode) {
      headerLabel = '🟣 VibeFlow [DEMO MODE]';
    } else if (appMode === 'development') {
      headerLabel = '🟢 VibeFlow [DEV MODE]';
    } else if (appMode === 'staging') {
      headerLabel = '🟠 VibeFlow [STAGING]';
    }
    
    template.push({
      label: headerLabel,
      enabled: false,
    });

    template.push({ type: 'separator' });

    // Status section
    if (pomodoroActive && pomodoroTimeRemaining) {
      template.push({
        label: `⏱ ${pomodoroTimeRemaining} remaining`,
        enabled: false,
      });
      
      if (currentTask) {
        template.push({
          label: `📋 ${this.truncateText(currentTask, 30)}`,
          enabled: false,
        });
      }
      
      template.push({ type: 'separator' });
    }

    // Show window
    template.push({
      label: 'Show VibeFlow',
      accelerator: 'CmdOrCtrl+Shift+V',
      click: () => this.config.onShowWindow(),
    });

    template.push({ type: 'separator' });

    // Pomodoro actions
    if (pomodoroActive) {
      template.push({
        label: '⏸ Pomodoro Active',
        enabled: false,
      });
    } else {
      template.push({
        label: '▶️ Start Pomodoro',
        click: () => {
          this.config.onShowWindow();
          this.config.onStartPomodoro();
        },
      });
    }

    // View status
    template.push({
      label: '📊 View Status',
      click: () => {
        this.config.onShowWindow();
        this.config.onViewStatus();
      },
    });

    template.push({ type: 'separator' });

    // Mode and tokens info
    const modeLabel = enforcementMode === 'strict' ? '🔒 Strict Mode' : '🔓 Gentle Mode';
    template.push({
      label: modeLabel,
      enabled: false,
    });

    template.push({
      label: `🎫 ${skipTokensRemaining} skip tokens left`,
      enabled: false,
    });

    if (isWithinWorkHours) {
      template.push({
        label: '⏰ Within work hours',
        enabled: false,
      });
    }
    
    // Show demo mode status if active
    // Requirements: 6.5
    if (isInDemoMode) {
      template.push({ type: 'separator' });
      template.push({
        label: '🟣 Demo Mode Active',
        enabled: false,
      });
      template.push({
        label: '   Enforcement disabled',
        enabled: false,
      });
    }

    template.push({ type: 'separator' });

    // Settings
    template.push({
      label: '⚙️ Settings',
      click: () => {
        this.config.onShowWindow();
        this.config.onOpenSettings();
      },
    });

    template.push({ type: 'separator' });

    // Quit
    template.push({
      label: 'Quit VibeFlow',
      accelerator: 'CmdOrCtrl+Q',
      click: () => this.config.onQuit(),
    });

    return template;
  }

  /**
   * Update the tray tooltip
   * Requirements: 10.5
   */
  private updateTooltip(): void {
    if (!this.tray) return;

    const { pomodoroActive, pomodoroTimeRemaining, currentTask, isInDemoMode, appMode } = this.menuState;

    let tooltip = 'VibeFlow';
    
    // Add mode suffix to tooltip
    // Requirements: 10.5
    const modeDetector = getModeDetector();
    tooltip += modeDetector.getTrayTooltipSuffix();

    if (pomodoroActive) {
      tooltip = `VibeFlow - ${pomodoroTimeRemaining || 'Pomodoro Active'}`;
      if (currentTask) {
        tooltip += `\n${this.truncateText(currentTask, 40)}`;
      }
    }
    
    // Add demo mode indicator
    // Requirements: 6.5
    if (isInDemoMode) {
      tooltip += '\n🟣 Demo Mode Active';
    } else if (appMode === 'development') {
      tooltip += '\n🟢 Development Mode';
    } else if (appMode === 'staging') {
      tooltip += '\n🟠 Staging Mode';
    }

    this.tray.setToolTip(tooltip);
  }

  /**
   * Truncate text to a maximum length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Show a balloon notification (Windows) or notification (macOS/Linux)
   */
  showNotification(title: string, body: string): void {
    if (!this.tray) return;

    // On Windows, use balloon
    if (process.platform === 'win32') {
      this.tray.displayBalloon({
        title,
        content: body,
        iconType: 'info',
      });
    }
    // On macOS/Linux, use Notification API (handled separately)
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let trayManagerInstance: TrayManager | null = null;

/**
 * Get or create the tray manager singleton
 */
export function getTrayManager(config?: TrayManagerConfig): TrayManager {
  if (!trayManagerInstance && config) {
    trayManagerInstance = new TrayManager(config);
  }
  if (!trayManagerInstance) {
    throw new Error('TrayManager not initialized. Call with config first.');
  }
  return trayManagerInstance;
}

/**
 * Reset the tray manager singleton (for testing)
 */
export function resetTrayManager(): void {
  if (trayManagerInstance) {
    trayManagerInstance.destroy();
    trayManagerInstance = null;
  }
}

export default TrayManager;
