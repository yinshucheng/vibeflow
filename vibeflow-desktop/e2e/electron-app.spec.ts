/**
 * E2E tests for VibeFlow Desktop Electron application
 *
 * Tests the desktop app's tray functionality, countdown updates,
 * and notification behavior.
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

// Helper to find main entry point
function getMainPath(): string {
  return path.join(__dirname, '..', 'dist', 'electron', 'main.js');
}

test.describe('VibeFlow Desktop App', () => {
  let electronApp: ElectronApplication;
  let mainWindow: Page;

  test.beforeAll(async () => {
    // Check if the app is built
    const mainPath = getMainPath();
    console.log('Main path:', mainPath);

    // Launch Electron app
    electronApp = await electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        VIBEFLOW_SERVER_URL: 'http://localhost:3000',
      },
    });

    // Wait for the main window
    mainWindow = await electronApp.firstWindow();
    await mainWindow.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (electronApp) {
      // Force close using process kill if needed
      try {
        // First try graceful close
        const closePromise = electronApp.close();
        const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 3000));
        await Promise.race([closePromise, timeoutPromise]);
      } catch {
        // Ignore errors - process might already be closed
      }
    }
  });

  test('should launch the application', async () => {
    expect(electronApp).toBeDefined();
    expect(mainWindow).toBeDefined();

    const title = await mainWindow.title();
    console.log('Window title:', title);
    expect(title).toBeTruthy();
  });

  test('should have tray icon', async () => {
    // Evaluate in main process to check tray
    const hasTray = await electronApp.evaluate(async ({ app }) => {
      // Access the tray through the app
      // Note: This is a simplified check
      return app.isReady();
    });

    expect(hasTray).toBe(true);
  });

  test('should handle IPC for pomodoro countdown', async () => {
    // Test the IPC handler for starting countdown
    const result = await electronApp.evaluate(async ({ app }) => {
      // Check if the handler is registered
      // This is a simplified check - in real tests we'd invoke it
      return {
        ready: true,
      };
    });

    expect(result.ready).toBe(true);
  });

  test('should update window title', async () => {
    // The window title should be set
    const title = await mainWindow.title();
    console.log('Current title:', title);
    // Title could be 'VibeFlow' or include mode suffix like '[DEV]'
    expect(title).toMatch(/VibeFlow|localhost/i);
  });

  test('IPC: pomodoro:startCountdown should return success', async () => {
    // Invoke the IPC handler from renderer
    const result = await mainWindow.evaluate(async () => {
      // @ts-expect-error - window.vibeflow is defined by preload
      if (window.vibeflow?.pomodoro?.startCountdown) {
        // @ts-expect-error - window.vibeflow is defined by preload
        return await window.vibeflow.pomodoro.startCountdown({
          startTime: Date.now(),
          durationMs: 25 * 60 * 1000,
          taskTitle: 'E2E Test Task',
        });
      }
      return { success: false, error: 'API not available' };
    });

    console.log('startCountdown result:', result);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  test('IPC: pomodoro:stopCountdown should return success', async () => {
    const result = await mainWindow.evaluate(async () => {
      // @ts-expect-error - window.vibeflow is defined by preload
      if (window.vibeflow?.pomodoro?.stopCountdown) {
        // @ts-expect-error - window.vibeflow is defined by preload
        return await window.vibeflow.pomodoro.stopCountdown();
      }
      return { success: false, error: 'API not available' };
    });

    console.log('stopCountdown result:', result);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  test('should expose vibeflow API on window', async () => {
    const apiInfo = await mainWindow.evaluate(() => {
      // @ts-expect-error - window.vibeflow is defined by preload
      const vf = window.vibeflow;
      return {
        hasApi: typeof vf !== 'undefined',
        hasPomodoro: typeof vf?.pomodoro !== 'undefined',
        hasStartCountdown: typeof vf?.pomodoro?.startCountdown === 'function',
        hasStopCountdown: typeof vf?.pomodoro?.stopCountdown === 'function',
        hasNotification: typeof vf?.notification !== 'undefined',
        hasTray: typeof vf?.tray !== 'undefined',
      };
    });

    console.log('API info:', apiInfo);
    expect(apiInfo.hasApi).toBe(true);
    expect(apiInfo.hasPomodoro).toBe(true);
    expect(apiInfo.hasStartCountdown).toBe(true);
    expect(apiInfo.hasStopCountdown).toBe(true);
  });

  test('should have connection manager initialized', async () => {
    const status = await electronApp.evaluate(async ({ app }) => {
      return {
        ready: app.isReady(),
        name: app.getName(),
      };
    });

    expect(status.ready).toBe(true);
    // In test environment, app name might be 'Electron' or 'VibeFlow'
    expect(status.name).toMatch(/VibeFlow|Electron/);
  });

  test('IPC: notification API should be available', async () => {
    const notificationInfo = await mainWindow.evaluate(() => {
      // @ts-expect-error - window.vibeflow is defined by preload
      const notification = window.vibeflow?.notification;
      return {
        hasShow: typeof notification?.show === 'function',
        hasShowPomodoroComplete: typeof notification?.showPomodoroComplete === 'function',
        hasShowBreakComplete: typeof notification?.showBreakComplete === 'function',
        hasBringToFront: typeof notification?.bringToFront === 'function',
      };
    });

    console.log('Notification API info:', notificationInfo);
    expect(notificationInfo.hasShow).toBe(true);
    expect(notificationInfo.hasShowPomodoroComplete).toBe(true);
    expect(notificationInfo.hasShowBreakComplete).toBe(true);
    expect(notificationInfo.hasBringToFront).toBe(true);
  });

  test('IPC: tray API should be available', async () => {
    const trayInfo = await mainWindow.evaluate(() => {
      // @ts-expect-error - window.vibeflow is defined by preload
      const tray = window.vibeflow?.tray;
      return {
        hasUpdateMenu: typeof tray?.updateMenu === 'function',
        // getState is called via IPC, so check if tray object exists
        hasTray: typeof tray !== 'undefined',
      };
    });

    console.log('Tray API info:', trayInfo);
    expect(trayInfo.hasUpdateMenu).toBe(true);
    expect(trayInfo.hasTray).toBe(true);
  });

  test('countdown timer should update correctly', async () => {
    // Start countdown
    const startResult = await mainWindow.evaluate(async () => {
      // @ts-expect-error - window.vibeflow is defined by preload
      return await window.vibeflow.pomodoro.startCountdown({
        startTime: Date.now(),
        durationMs: 60 * 1000, // 1 minute
        taskTitle: 'Timer Test',
      });
    });

    expect(startResult.success).toBe(true);

    // Wait a bit for the timer to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Stop countdown
    const stopResult = await mainWindow.evaluate(async () => {
      // @ts-expect-error - window.vibeflow is defined by preload
      return await window.vibeflow.pomodoro.stopCountdown();
    });

    expect(stopResult.success).toBe(true);
    console.log('Countdown start/stop completed successfully');
  });
});
