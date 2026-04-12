#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * Run this file to start the VibeFlow MCP server.
 * Connects to the remote VibeFlow server via tRPC HTTP client.
 *
 * Usage:
 *   npx tsx src/mcp/run.ts
 *   # or after building:
 *   node dist/mcp/run.js
 */

import { startMCPServer } from './server';
import { trpcClient, serverUrl } from './trpc-client';

let isShuttingDown = false;

async function shutdown(reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`[MCP] Shutting down (${reason})...`);

  process.exit(0);
}

// Detect parent process closing stdin pipe (Claude Code session ended)
process.stdin.on('end', () => shutdown('stdin closed'));
process.stdin.on('close', () => shutdown('stdin closed'));
// Keep stdin open so 'end'/'close' events can fire
process.stdin.resume();

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Optional health check on startup
async function healthCheck(): Promise<void> {
  try {
    const whoami = await trpcClient.mcpBridge.whoami.query();
    console.error(`[MCP] Connected to ${serverUrl} as ${whoami.email} (${whoami.userId})`);
  } catch (error) {
    console.error(`[MCP] Warning: health check failed (${error instanceof Error ? error.message : 'unknown error'}). Server may be unreachable.`);
  }
}

// Start the server
healthCheck()
  .then(() => startMCPServer())
  .catch((error) => {
    console.error('[MCP] Failed to start server:', error);
    process.exit(1);
  });
