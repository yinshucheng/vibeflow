#!/usr/bin/env node
/**
 * MCP Server Entry Point - Debug Version
 * 
 * Run this file to start the VibeFlow MCP server with detailed logging.
 * 
 * Usage:
 *   npx ts-node src/mcp/run-debug.ts
 */

import { startMCPServer } from './server';

console.error('[MCP] Starting vibeflow-mcp server...');
console.error('[MCP] Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  DEV_MODE: process.env.DEV_MODE,
  DATABASE_URL: process.env.DATABASE_URL ? '***' : 'NOT SET',
  MCP_USER_EMAIL: process.env.MCP_USER_EMAIL,
});

// Start the server
startMCPServer()
  .then(() => {
    console.error('[MCP] Server started successfully');
    // Keep the process alive
    process.on('SIGINT', () => {
      console.error('[MCP] Received SIGINT, shutting down...');
      process.exit(0);
    });
  })
  .catch((error) => {
    console.error('[MCP] Failed to start server:', error);
    if (error instanceof Error) {
      console.error('[MCP] Error stack:', error.stack);
    }
    process.exit(1);
  });

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[MCP] Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[MCP] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});