/**
 * App Controller Module (macOS)
 * 
 * Provides system-level control over macOS applications using AppleScript.
 * Handles getting running apps, quitting apps, and hiding apps.
 * 
 * Requirements: 2.4, 2.5
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { DistractionApp, AppControlResult, RunningApp } from '../types';

const execAsync = promisify(exec);

// ============================================================================
// AppleScript Templates
// ============================================================================

/**
 * AppleScript command templates for macOS app control
 */
const APPLESCRIPT_TEMPLATES = {
  /**
   * Quit an application by bundle ID (graceful)
   */
  quitAppByBundleId: (bundleId: string) => `
    tell application id "${bundleId}"
      quit
    end tell
  `,

  /**
   * Force quit an application by bundle ID using System Events
   * This is more forceful than the regular quit command
   */
  forceQuitAppByBundleId: (bundleId: string) => `
    tell application "System Events"
      set targetProcess to first application process whose bundle identifier is "${bundleId}"
      set processName to name of targetProcess
      do shell script "killall -9 " & quoted form of processName
    end tell
  `,

  /**
   * Quit an application by name
   */
  quitAppByName: (appName: string) => `
    tell application "${appName}"
      quit
    end tell
  `,

  /**
   * Hide an application by bundle ID
   */
  hideAppByBundleId: (bundleId: string) => `
    tell application "System Events"
      set targetApp to first application process whose bundle identifier is "${bundleId}"
      set visible of targetApp to false
    end tell
  `,

  /**
   * Hide an application by name
   */
  hideAppByName: (appName: string) => `
    tell application "System Events"
      set visible of process "${appName}" to false
    end tell
  `,

  /**
   * Get list of running applications with their bundle IDs
   * Uses a more robust approach that handles edge cases
   */
  getRunningApps: `
    tell application "System Events"
      set appList to {}
      try
        set allProcs to every application process
        repeat with proc in allProcs
          try
            set bgOnly to background only of proc
            if bgOnly is false then
              set procName to name of proc
              set procBundleId to bundle identifier of proc
              set procPid to unix id of proc
              set isFront to frontmost of proc
              if procBundleId is not missing value then
                set end of appList to procName & "|" & procBundleId & "|" & procPid & "|" & isFront
              end if
            end if
          end try
        end repeat
      end try
      return appList
    end tell
  `,

  /**
   * Check if an application is running by bundle ID
   */
  isAppRunning: (bundleId: string) => `
    tell application "System Events"
      return exists (first application process whose bundle identifier is "${bundleId}")
    end tell
  `,

  /**
   * Activate (bring to front) an application by bundle ID
   */
  activateApp: (bundleId: string) => `
    tell application id "${bundleId}"
      activate
    end tell
  `,

  /**
   * Get the frontmost application
   */
  getFrontmostApp: `
    tell application "System Events"
      set frontApp to first application process whose frontmost is true
      return (name of frontApp) & "|" & (bundle identifier of frontApp)
    end tell
  `,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Execute an AppleScript command with multiple lines
 */
async function executeMultiLineAppleScript(script: string): Promise<string> {
  try {
    // For multi-line scripts, use -e for each line or write to temp file
    const lines = script.split('\n').filter(line => line.trim());
    const args = lines.map(line => `-e '${line.replace(/'/g, "'\\''")}'`).join(' ');
    const { stdout } = await execAsync(`osascript ${args}`);
    return stdout.trim();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`AppleScript execution failed: ${errorMessage}`);
  }
}

/**
 * Parse the output of getRunningApps AppleScript
 */
function parseRunningAppsOutput(output: string): RunningApp[] {
  if (!output || output === '') {
    return [];
  }

  const apps: RunningApp[] = [];
  
  // Output format: "name|bundleId|pid|frontmost, name|bundleId|pid|frontmost, ..."
  const appStrings = output.split(', ');
  
  for (const appString of appStrings) {
    const parts = appString.split('|');
    if (parts.length >= 4) {
      const [name, bundleId, pidStr, isFrontStr] = parts;
      const pid = parseInt(pidStr, 10);
      const isActive = isFrontStr === 'true';
      
      if (name && bundleId && !isNaN(pid)) {
        apps.push({
          name,
          bundleId,
          pid,
          isActive,
        });
      }
    }
  }
  
  return apps;
}

// ============================================================================
// App Controller API
// ============================================================================

/**
 * Get list of currently running applications
 * Requirements: 3.7
 */
export async function getRunningApps(): Promise<RunningApp[]> {
  try {
    const output = await executeMultiLineAppleScript(APPLESCRIPT_TEMPLATES.getRunningApps);
    return parseRunningAppsOutput(output);
  } catch (error) {
    console.error('[AppController] Failed to get running apps:', error);
    return [];
  }
}

/**
 * Check if a specific application is running
 */
export async function isAppRunning(bundleId: string): Promise<boolean> {
  try {
    const output = await executeMultiLineAppleScript(
      APPLESCRIPT_TEMPLATES.isAppRunning(bundleId)
    );
    return output.toLowerCase() === 'true';
  } catch (error) {
    console.error(`[AppController] Failed to check if app ${bundleId} is running:`, error);
    return false;
  }
}

/**
 * Quit an application by bundle ID
 * Requirements: 2.4
 * 
 * First attempts a graceful quit, then verifies the app is closed.
 * If the app is still running after graceful quit, uses force quit.
 */
