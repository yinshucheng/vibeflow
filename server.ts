/**
 * Custom Server with Socket.io
 *
 * This file creates a custom HTTP server that integrates Next.js with Socket.io.
 *
 * Run with:
 *   Development (with hot reload): npm run dev
 *   Production: node dist/server.js
 *
 * Requirements: 6.7
 * Test: Hot reload cleanup verification
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeSocketServer, shutdownSocketServer } from './src/server/socket-init';
import { pomodoroSchedulerService } from './src/services/pomodoro-scheduler.service';

// ============================================
// Configuration
// ============================================
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// ============================================
// Logging Utilities
// ============================================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, ...args: unknown[]): void {
  const levelColors: Record<string, string> = {
    INFO: colors.green,
    WARN: colors.yellow,
    ERROR: colors.red,
    DEBUG: colors.cyan,
  };
  const color = levelColors[level] || colors.white;
  console.log(
    `${colors.dim}[${timestamp()}]${colors.reset} ${color}${level.padEnd(5)}${colors.reset} ${message}`,
    ...args
  );
}

function logRequest(req: IncomingMessage, res: ServerResponse, duration: number): void {
  const method = req.method || 'GET';
  const url = req.url || '/';
  const status = res.statusCode;
  
  // Color based on status code
  let statusColor = colors.green;
  if (status >= 400) statusColor = colors.yellow;
  if (status >= 500) statusColor = colors.red;
  
  // Method color
  const methodColors: Record<string, string> = {
    GET: colors.cyan,
    POST: colors.green,
    PUT: colors.yellow,
    DELETE: colors.red,
    PATCH: colors.magenta,
  };
  const methodColor = methodColors[method] || colors.white;
  
  console.log(
    `${colors.dim}[${timestamp()}]${colors.reset} ` +
    `${methodColor}${method.padEnd(6)}${colors.reset} ` +
    `${url.substring(0, 80).padEnd(80)} ` +
    `${statusColor}${status}${colors.reset} ` +
    `${colors.dim}${duration}ms${colors.reset}`
  );
}

// ============================================
// Server Initialization
// ============================================
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

console.log('\n');
log('INFO', '🚀 Starting VibeFlow Server...');
log('INFO', `   Environment: ${dev ? 'development' : 'production'}`);
log('INFO', `   Node.js: ${process.version}`);

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const startTime = Date.now();
    const parsedUrl = parse(req.url!, true);
    
    // Log request when response finishes
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      // Skip noisy requests in dev mode
      const url = req.url || '';
      if (!url.includes('_next/static') && !url.includes('favicon.ico')) {
        logRequest(req, res, duration);
      }
    });
    
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.io server
  initializeSocketServer(httpServer);

  // Start pomodoro scheduler for auto-completion
  pomodoroSchedulerService.start();

  httpServer.listen(port, () => {
    console.log('\n');
    log('INFO', '═══════════════════════════════════════════════════════════');
    log('INFO', `${colors.bright}✅ VibeFlow Server Ready${colors.reset}`);
    log('INFO', '═══════════════════════════════════════════════════════════');
    log('INFO', `   🌐 URL:        http://${hostname}:${port}`);
    log('INFO', `   🔌 Socket.io:  Enabled`);
    log('INFO', `   🔄 Hot Reload: ${dev ? 'Enabled (tsx watch)' : 'Disabled'}`);
    log('INFO', `   🗄️  Database:   PostgreSQL`);
    log('INFO', `   🔐 Auth Mode:  ${process.env.DEV_MODE === 'true' ? 'Development (auto-create users)' : 'Production'}`);
    log('INFO', '═══════════════════════════════════════════════════════════');
    console.log('\n');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('WARN', '📴 SIGTERM received, shutting down gracefully...');
    pomodoroSchedulerService.stop();
    httpServer.close(() => {
      log('INFO', '👋 Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    log('WARN', '📴 SIGINT received, shutting down gracefully...');
    pomodoroSchedulerService.stop();
    httpServer.close(() => {
      log('INFO', '👋 Server closed');
      process.exit(0);
    });
  });

  // Hot reload cleanup (tsx watch sends SIGUSR2)
  if (dev) {
    process.on('SIGUSR2', () => {
      log('WARN', '🔄 Hot reload detected, cleaning up...');
      shutdownSocketServer();
      process.kill(process.pid, 'SIGUSR2');
    });
  }
}).catch((err) => {
  log('ERROR', '❌ Failed to start server:', err);
  process.exit(1);
});
