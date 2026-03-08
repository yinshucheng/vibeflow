#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * Run this file to start the VibeFlow MCP server.
 *
 * Usage:
 *   npx ts-node src/mcp/run.ts
 *   # or after building:
 *   node dist/mcp/run.js
 */

import { startMCPServer } from './server';
import { prisma } from '@/lib/prisma';

let isShuttingDown = false;

async function shutdown(reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`[MCP] Shutting down (${reason})...`);

  try {
    await prisma.$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown
  }

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

// Start the server
startMCPServer().catch((error) => {
  console.error('[MCP] Failed to start server:', error);
  process.exit(1);
});
