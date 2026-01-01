/**
 * VibeFlow MCP Server
 * 
 * Model Context Protocol server that exposes VibeFlow resources and tools
 * to external AI agents like Cursor and Claude Code.
 * 
 * Requirements: 9.1, 9.2, 9.10
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { registerResources, handleResourceRead } from './resources';
import { registerTools, handleToolCall } from './tools';
import { authenticateToken, MCPContext } from './auth';

// Server configuration
const SERVER_NAME = 'vibeflow-mcp';
const SERVER_VERSION = '1.0.0';

/**
 * Create and configure the MCP server
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return registerResources();
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    
    // Extract token from request arguments if provided
    const token = (request.params as { token?: string }).token;
    
    // Authenticate and get context
    const authResult = await authenticateToken(token);
    if (!authResult.success || !authResult.context) {
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            error: {
              code: 'AUTH_ERROR',
              message: authResult.error || 'Authentication failed',
            },
          }),
        }],
      };
    }

    return handleResourceRead(uri, authResult.context);
  });

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return registerTools();
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Extract token from arguments
    const token = (args as { _token?: string })?._token;
    
    // Authenticate and get context
    const authResult = await authenticateToken(token);
    if (!authResult.success || !authResult.context) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              code: 'AUTH_ERROR',
              message: authResult.error || 'Authentication failed',
            },
          }),
        }],
        isError: true,
      };
    }

    // Remove token from args before passing to tool handler
    const toolArgs = { ...args };
    delete (toolArgs as { _token?: string })._token;

    const result = await handleToolCall(name, toolArgs, authResult.context);
    return {
      content: result.content,
      isError: result.isError,
    };
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  console.error(`[MCP] ${SERVER_NAME} v${SERVER_VERSION} started`);
}

// Export for direct execution
export { SERVER_NAME, SERVER_VERSION };