export async function quitApp(bundleId: string): Promise<AppControlResult> {
  try {
    // First check if the app is running
    const isRunning = await isAppRunning(bundleId);
    if (!isRunning) {
      return { success: true }; // App not running, consider it a success
    }

    // Try graceful quit first
    try {
      await executeMultiLineAppleScript(
        APPLESCRIPT_TEMPLATES.quitAppByBundleId(bundleId)
      );
      
      // Wait a moment for the app to quit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if app is still running
      const stillRunning = await isAppRunning(bundleId);
      if (!stillRunning) {
        console.log(`[AppController] Successfully quit app (graceful): ${bundleId}`);
        return { success: true };
      }
      
      console.log(`[AppController] App ${bundleId} still running after graceful quit, trying force quit...`);
    } catch (gracefulError) {
      console.log(`[AppController] Graceful quit failed for ${bundleId}, trying force quit...`);
    }

    // Force quit if graceful quit didn't work
    try {
      await executeMultiLineAppleScript(
        APPLESCRIPT_TEMPLATES.forceQuitAppByBundleId(bundleId)
      );
      
      // Wait a moment and verify
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const stillRunningAfterForce = await isAppRunning(bundleId);
      if (!stillRunningAfterForce) {
        console.log(`[AppController] Successfully quit app (force): ${bundleId}`);
        return { success: true };
      }
      
      // Last resort: use pkill directly
      console.log(`[AppController] Force quit via AppleScript failed, trying pkill...`);
      await execAsync(`pkill -9 -f "${bundleId}" || true`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      const finalCheck = await isAppRunning(bundleId);
      
      if (!finalCheck) {
        console.log(`[AppController] Successfully quit app (pkill): ${bundleId}`);
        return { success: true };
      }
      
      return { success: false, error: 'App could not be terminated' };
    } catch (forceError) {
      const errorMessage = forceError instanceof Error ? forceError.message : String(forceError);
      console.error(`[AppController] Force quit failed for ${bundleId}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AppController] Failed to quit app ${bundleId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Quit an application by name
 */
export async function quitAppByName(appName: string): Promise<AppControlResult> {
  try {
    await executeMultiLineAppleScript(
      APPLESCRIPT_TEMPLATES.quitAppByName(appName)
    );
    
    console.log(`[AppController] Successfully quit app by name: ${appName}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AppController] Failed to quit app ${appName}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Hide an application by bundle ID
 * Requirements: 2.5
 */
export async function hideApp(bundleId: string): Promise<AppControlResult> {
  try {
    // First check if the app is running
    const isRunning = await isAppRunning(bundleId);
    if (!isRunning) {
      return { success: true }; // App not running, consider it a success
    }

    await executeMultiLineAppleScript(
      APPLESCRIPT_TEMPLATES.hideAppByBundleId(bundleId)
    );
    
    console.log(`[AppController] Successfully hid app: ${bundleId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AppController] Failed to hide app ${bundleId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Hide an application by name
 */
export async function hideAppByName(appName: string): Promise<AppControlResult> {
  try {
    await executeMultiLineAppleScript(
      APPLESCRIPT_TEMPLATES.hideAppByName(appName)
    );
    
    console.log(`[AppController] Successfully hid app by name: ${appName}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AppController] Failed to hide app ${appName}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Activate (bring to front) an application
 */
export async function activateApp(bundleId: string): Promise<AppControlResult> {
  try {
    await executeMultiLineAppleScript(
      APPLESCRIPT_TEMPLATES.activateApp(bundleId)
    );
    
    console.log(`[AppController] Successfully activated app: ${bundleId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AppController] Failed to activate app ${bundleId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get the currently frontmost application
 */
export async function getFrontmostApp(): Promise<{ name: string; bundleId: string } | null> {
  try {
    const output = await executeMultiLineAppleScript(
      APPLESCRIPT_TEMPLATES.getFrontmostApp
    );
    
    const [name, bundleId] = output.split('|');
    if (name && bundleId) {
      return { name, bundleId };
    }
    return null;
  } catch (error) {
    console.error('[AppController] Failed to get frontmost app:', error);
    return null;
  }
}

/**
 * Close multiple distraction apps based on their configured action
 * Requirements: 2.4, 2.5
 */
export async function closeDistractionApps(
  apps: DistractionApp[]
): Promise<Map<string, AppControlResult>> {
  const results = new Map<string, AppControlResult>();
  
  for (const app of apps) {
    let result: AppControlResult;
    
    if (app.action === 'force_quit') {
      result = await quitApp(app.bundleId);
    } else {
      result = await hideApp(app.bundleId);
    }
    
    results.set(app.bundleId, result);
  }
  
  return results;
}

/**
 * Filter running apps to find distraction apps
 */
export async function getRunningDistractionApps(
  distractionApps: DistractionApp[]
): Promise<RunningApp[]> {
  const runningApps = await getRunningApps();
  const distractionBundleIds = new Set(distractionApps.map(app => app.bundleId));
  
  return runningApps.filter(app => distractionBundleIds.has(app.bundleId));
}

// ============================================================================
// Export Service
// ============================================================================

export const appControllerService = {
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
  // Export templates for testing
  APPLESCRIPT_TEMPLATES,
};

export default appControllerService;
