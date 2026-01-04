/**
 * Process Guardian
 * 
 * A lightweight process that monitors and restarts the VibeFlow desktop app
 * if it terminates unexpectedly. Runs as a separate process to ensure
 * resilience against app crashes.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 * - THE Process_Guardian SHALL run as a separate lightweight process
 * - THE Process_Guardian SHALL monitor the Desktop_App process status
 * - WHEN Desktop_App process terminates unexpectedly, THE Process_Guardian SHALL restart it within 5 seconds
 * - THE Process_Guardian SHALL log all restart events with reason
 */

import { spawn, ChildProcess, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';

// ============================================================================
// Constants
// ============================================================================

/** Default check interval in milliseconds (5 seconds) */
export const DEFAULT_CHECK_INTERVAL_MS = 5000;

/** Default restart delay in milliseconds (5 seconds) - Requirements 8.3 */
export const DEFAULT_RESTART_DELAY_MS = 5000;

/** Maximum restart attempts before giving up */
export const DEFAULT_MAX_RESTART_ATTEMPTS = 5;

/** Health check port for IPC communication */
export const DEFAULT_HEALTH_CHECK_PORT = 9999;

/** Log file path */
export const LOG_FILE_PATH = path.join(os.homedir(), '.vibeflow', 'guardian.log');

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Guardian configuration
 */
export interface GuardianConfig {
  /** Path to the target application */
  targetAppPath: string;
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Restart delay in milliseconds */
  restartDelayMs: number;
  /** Maximum restart attempts */
  maxRestartAttempts: number;
  /** Health check port for IPC */
  healthCheckPort: number;
  /** Whether to enable verbose logging */
  verbose: boolean;
  /** Whether guardian is enabled */
  enabled: boolean;
}

/**
 * Guardian state
 */
export interface GuardianState {
  /** Whether guardian is running */
  isRunning: boolean;
  /** Target app process ID */
  targetPid: number | null;
  /** Last health check timestamp */
  lastHealthCheck: Date | null;
  /** Number of restarts performed */
  restartCount: number;
  /** Last restart reason */
  lastRestartReason: string | null;
  /** Last restart timestamp */
  lastRestartTime: Date | null;
  /** Whether target app is healthy */
  isTargetHealthy: boolean;
  /** Consecutive restart failures */
  consecutiveFailures: number;
}

/**
 * Restart event record
 */
export interface RestartEvent {
  timestamp: Date;
  reason: 'crash' | 'unresponsive' | 'manual' | 'health_check_failed';
  previousPid: number | null;
  newPid: number | null;
  success: boolean;
  error?: string;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  timestamp: Date;
  pid?: number;
  error?: string;
}

/**
 * IPC message types
 */
export type GuardianIPCMessage = 
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'status_request' }
  | { type: 'status_response'; state: GuardianState }
  | { type: 'health_check' }
  | { type: 'health_response'; healthy: boolean; timestamp: number }
  | { type: 'shutdown' };

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: GuardianConfig = {
  targetAppPath: '',
  checkIntervalMs: DEFAULT_CHECK_INTERVAL_MS,
  restartDelayMs: DEFAULT_RESTART_DELAY_MS,
  maxRestartAttempts: DEFAULT_MAX_RESTART_ATTEMPTS,
  healthCheckPort: DEFAULT_HEALTH_CHECK_PORT,
  verbose: false,
  enabled: true,
};

// ============================================================================
// Logging Utilities
// ============================================================================

/**
 * Ensure log directory exists
 */
