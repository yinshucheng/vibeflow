/**
 * MCP Module Exports
 * 
 * Central export point for MCP server functionality.
 */

export { createMCPServer, startMCPServer, SERVER_NAME, SERVER_VERSION } from './server';
export { authenticateToken, generateApiToken } from './auth';
export type { MCPContext, AuthResult } from './auth';
export { registerResources, handleResourceRead, RESOURCE_URIS } from './resources';
export type {
  CurrentContextResource,
  UserGoalsResource,
  UserPrinciplesResource,
  ActiveProjectsResource,
  TodayTasksResource,
} from './resources';
export { registerTools, handleToolCall, TOOLS } from './tools';
