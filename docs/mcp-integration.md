# VibeFlow MCP Integration Guide

This guide explains how to integrate VibeFlow with external AI agents like Cursor and Claude Code using the Model Context Protocol (MCP).

## Overview

VibeFlow exposes an MCP server that allows external AI agents to:
- Read your current working context (active project, task, system state)
- Access your goals and coding principles
- Execute actions like completing tasks, adding subtasks, and starting Pomodoro sessions

## Prerequisites

1. VibeFlow server running with database configured
2. Node.js 18+ installed
3. MCP-compatible AI agent (Cursor, Claude Code, etc.)

## Setup

### 1. Build the MCP Server

```bash
# From the VibeFlow project root
npm run build:server
```

This compiles the TypeScript MCP server to JavaScript in the `dist/` directory.

### 2. Configure Your AI Agent

Copy `mcp-config.example.json` to your AI agent's configuration directory and update the paths:

**For Cursor:**
```bash
# macOS/Linux
cp mcp-config.example.json ~/.cursor/mcp.json

# Windows
copy mcp-config.example.json %USERPROFILE%\.cursor\mcp.json
```

**For Claude Code:**
```bash
# macOS/Linux
cp mcp-config.example.json ~/.claude/mcp.json

# Windows
copy mcp-config.example.json %USERPROFILE%\.claude\mcp.json
```

### 3. Update Configuration

Edit the configuration file with your actual paths and credentials:

```json
{
  "mcpServers": {
    "vibeflow": {
      "command": "node",
      "args": ["dist/mcp/run.js"],
      "cwd": "/absolute/path/to/vibeflow",
      "env": {
        "NODE_ENV": "development",
        "DEV_MODE": "true",
        "DEV_USER_EMAIL": "your-email@example.com",
        "DATABASE_URL": "postgresql://user:password@localhost:5432/vibeflow"
      }
    }
  }
}
```

## Available Resources

Resources are read-only data endpoints that provide context to AI agents.

### `vibe://context/current`
Returns the current working context including:
- Active project (id, title, deliverable)
- Current task (id, title, priority, parent path)
- System state (LOCKED, PLANNING, FOCUS, REST)
- Pomodoro remaining time (if in focus mode)

### `vibe://user/goals`
Returns user's goals organized by type:
- Long-term goals (1-5 years)
- Short-term goals (1 week - 6 months)

### `vibe://user/principles`
Returns user's coding standards and preferences configured in VibeFlow settings.

### `vibe://projects/active`
Returns list of active projects with:
- Project details (id, title, deliverable, status)
- Task count
- Linked goals

### `vibe://tasks/today`
Returns today's planned tasks:
- Top 3 priority tasks
- Other planned tasks

## Available Tools

Tools are executable actions that AI agents can invoke.

### `vibe.complete_task`
Mark a task as completed.

**Parameters:**
- `task_id` (string, required): UUID of the task
- `summary` (string, required): Brief summary of what was accomplished

**Example:**
```json
{
  "task_id": "123e4567-e89b-12d3-a456-426614174000",
  "summary": "Implemented user authentication with JWT tokens"
}
```

### `vibe.add_subtask`
Add a new subtask under an existing task.

**Parameters:**
- `parent_id` (string, required): UUID of the parent task
- `title` (string, required): Title of the new subtask
- `priority` (string, optional): P1, P2, or P3 (default: P2)

**Example:**
```json
{
  "parent_id": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Add unit tests for auth module",
  "priority": "P2"
}
```

### `vibe.report_blocker`
Report a blocker or error encountered while working on a task.

**Parameters:**
- `task_id` (string, required): UUID of the task with the blocker
- `error_log` (string, required): Error log or description of the blocker

**Example:**
```json
{
  "task_id": "123e4567-e89b-12d3-a456-426614174000",
  "error_log": "TypeError: Cannot read property 'id' of undefined at line 42"
}
```

### `vibe.start_pomodoro`
Start a new Pomodoro focus session for a task.

**Parameters:**
- `task_id` (string, required): UUID of the task to focus on
- `duration` (number, optional): Duration in minutes (default: user setting or 25)

**Example:**
```json
{
  "task_id": "123e4567-e89b-12d3-a456-426614174000",
  "duration": 30
}
```

### `vibe.get_task_context`
Get detailed context about a specific task.

**Parameters:**
- `task_id` (string, required): UUID of the task

**Returns:**
- Task details with subtasks and recent Pomodoros
- Project information with linked goals
- Related documents (future feature)

## Authentication

### Development Mode

In development mode, authentication is simplified:
- Set `DEV_MODE=true` in environment
- Set `DEV_USER_EMAIL` to your email
- No token required for requests

### Production Mode

For production, use API tokens:
- Token format: `vibeflow_<userId>_<secret>`
- Pass token in the `_token` field of tool arguments
- Or use `dev_<email>` format in development

## Troubleshooting

### Server Not Starting

1. Check that the database is running and accessible
2. Verify `DATABASE_URL` is correct
3. Run `npm run db:push` to ensure schema is up to date

### Connection Issues

1. Verify the `cwd` path in config is absolute and correct
2. Check that `dist/mcp/run.js` exists (run `npm run build:server`)
3. Look for errors in the AI agent's MCP logs

### Authentication Errors

1. In dev mode, ensure `DEV_MODE=true` is set
2. Verify `DEV_USER_EMAIL` matches an existing user or will be auto-created
3. Check database connectivity

## Running Manually

You can test the MCP server manually:

```bash
# Development mode
npm run dev:mcp

# Production mode (after building)
npm run start:mcp
```

The server communicates via stdio, so you'll see JSON-RPC messages in the terminal.

## Example Workflow

1. AI agent reads `vibe://context/current` to understand current work
2. Agent reads `vibe://tasks/today` to see planned tasks
3. User asks agent to work on a task
4. Agent calls `vibe.start_pomodoro` to begin focus session
5. Agent works on the task, potentially calling `vibe.add_subtask` for discovered work
6. When done, agent calls `vibe.complete_task` with a summary
7. If blocked, agent calls `vibe.report_blocker` with error details

## Support

For issues or feature requests, please open an issue in the VibeFlow repository.