function ensureLogDirectory(): void {
  const logDir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Write log entry
 */
function writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}\n`;
  
  // Console output
  if (level === 'ERROR') {
    console.error(logEntry.trim());
  } else {
    console.log(logEntry.trim());
  }
  
  // File output
  try {
    ensureLogDirectory();
    fs.appendFileSync(LOG_FILE_PATH, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

// ============================================================================
// Process Utilities
// ============================================================================

/**
 * Check if a process is running by PID
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find process by name (macOS)
 */
export function findProcessByName(name: string): Promise<number[]> {
  return new Promise((resolve) => {
    exec(`pgrep -f "${name}"`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve([]);
        return;
      }
      const pids = stdout.trim().split('\n').map(Number).filter(Boolean);
      resolve(pids);
    });
  });
}

/**
 * Get process info by PID (macOS)
 */
export function getProcessInfo(pid: number): Promise<{ name: string; command: string } | null> {
  return new Promise((resolve) => {
    exec(`ps -p ${pid} -o comm=,args=`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }
      const parts = stdout.trim().split(/\s+/);
      resolve({
        name: parts[0] || '',
        command: parts.slice(1).join(' '),
      });
    });
  });
}

// ============================================================================
// Process Guardian Class
// ============================================================================

/**
 * ProcessGuardian - Monitors and restarts the VibeFlow desktop app
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export class ProcessGuardian {
  private config: GuardianConfig;
  private state: GuardianState;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private targetProcess: ChildProcess | null = null;
  private restartEvents: RestartEvent[] = [];
  private ipcServer: net.Server | null = null;
  private ipcClients: Set<net.Socket> = new Set();

  constructor(config: Partial<GuardianConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isRunning: false,
      targetPid: null,
      lastHealthCheck: null,
      restartCount: 0,
      lastRestartReason: null,
      lastRestartTime: null,
      isTargetHealthy: false,
      consecutiveFailures: 0,
    };
  }

  /**
   * Start the guardian
   * Requirements: 8.1, 8.2
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      writeLog('WARN', 'Guardian is already running');
      return;
    }

    if (!this.config.enabled) {
      writeLog('INFO', 'Guardian is disabled');
      return;
    }

    writeLog('INFO', 'Starting Process Guardian', {
      targetAppPath: this.config.targetAppPath,
      checkIntervalMs: this.config.checkIntervalMs,
    });

    this.state.isRunning = true;

    // Start IPC server for communication with desktop app
    await this.startIPCServer();

    // Start monitoring
    this.startMonitoring();

    // Check if target app is already running
    await this.checkAndStartTarget();
  }

  /**
   * Stop the guardian
   */
  stop(): void {
    if (!this.state.isRunning) {
      return;
    }

    writeLog('INFO', 'Stopping Process Guardian');

    this.state.isRunning = false;
    this.stopMonitoring();
    this.stopIPCServer();
  }

  /**
   * Get current state
   */
  getState(): GuardianState {
    return { ...this.state };
  }

  /**
   * Get restart event history
   */
  getRestartEvents(): RestartEvent[] {
    return [...this.restartEvents];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GuardianConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart monitoring if interval changed
    if (config.checkIntervalMs && this.state.isRunning) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Get configuration
   */
  getConfig(): GuardianConfig {
    return { ...this.config };
  }

  /**
   * Start the IPC server for communication with desktop app
   * Requirements: 8.7, 8.8
   */
  private async startIPCServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ipcServer = net.createServer((socket) => {
        this.ipcClients.add(socket);
        
        socket.on('data', (data) => {
          try {
            const message: GuardianIPCMessage = JSON.parse(data.toString());
            this.handleIPCMessage(socket, message);
          } catch (error) {
            writeLog('ERROR', 'Failed to parse IPC message', { error });
          }
        });

        socket.on('close', () => {
          this.ipcClients.delete(socket);
        });

        socket.on('error', (error) => {
          writeLog('ERROR', 'IPC socket error', { error: error.message });
          this.ipcClients.delete(socket);
        });
      });

      this.ipcServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          writeLog('WARN', 'IPC port already in use, trying next port');
          this.config.healthCheckPort++;
          this.startIPCServer().then(resolve).catch(reject);
        } else {
          writeLog('ERROR', 'IPC server error', { error: error.message });
          reject(error);
        }
      });

      this.ipcServer.listen(this.config.healthCheckPort, '127.0.0.1', () => {
        writeLog('INFO', 'IPC server started', { port: this.config.healthCheckPort });
        resolve();
      });
    });
  }

  /**
   * Stop the IPC server
   */
  private stopIPCServer(): void {
    if (this.ipcServer) {
      // Close all client connections
      this.ipcClients.forEach((socket) => {
        socket.destroy();
      });
      this.ipcClients.clear();

      this.ipcServer.close();
      this.ipcServer = null;
    }
  }

  /**
   * Handle IPC message from desktop app
   * Requirements: 8.7, 8.8
   */
  private handleIPCMessage(socket: net.Socket, message: GuardianIPCMessage): void {
    switch (message.type) {
      case 'heartbeat':
        this.state.lastHealthCheck = new Date(message.timestamp);
        this.state.isTargetHealthy = true;
        break;

      case 'status_request':
        const response: GuardianIPCMessage = {
          type: 'status_response',
          state: this.getState(),
        };
        socket.write(JSON.stringify(response));
        break;

      case 'health_check':
        const healthResponse: GuardianIPCMessage = {
          type: 'health_response',
          healthy: this.state.isRunning,
          timestamp: Date.now(),
        };
        socket.write(JSON.stringify(healthResponse));
        break;

      case 'shutdown':
        writeLog('INFO', 'Received shutdown request from desktop app');
        this.stop();
        break;
    }
  }

  /**
   * Start monitoring the target process
   * Requirements: 8.2
   */
  private startMonitoring(): void {
    this.stopMonitoring();

    this.checkTimer = setInterval(() => {
      this.checkTargetHealth();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check if target app is running and start if needed
   */
  private async checkAndStartTarget(): Promise<void> {
    // Check if target is already running
    const existingPids = await findProcessByName('VibeFlow');
    
    if (existingPids.length > 0) {
      // Filter out our own process
      const targetPid = existingPids.find(pid => pid !== process.pid);
      if (targetPid) {
        this.state.targetPid = targetPid;
        this.state.isTargetHealthy = true;
        writeLog('INFO', 'Found existing target process', { pid: targetPid });
        return;
      }
    }

    // Start target app if not running
    if (this.config.targetAppPath) {
      await this.startTargetApp('initial_start');
    }
  }

  /**
   * Check target process health
   * Requirements: 8.2
   */
  private async checkTargetHealth(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    // Check if process is still running
    if (this.state.targetPid && !isProcessRunning(this.state.targetPid)) {
      writeLog('WARN', 'Target process not running', { pid: this.state.targetPid });
      this.state.isTargetHealthy = false;
      await this.handleTargetCrash();
      return;
    }

    // Check health via IPC heartbeat timeout
    if (this.state.lastHealthCheck) {
      const timeSinceLastCheck = Date.now() - this.state.lastHealthCheck.getTime();
      const healthTimeout = this.config.checkIntervalMs * 3; // 3 missed checks = unhealthy

      if (timeSinceLastCheck > healthTimeout) {
        writeLog('WARN', 'Target process unresponsive', {
          lastHealthCheck: this.state.lastHealthCheck,
          timeSinceLastCheck,
        });
        this.state.isTargetHealthy = false;
        await this.handleTargetUnresponsive();
      }
    }
  }

  /**
   * Handle target app crash
   * Requirements: 8.3
   */
  private async handleTargetCrash(): Promise<void> {
    writeLog('WARN', 'Target app crashed, scheduling restart');
    await this.restartTargetApp('crash');
  }

  /**
   * Handle target app becoming unresponsive
   */
  private async handleTargetUnresponsive(): Promise<void> {
    writeLog('WARN', 'Target app unresponsive, scheduling restart');
    
    // Try to kill the unresponsive process first
    if (this.state.targetPid) {
      try {
        process.kill(this.state.targetPid, 'SIGTERM');
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Force kill if still running
        if (isProcessRunning(this.state.targetPid)) {
          process.kill(this.state.targetPid, 'SIGKILL');
        }
      } catch {
        // Process may already be dead
      }
    }

    await this.restartTargetApp('unresponsive');
  }

  /**
   * Restart the target application
   * Requirements: 8.3 - restart within 5 seconds
   */
  private async restartTargetApp(reason: RestartEvent['reason']): Promise<void> {
    // Check if we've exceeded max restart attempts
    if (this.state.consecutiveFailures >= this.config.maxRestartAttempts) {
      writeLog('ERROR', 'Max restart attempts exceeded, giving up', {
        consecutiveFailures: this.state.consecutiveFailures,
        maxAttempts: this.config.maxRestartAttempts,
      });
      return;
    }

    const previousPid = this.state.targetPid;

    // Wait for restart delay (within 5 seconds requirement)
    await new Promise(resolve => setTimeout(resolve, this.config.restartDelayMs));

    // Start the target app
    const success = await this.startTargetApp(reason);

    // Record restart event
    const event: RestartEvent = {
      timestamp: new Date(),
      reason,
      previousPid,
      newPid: this.state.targetPid,
      success,
    };

    this.restartEvents.push(event);
    this.state.restartCount++;
    this.state.lastRestartReason = reason;
    this.state.lastRestartTime = new Date();

    if (success) {
      this.state.consecutiveFailures = 0;
      writeLog('INFO', 'Target app restarted successfully', {
        reason,
        newPid: this.state.targetPid,
      });
    } else {
      this.state.consecutiveFailures++;
      writeLog('ERROR', 'Failed to restart target app', {
        reason,
        consecutiveFailures: this.state.consecutiveFailures,
      });
    }
  }

  /**
   * Start the target application
   */
  private async startTargetApp(reason: string): Promise<boolean> {
    if (!this.config.targetAppPath) {
      writeLog('ERROR', 'No target app path configured');
      return false;
    }

    try {
      writeLog('INFO', 'Starting target app', {
        path: this.config.targetAppPath,
        reason,
      });

      // Determine how to start the app based on path
      let command: string;
      let args: string[];

      if (this.config.targetAppPath.endsWith('.app')) {
        // macOS .app bundle
        command = 'open';
        args = ['-a', this.config.targetAppPath];
      } else {
        // Direct executable
        command = this.config.targetAppPath;
        args = [];
      }

      this.targetProcess = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
      });

      // Unref to allow guardian to exit independently
      this.targetProcess.unref();

      // Wait a bit for the process to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find the new PID
      const pids = await findProcessByName('VibeFlow');
      const newPid = pids.find(pid => pid !== process.pid && pid !== this.state.targetPid);

      if (newPid) {
        this.state.targetPid = newPid;
        this.state.isTargetHealthy = true;
        return true;
      }

      // If we can't find the PID, check if the spawn was successful
      if (this.targetProcess.pid) {
        this.state.targetPid = this.targetProcess.pid;
        this.state.isTargetHealthy = true;
        return true;
      }

      return false;
    } catch (error) {
      writeLog('ERROR', 'Failed to start target app', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Perform health check on target app
   * Requirements: 8.8
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      healthy: false,
      timestamp: new Date(),
    };

    if (!this.state.targetPid) {
      result.error = 'No target PID';
      return result;
    }

    // Check if process is running
    if (!isProcessRunning(this.state.targetPid)) {
      result.error = 'Process not running';
      return result;
    }

    result.pid = this.state.targetPid;
    result.healthy = this.state.isTargetHealthy;

    return result;
  }

  /**
   * Send message to all connected IPC clients
   */
  broadcastToClients(message: GuardianIPCMessage): void {
    const data = JSON.stringify(message);
    this.ipcClients.forEach((socket) => {
      try {
        socket.write(data);
      } catch (error) {
        writeLog('ERROR', 'Failed to send message to client', { error });
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.restartEvents = [];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let guardianInstance: ProcessGuardian | null = null;

/**
 * Get the guardian singleton
 */
export function getProcessGuardian(config?: Partial<GuardianConfig>): ProcessGuardian {
  if (!guardianInstance) {
    guardianInstance = new ProcessGuardian(config);
  } else if (config) {
    guardianInstance.updateConfig(config);
  }
  return guardianInstance;
}

/**
 * Initialize guardian with config
 */
export function initializeProcessGuardian(config: Partial<GuardianConfig>): ProcessGuardian {
  if (guardianInstance) {
    guardianInstance.destroy();
  }
  guardianInstance = new ProcessGuardian(config);
  return guardianInstance;
}

/**
 * Reset guardian (for testing)
 */
export function resetProcessGuardian(): void {
  if (guardianInstance) {
    guardianInstance.destroy();
    guardianInstance = null;
  }
}

// ============================================================================
// Export Service
// ============================================================================

export const processGuardianService = {
  getProcessGuardian,
  initializeProcessGuardian,
  resetProcessGuardian,
  isProcessRunning,
  findProcessByName,
  getProcessInfo,
  DEFAULT_CHECK_INTERVAL_MS,
  DEFAULT_RESTART_DELAY_MS,
  DEFAULT_MAX_RESTART_ATTEMPTS,
  DEFAULT_HEALTH_CHECK_PORT,
  LOG_FILE_PATH,
};

export default processGuardianService;
