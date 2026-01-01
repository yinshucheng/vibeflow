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

// Start the server
startMCPServer().catch((error) => {
  console.error('[MCP] Failed to start server:', error);
  process.exit(1);
});
