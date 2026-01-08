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
 * Enhanced to support system state display and rest time tracking
 */
export interface TrayMenuState {
  // Existing fields
  pomodoroActive: boolean;
  pomodoroTimeRemaining?: string; // MM:SS format (e.g., "15:30")
  currentTask?: string;
  isWithinWorkHours: boolean; // Reserved for future use
  skipTokensRemaining: number;
  enforcementMode: 'strict' | 'gentle';
  /** Current app mode (development, staging, production) */
  appMode?: AppMode;
  /** Whether demo mode is active */
  isInDemoMode?: boolean;
  
  // New fields for enhanced functionality
  /** Current system state for non-pomodoro display */
  systemState: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST' | 'OVER_REST';
  /** Rest countdown time in MM:SS format (pre-formatted) */
  restTimeRemaining?: string;
  /** Over-rest duration display (e.g., "15 min") (pre-formatted) */
  overRestDuration?: string;
}

/**
 * Tray manager configuration
 */
export interface TrayManagerConfig {
  /** Called when tray icon is clicked - should toggle window visibility (Requirements: 6.1) */
  onShowWindow: () => void;
  /** Called when "Start Pomodoro" menu item is clicked - should show window and navigate to pomodoro page (Requirements: 6.4) */
  onStartPomodoro: () => void;
  /** Called when "View Status" menu item is clicked - should show window and navigate to dashboard (Requirements: 6.5) */
  onViewStatus: () => void;
  /** Called when "Settings" menu item is clicked - should show window and navigate to settings (Requirements: 6.6) */
  onOpenSettings: () => void;
  onQuit: () => void;
}

// ============================================================================
// IPC Event Types for State Synchronization
// ============================================================================

/**
 * IPC event for updating tray state
 */
export interface TrayStateUpdateEvent {
  type: 'tray:updateState';
  payload: Partial<TrayMenuState>;
}

/**
 * IPC event for pomodoro state changes
 */
export interface PomodoroStateEvent {
  type: 'pomodoro:stateChange';
  payload: {
    active: boolean;
    timeRemaining?: string; // Pre-formatted MM:SS
    taskName?: string;
    taskId?: string;
  };
}

/**
 * IPC event for system state changes
 */
export interface SystemStateEvent {
  type: 'system:stateChange';
  payload: {
    state: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST' | 'OVER_REST';
    restTimeRemaining?: string; // Pre-formatted MM:SS
    overRestDuration?: string; // Pre-formatted duration (e.g., "15 min")
  };
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
      // Initialize new fields
      systemState: 'PLANNING', // Default to PLANNING state
      restTimeRemaining: undefined,
      overRestDuration: undefined,
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

    // Handle tray click - toggle window visibility (Requirements: 6.1)
    this.tray.on('click', () => {
      // Left-click should show/hide the main window
      this.handleTrayClick();
    });

    // Handle right-click on Windows/Linux (macOS uses left-click for menu) (Requirements: 6.2)
    if (process.platform !== 'darwin') {
      this.tray.on('right-click', () => {
        this.tray?.popUpContextMenu();
      });
    }

    // Handle double-click - always show window (additional convenience)
    this.tray.on('double-click', () => {
      this.config.onShowWindow();
    });

