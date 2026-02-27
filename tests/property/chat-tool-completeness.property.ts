/**
 * S1.6 Property test for Chat Tool completeness.
 *
 * Verifies:
 * - All MCP tools (28 tools from TOOLS constant) have corresponding Chat Tool registrations
 * - Chat Tool registry covers all MCP tools completely
 * - No tool name drift between MCP and Chat Tool registries
 */
import { describe, it, expect, vi } from 'vitest';

// Mock all service dependencies before import
vi.mock('../../src/services/task.service', () => ({
  taskService: { updateStatus: vi.fn(), create: vi.fn(), quickCreateInboxTask: vi.fn() },
}));
vi.mock('../../src/services/pomodoro.service', () => ({
  pomodoroService: { start: vi.fn(), startTaskless: vi.fn(), completeTaskInPomodoro: vi.fn(), record: vi.fn() },
}));
vi.mock('../../src/services/nl-parser.service', () => ({
  nlParserService: { parseTaskDescription: vi.fn(), confirmAndCreate: vi.fn() },
}));
vi.mock('../../src/services/project.service', () => ({
  projectService: { create: vi.fn(), update: vi.fn(), getById: vi.fn() },
}));
vi.mock('../../src/services/time-slice.service', () => ({
  timeSliceService: { switchTask: vi.fn() },
}));
vi.mock('../../src/services/activity-log.service', () => ({
  activityLogService: { create: vi.fn() },
}));
vi.mock('../../src/services/efficiency-analysis.service', () => ({
  efficiencyAnalysisService: { getHistoricalAnalysis: vi.fn() },
}));
vi.mock('../../src/lib/prisma', () => ({
  default: {
    task: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    project: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    pomodoro: { findFirst: vi.fn(), findMany: vi.fn() },
    dailyState: { findUnique: vi.fn(), upsert: vi.fn() },
    goal: { findFirst: vi.fn() },
    projectTemplate: { findFirst: vi.fn() },
    userSettings: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { TOOLS } from '../../src/mcp/tools';
import { getChatToolDefinitions, CHAT_TOOL_SCHEMAS } from '../../src/services/chat-tools.service';

// ---------------------------------------------------------------------------
// Extract all MCP tool names from the TOOLS constant
// ---------------------------------------------------------------------------

const MCP_TOOL_NAMES: Set<string> = new Set(Object.values(TOOLS));
const CHAT_TOOL_NAMES = new Set(getChatToolDefinitions().map(d => d.name));
const CHAT_SCHEMA_NAMES = new Set(Object.keys(CHAT_TOOL_SCHEMAS));

describe('Chat Tool ↔ MCP Tool completeness', () => {
  it('every MCP tool should have a corresponding Chat Tool definition', () => {
    const missingInChat: string[] = [];
    for (const mcpToolName of Array.from(MCP_TOOL_NAMES)) {
      if (!CHAT_TOOL_NAMES.has(mcpToolName)) {
        missingInChat.push(mcpToolName);
      }
    }
    expect(missingInChat, `MCP tools missing from Chat Tool registry: ${missingInChat.join(', ')}`).toEqual([]);
  });

  it('every Chat Tool definition should correspond to an MCP tool', () => {
    const extraInChat: string[] = [];
    for (const chatToolName of Array.from(CHAT_TOOL_NAMES)) {
      if (!MCP_TOOL_NAMES.has(chatToolName)) {
        extraInChat.push(chatToolName);
      }
    }
    expect(extraInChat, `Chat Tools not in MCP registry: ${extraInChat.join(', ')}`).toEqual([]);
  });

  it('MCP tools set and Chat Tools set should be identical', () => {
    const mcpNames = Array.from(MCP_TOOL_NAMES).sort();
    const chatNames = Array.from(CHAT_TOOL_NAMES).sort();
    expect(chatNames).toEqual(mcpNames);
  });

  it('every Chat Tool should have an exported Zod schema', () => {
    const missingSchemas: string[] = [];
    for (const chatToolName of Array.from(CHAT_TOOL_NAMES)) {
      if (!CHAT_SCHEMA_NAMES.has(chatToolName)) {
        missingSchemas.push(chatToolName);
      }
    }
    expect(missingSchemas, `Chat Tools missing Zod schemas: ${missingSchemas.join(', ')}`).toEqual([]);
  });

  it(`total tool count should be ${MCP_TOOL_NAMES.size}`, () => {
    expect(CHAT_TOOL_NAMES.size).toBe(MCP_TOOL_NAMES.size);
    expect(getChatToolDefinitions().length).toBe(MCP_TOOL_NAMES.size);
  });

  it('no duplicate tool names in Chat Tool definitions', () => {
    const defs = getChatToolDefinitions();
    const names = defs.map(d => d.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every Chat Tool definition should have a non-empty description', () => {
    for (const def of getChatToolDefinitions()) {
      expect(def.description.length, `Tool ${def.name} has empty description`).toBeGreaterThan(0);
    }
  });

  it('every Chat Tool definition should have an executable function', () => {
    for (const def of getChatToolDefinitions()) {
      expect(typeof def.execute, `Tool ${def.name} has no execute function`).toBe('function');
    }
  });
});
