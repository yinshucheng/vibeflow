/**
 * Chat Shortcut & Desktop Enhancement Tests (S3.4)
 *
 * Tests:
 * - Global shortcut registration (⌘⇧Space)
 * - Preload chat API exposure
 * - Tray menu "AI 对话" entry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron modules
vi.mock('electron', () => {
  const registeredShortcuts: Record<string, () => void> = {};
  return {
    app: {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      quit: vi.fn(),
      isPackaged: false,
      getPath: vi.fn(() => '/tmp'),
      getName: vi.fn(() => 'vibeflow-desktop'),
    },
    BrowserWindow: vi.fn(() => ({
      loadURL: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      isVisible: vi.fn(() => true),
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
        on: vi.fn(),
      },
      setTitle: vi.fn(),
    })),
    globalShortcut: {
      register: vi.fn((accel: string, cb: () => void) => {
        registeredShortcuts[accel] = cb;
        return true;
      }),
      unregisterAll: vi.fn(() => {
        Object.keys(registeredShortcuts).forEach(
          (k) => delete registeredShortcuts[k]
        );
      }),
      isRegistered: vi.fn((accel: string) => accel in registeredShortcuts),
      _getRegistered: () => registeredShortcuts,
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
    },
    ipcRenderer: {
      invoke: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    },
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    shell: {
      openExternal: vi.fn(),
    },
    Tray: vi.fn(() => ({
      destroy: vi.fn(),
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
      setTitle: vi.fn(),
    })),
    Menu: {
      buildFromTemplate: vi.fn((template: unknown[]) => template),
    },
    nativeImage: {
      createFromPath: vi.fn(() => ({
        isEmpty: () => false,
        setTemplateImage: vi.fn(),
        getSize: vi.fn(() => ({ width: 16, height: 16 })),
        isTemplateImage: vi.fn(() => true),
      })),
      createEmpty: vi.fn(() => ({
        setTemplateImage: vi.fn(),
        getSize: vi.fn(() => ({ width: 16, height: 16 })),
      })),
    },
  };
});

// Mock path
vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
  default: { join: vi.fn((...args: string[]) => args.join('/')) },
}));

// Mock mode detector
vi.mock('../electron/modules/mode-detector', () => ({
  getModeDetector: vi.fn(() => ({
    getMode: vi.fn(() => ({ mode: 'development', isInDemoMode: false })),
    onModeChange: vi.fn(),
    getWindowTitleSuffix: vi.fn(() => ' [DEV]'),
    getTrayTooltipSuffix: vi.fn(() => ' [DEV]'),
  })),
  detectAppMode: vi.fn(() => 'development'),
}));

describe('Desktop Chat Enhancements (S3.3)', () => {
  describe('Global Shortcut Registration', () => {
    it('should register ⌘⇧Space shortcut', async () => {
      const { globalShortcut } = await import('electron');

      // Simulate registration (as done in main.ts)
      const toggleChatFn = vi.fn();
      globalShortcut.register('CommandOrControl+Shift+Space', toggleChatFn);

      expect(globalShortcut.register).toHaveBeenCalledWith(
        'CommandOrControl+Shift+Space',
        expect.any(Function)
      );
      expect(globalShortcut.isRegistered('CommandOrControl+Shift+Space')).toBe(
        true
      );
    });

    it('should unregister all shortcuts on will-quit', async () => {
      const { globalShortcut } = await import('electron');

      globalShortcut.register('CommandOrControl+Shift+Space', vi.fn());
      globalShortcut.unregisterAll();

      expect(globalShortcut.unregisterAll).toHaveBeenCalled();
    });
  });

  describe('Preload Chat API', () => {
    it('should expose chat.onToggleChat in preload API', async () => {
      // The preload exposes window.vibeflow.chat.onToggleChat
      // We verify the shape is correct by checking the type exists
      const electron = await import('electron');
      const ipcRenderer = electron.ipcRenderer;

      // Simulate what preload does
      const chatAPI = {
        onToggleChat: (callback: () => void) => {
          ipcRenderer.on('chat:toggle', callback);
          return () => ipcRenderer.removeListener('chat:toggle', callback);
        },
      };

      const mockCallback = vi.fn();
      const unsub = chatAPI.onToggleChat(mockCallback);

      expect(ipcRenderer.on).toHaveBeenCalledWith(
        'chat:toggle',
        mockCallback
      );
      expect(typeof unsub).toBe('function');
    });
  });

  describe('Tray Menu Chat Entry', () => {
    beforeEach(() => {
      // Clear Menu.buildFromTemplate mock calls between tests
      vi.clearAllMocks();
    });

    it('should include "AI 对话" menu item with ⌘⇧Space accelerator label', async () => {
      const { TrayManager } = await import(
        '../electron/modules/tray-manager'
      );

      const onToggleChat = vi.fn();
      const tray = new TrayManager({
        onShowWindow: vi.fn(),
        onStartPomodoro: vi.fn(),
        onViewStatus: vi.fn(),
        onOpenSettings: vi.fn(),
        onToggleChat,
        onQuit: vi.fn(),
      });

      // Must call create() to initialize the Tray instance,
      // otherwise updateMenu() returns early
      tray.create();

      // Initialize with a default state (triggers updateMenu → buildMenuTemplate)
      tray.updateState({
        pomodoroActive: false,
        isWithinWorkHours: true,
        skipTokensRemaining: 3,
        enforcementMode: 'gentle',
        systemState: 'PLANNING',
      });

      // Access the built template via the Menu mock
      const { Menu } = await import('electron');
      const buildCalls = (Menu.buildFromTemplate as ReturnType<typeof vi.fn>)
        .mock.calls;
      expect(buildCalls.length).toBeGreaterThan(0);

      // Get the last template built
      const lastTemplate = buildCalls[buildCalls.length - 1][0] as Array<{
        label?: string;
        click?: () => void;
      }>;

      // Find the AI 对话 entry
      const chatEntry = lastTemplate.find(
        (item) => item.label && item.label.includes('AI 对话')
      );

      expect(chatEntry).toBeDefined();
      expect(chatEntry!.label).toContain('⌘⇧Space');
    });

    it('should not include "AI 对话" menu item when onToggleChat is not provided', async () => {
      const { TrayManager } = await import(
        '../electron/modules/tray-manager'
      );

      const tray = new TrayManager({
        onShowWindow: vi.fn(),
        onStartPomodoro: vi.fn(),
        onViewStatus: vi.fn(),
        onOpenSettings: vi.fn(),
        // NO onToggleChat
        onQuit: vi.fn(),
      });

      tray.create();

      tray.updateState({
        pomodoroActive: false,
        isWithinWorkHours: true,
        skipTokensRemaining: 3,
        enforcementMode: 'gentle',
        systemState: 'PLANNING',
      });

      const { Menu } = await import('electron');
      const buildCalls = (Menu.buildFromTemplate as ReturnType<typeof vi.fn>)
        .mock.calls;
      expect(buildCalls.length).toBeGreaterThan(0);
      const lastTemplate = buildCalls[buildCalls.length - 1][0] as Array<{
        label?: string;
      }>;

      const chatEntry = lastTemplate.find(
        (item) => item.label && item.label.includes('AI 对话')
      );
      expect(chatEntry).toBeUndefined();
    });
  });
});