    console.log('[TrayManager] System tray created');
  }

  /**
   * Handle tray click - toggle window visibility
   * Requirements: 6.1
   */
  private handleTrayClick(): void {
    // Requirements: 6.1 - Left-click should show/hide the main window
    // On macOS, left-click typically shows context menu, but we can still handle window toggle
    // On Windows/Linux, left-click should toggle window visibility
    
    if (process.platform === 'darwin') {
      // On macOS, follow the configured behavior (could be toggle or always show)
      this.config.onShowWindow();
    } else {
      // On Windows/Linux, implement proper show/hide toggle
      this.config.onShowWindow();
    }
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
    this.updateTrayTitle();
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
   * Includes enhanced fallback logic for template image failures
   * Requirements: 3.1, 3.2
   */
  private createTrayIcon(): Electron.NativeImage {
    // Try to load icon from assets
    const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
    const iconPath = path.join(__dirname, '..', '..', 'assets', iconName);
    
    let icon = nativeImage.createFromPath(iconPath);
    let usingPlaceholder = false;
    
    // If icon doesn't exist or is empty, create a placeholder
    if (icon.isEmpty()) {
      console.log(`[TrayManager] Icon file not found at ${iconPath}, creating placeholder`);
      icon = this.createPlaceholderIcon();
      usingPlaceholder = true;
    }

    // Enhanced template image handling for macOS
    if (process.platform === 'darwin') {
      try {
        // Verify template image mode is properly set
        icon.setTemplateImage(true);
        
        // Test if template image mode is working by checking if the image is valid
        if (!icon.isEmpty()) {
          console.log('[TrayManager] Template image mode enabled for macOS');
        } else {
          throw new Error('Template image became empty after setting template mode');
        }
      } catch (error) {
        console.warn('[TrayManager] Template image mode failed, falling back to standard mode:', error);
        
        // Fallback: try to reload the icon without template mode
        if (!usingPlaceholder) {
          icon = nativeImage.createFromPath(iconPath);
        }
        
        // If still empty or failed, use placeholder
        if (icon.isEmpty()) {
          console.log('[TrayManager] Fallback to placeholder icon due to template image failure');
          icon = this.createPlaceholderIcon();
        }
        
        // Don't set template mode for fallback
        console.log('[TrayManager] Using standard icon mode as fallback');
      }
    } else {
      // Non-macOS platforms don't use template images
      console.log(`[TrayManager] Using standard icon mode for ${process.platform}`);
    }

    // Final validation
    if (icon.isEmpty()) {
      console.error('[TrayManager] All icon creation methods failed, using empty icon');
    } else {
      const size = icon.getSize();
      console.log(`[TrayManager] Tray icon created successfully (${size.width}x${size.height})`);
      
      // Log visibility test results
      if (process.platform === 'darwin') {
        const isTemplate = icon.isTemplateImage();
        console.log(`[TrayManager] macOS template mode: ${isTemplate ? 'enabled' : 'disabled'}`);
        console.log('[TrayManager] Icon should adapt to light/dark menu bar automatically');
      }
    }

    return icon;
  }

  /**
   * Create a placeholder icon when no icon file exists
   * Uses brand colors with proper contrast for menu bar visibility
   * Requirements: 3.3, 3.4
   */
  private createPlaceholderIcon(): Electron.NativeImage {
    const size = 16;
    
    // Create a simple 16x16 PNG buffer with brand colors
    // Using a minimal approach since we're in the main process
    
    // Create a simple circular icon with "V" using raw buffer data
    // This creates a 16x16 RGBA image
    const width = size;
    const height = size;
    const channels = 4; // RGBA
    const buffer = Buffer.alloc(width * height * channels);
    
    // Brand colors
    const brandColor = { r: 139, g: 92, b: 246, a: 255 }; // #8B5CF6 (Purple-500)
    const textColor = { r: 255, g: 255, b: 255, a: 255 }; // White
    const transparent = { r: 0, g: 0, b: 0, a: 0 };
    
    // Fill the buffer with a circular shape
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * channels;
        
        // Calculate distance from center
        const centerX = width / 2;
        const centerY = height / 2;
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        
        // Create circular shape
        if (distance <= (size / 2) - 1) {
          // Inside circle - use brand color
          buffer[index] = brandColor.r;     // R
          buffer[index + 1] = brandColor.g; // G
          buffer[index + 2] = brandColor.b; // B
          buffer[index + 3] = brandColor.a; // A
          
          // Add simple "V" pattern in the center area
          const isInVPattern = (
            (Math.abs(x - centerX) < 2 && y > centerY - 2 && y < centerY + 2) ||
            (Math.abs(x - centerX) < 3 && y > centerY + 1 && y < centerY + 3)
          );
          
          if (isInVPattern) {
            buffer[index] = textColor.r;     // R
            buffer[index + 1] = textColor.g; // G
            buffer[index + 2] = textColor.b; // B
            buffer[index + 3] = textColor.a; // A
          }
        } else {
          // Outside circle - transparent
          buffer[index] = transparent.r;     // R
          buffer[index + 1] = transparent.g; // G
          buffer[index + 2] = transparent.b; // B
          buffer[index + 3] = transparent.a; // A
        }
      }
    }
    
    const icon = nativeImage.createFromBuffer(buffer, { width, height });
    console.log('[TrayManager] Created placeholder icon with brand colors (16x16 circular)');
    
    return icon;
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
   * Requirements: 2.4, 6.5, 10.5, 2.1-2.4, 8.1-8.3
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
      systemState,
      restTimeRemaining,
      overRestDuration,
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

    // Status section - Enhanced to handle new system states
    // Requirements: 2.1-2.4, 8.1-8.3
    if (pomodoroActive && pomodoroTimeRemaining) {
      // Active pomodoro display
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
    } else {
      // System state display when no pomodoro is active
      // Requirements: 2.1-2.4, 8.1-8.3
      switch (systemState) {
        case 'PLANNING':
          template.push({
            label: '📋 Planning',
            enabled: false,
          });
          break;
        case 'REST':
          if (restTimeRemaining) {
            template.push({
              label: `☕ Rest Mode (${restTimeRemaining} remaining)`,
              enabled: false,
            });
          } else {
            template.push({
              label: '☕ Rest Mode',
              enabled: false,
            });
          }
          break;
        case 'OVER_REST':
          if (overRestDuration) {
            template.push({
              label: `⚠️ Over Rest (${overRestDuration})`,
              enabled: false,
            });
          } else {
            template.push({
              label: '⚠️ Over Rest',
              enabled: false,
            });
          }
          break;
        case 'LOCKED':
          template.push({
            label: '🔒 Locked',
            enabled: false,
          });
          break;
        case 'FOCUS':
          // FOCUS state should typically have an active pomodoro, but handle edge case
          template.push({
            label: '🎯 Focus Mode',
            enabled: false,
          });
          break;
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

    // Pomodoro actions - Dynamic based on state
    // Requirements: 4.1, 4.2
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

    // System information section - Enhanced grouping
    // Requirements: 4.1, 4.2
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
   * Requirements: 10.5, 1.3, 8.3, 6.3
   * 
   * Note: Tooltip timing (500ms requirement 6.3) is controlled by the operating system.
   * Electron uses the native system tooltip which typically appears within 500ms on hover.
   */
  private updateTooltip(): void {
    if (!this.tray) return;

    const { 
      pomodoroActive, 
      pomodoroTimeRemaining, 
      currentTask, 
      isInDemoMode, 
      appMode,
      systemState,
      restTimeRemaining,
      overRestDuration,
    } = this.menuState;

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
    } else {
      // System state display when no pomodoro is active
      // Requirements: 1.3, 8.3
      switch (systemState) {
        case 'PLANNING':
          tooltip = 'VibeFlow - Planning';
          break;
        case 'REST':
          if (restTimeRemaining) {
            tooltip = `VibeFlow - Rest (${restTimeRemaining} remaining)`;
          } else {
            tooltip = 'VibeFlow - Rest Mode';
          }
          break;
        case 'OVER_REST':
          if (overRestDuration) {
            tooltip = `VibeFlow - Over Rest (${overRestDuration})`;
          } else {
            tooltip = 'VibeFlow - Over Rest';
          }
          break;
        case 'LOCKED':
          tooltip = 'VibeFlow - Locked';
          break;
        case 'FOCUS':
          tooltip = 'VibeFlow - Focus Mode';
          break;
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
   * Update the tray title (displayed next to icon in menu bar)
   * On macOS, this shows text directly in the menu bar
   */
  private updateTrayTitle(): void {
    if (!this.tray) return;

    const {
      pomodoroActive,
      pomodoroTimeRemaining,
      currentTask,
      systemState,
      restTimeRemaining,
      overRestDuration,
      dailyProgress,
    } = this.menuState;

    let title = '';

    if (pomodoroActive && pomodoroTimeRemaining) {
      // Show countdown + task name in menu bar during pomodoro
      const taskDisplay = currentTask ? ` ${this.truncateText(currentTask, 30)}` : '';
      title = `🎯 ${pomodoroTimeRemaining}${taskDisplay}`;
    } else {
      // Show state indicator when not in pomodoro
      switch (systemState) {
        case 'FOCUS':
          title = '🎯 Focus';
          break;
        case 'REST':
          // Show rest time + progress
          if (restTimeRemaining && dailyProgress) {
            title = `☕ ${restTimeRemaining} 已完成 ${dailyProgress}`;
          } else if (restTimeRemaining) {
            title = `☕ ${restTimeRemaining} 休息中`;
          } else {
            title = '☕ 休息一下';
          }
          break;
        case 'OVER_REST':
          // Fun messages for over-rest
          if (overRestDuration) {
            const messages = ['该干活啦', '摸鱼结束', '老板来了', '回来工作'];
            const msgIndex = Math.floor(Date.now() / 10000) % messages.length;
            title = `⚠️ +${overRestDuration} ${messages[msgIndex]}`;
          } else {
            title = '⚠️ 休息超时了';
          }
          break;
        case 'PLANNING':
          title = dailyProgress ? `📋 规划中 ${dailyProgress}` : '📋 规划中';
          break;
        case 'LOCKED':
          title = '🔒 已锁定';
          break;
      }
    }

    this.tray.setTitle(title);
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
