#!/usr/bin/env node
/**
 * Process Guardian Main Entry Point
 * 
 * This is the main entry point for the Process Guardian when run as a standalone process.
 * It monitors the VibeFlow desktop app and restarts it if it crashes.
 * 
 * Usage:
 *   node guardian/main.js [options]
 * 
 * Options:
 *   --app-path <path>    Path to the VibeFlow app (default: auto-detect)
 *   --check-interval <ms> Check interval in milliseconds (default: 5000)
 *   --restart-delay <ms>  Restart delay in milliseconds (default: 5000)
 *   --port <port>         IPC port (default: 9999)
 *   --verbose             Enable verbose logging
 *   --disable             Start in disabled mode
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import * as path from 'path';
import * as os from 'os';
import {
  ProcessGuardian,
  initializeProcessGuardian,
  DEFAULT_CHECK_INTERVAL_MS,
  DEFAULT_RESTART_DELAY_MS,
  DEFAULT_HEALTH_CHECK_PORT,
  type GuardianConfig,
} from './index';

// ============================================================================
// Argument Parsing
// ============================================================================

interface ParsedArgs {
  appPath: string;
  checkInterval: number;
  restartDelay: number;
  port: number;
  verbose: boolean;
  disabled: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {
    appPath: '',
    checkInterval: DEFAULT_CHECK_INTERVAL_MS,
    restartDelay: DEFAULT_RESTART_DELAY_MS,
    port: DEFAULT_HEALTH_CHECK_PORT,
    verbose: false,
    disabled: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--app-path':
        result.appPath = nextArg || '';
        i++;
        break;
      case '--check-interval':
        result.checkInterval = parseInt(nextArg, 10) || DEFAULT_CHECK_INTERVAL_MS;
        i++;
        break;
      case '--restart-delay':
        result.restartDelay = parseInt(nextArg, 10) || DEFAULT_RESTART_DELAY_MS;
        i++;
        break;
      case '--port':
        result.port = parseInt(nextArg, 10) || DEFAULT_HEALTH_CHECK_PORT;
        i++;
        break;
      case '--verbose':
        result.verbose = true;
        break;
      case '--disable':
      case '--disabled':
        result.disabled = true;
        break;
    }
  }

  return result;
}


// ============================================================================
// App Path Detection
// ============================================================================

/**
 * Auto-detect the VibeFlow app path
 */
function detectAppPath(): string {
  const possiblePaths = [
    // Installed app location
    '/Applications/VibeFlow.app',
    // User Applications folder
    path.join(os.homedir(), 'Applications', 'VibeFlow.app'),
    // Development build location
    path.join(__dirname, '..', 'release', 'mac-arm64', 'VibeFlow.app'),
    path.join(__dirname, '..', 'release', 'mac', 'VibeFlow.app'),
    // Relative to guardian
    path.join(__dirname, '..', '..', 'release', 'mac-arm64', 'VibeFlow.app'),
  ];

  const fs = require('fs');
  for (const appPath of possiblePaths) {
    if (fs.existsSync(appPath)) {
      return appPath;
    }
  }

  return '';
}

// ============================================================================
// Signal Handling
// ============================================================================

let guardian: ProcessGuardian | null = null;

function handleShutdown(signal: string): void {
  console.log(`\n[Guardian] Received ${signal}, shutting down...`);
  
  if (guardian) {
    guardian.stop();
  }
  
  process.exit(0);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log('[Guardian] VibeFlow Process Guardian starting...');
  console.log('[Guardian] PID:', process.pid);

  const args = parseArgs();

  // Auto-detect app path if not provided
  if (!args.appPath) {
    args.appPath = detectAppPath();
    if (args.appPath) {
      console.log('[Guardian] Auto-detected app path:', args.appPath);
    } else {
      console.warn('[Guardian] Could not auto-detect app path');
    }
  }

  // Build configuration
  const config: Partial<GuardianConfig> = {
    targetAppPath: args.appPath,
    checkIntervalMs: args.checkInterval,
    restartDelayMs: args.restartDelay,
    healthCheckPort: args.port,
    verbose: args.verbose,
    enabled: !args.disabled,
  };

  console.log('[Guardian] Configuration:', {
    targetAppPath: config.targetAppPath,
    checkIntervalMs: config.checkIntervalMs,
    restartDelayMs: config.restartDelayMs,
    healthCheckPort: config.healthCheckPort,
    enabled: config.enabled,
  });

  // Initialize guardian
  guardian = initializeProcessGuardian(config);

  // Setup signal handlers
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Guardian] Uncaught exception:', error);
    // Don't exit - guardian should be resilient
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Guardian] Unhandled rejection:', reason);
    // Don't exit - guardian should be resilient
  });

  // Start the guardian
  try {
    await guardian.start();
    console.log('[Guardian] Process Guardian started successfully');
    console.log('[Guardian] Monitoring VibeFlow desktop app...');
  } catch (error) {
    console.error('[Guardian] Failed to start:', error);
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error('[Guardian] Fatal error:', error);
  process.exit(1);
});
