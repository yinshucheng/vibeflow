import { describe, it, expect, vi } from 'vitest';
import { createCommandHandler } from '../src/protocol/command-handler';
import type { OctopusCommand, SyncStateCommand, UpdatePolicyCommand, ExecuteActionCommand, ShowUICommand, ActionResultCommand, ChatResponseCommand, ChatToolCallCommand, ChatSyncCommand } from '../src/types';

function makeBaseCommand(commandType: string) {
  return {
    commandId: 'test-cmd-1',
    commandType,
    targetClient: 'all' as const,
    priority: 'normal' as const,
    requiresAck: false,
    createdAt: Date.now(),
  };
}

describe('createCommandHandler', () => {
  it('routes SYNC_STATE to onStateSync', () => {
    const onStateSync = vi.fn();
    const handler = createCommandHandler({
      onStateSync,
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
    });

    const cmd: SyncStateCommand = {
      ...makeBaseCommand('SYNC_STATE'),
      commandType: 'SYNC_STATE',
      payload: { syncType: 'full', version: 1 },
    };

    handler(cmd);
    expect(onStateSync).toHaveBeenCalledWith(cmd.payload);
  });

  it('routes UPDATE_POLICY to onPolicyUpdate', () => {
    const onPolicyUpdate = vi.fn();
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate,
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
    });

    const cmd: UpdatePolicyCommand = {
      ...makeBaseCommand('UPDATE_POLICY'),
      commandType: 'UPDATE_POLICY',
      payload: {
        policyType: 'full',
        policy: {
          config: {
            version: 1, updatedAt: Date.now(), blacklist: [], whitelist: [],
            enforcementMode: 'strict', workTimeSlots: [],
            skipTokens: { maxPerDay: 3, delayMinutes: 5 }, distractionApps: [],
          },
          state: {
            skipTokensRemaining: 3, isSleepTimeActive: false, isSleepSnoozed: false,
            isOverRest: false, overRestMinutes: 0, overRestBringToFront: false,
            isRestEnforcementActive: false,
          },
        },
        effectiveTime: Date.now(),
      },
    };

    handler(cmd);
    expect(onPolicyUpdate).toHaveBeenCalledWith(cmd.payload);
  });

  it('routes EXECUTE_ACTION to onExecuteAction', () => {
    const onExecuteAction = vi.fn();
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction,
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
    });

    const cmd: ExecuteActionCommand = {
      ...makeBaseCommand('EXECUTE_ACTION'),
      commandType: 'EXECUTE_ACTION',
      payload: { action: 'CLOSE_APP', parameters: { bundleId: 'com.test' } },
    };

    handler(cmd);
    expect(onExecuteAction).toHaveBeenCalledWith(cmd.payload);
  });

  it('routes SHOW_UI to onShowUI', () => {
    const onShowUI = vi.fn();
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI,
      onActionResult: vi.fn(),
    });

    const cmd: ShowUICommand = {
      ...makeBaseCommand('SHOW_UI'),
      commandType: 'SHOW_UI',
      payload: { uiType: 'toast', content: { message: 'hello' }, dismissible: true },
    };

    handler(cmd);
    expect(onShowUI).toHaveBeenCalledWith(cmd.payload);
  });

  it('routes ACTION_RESULT to onActionResult', () => {
    const onActionResult = vi.fn();
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult,
    });

    const cmd: ActionResultCommand = {
      ...makeBaseCommand('ACTION_RESULT'),
      commandType: 'ACTION_RESULT',
      payload: { optimisticId: 'opt-1', success: true },
    };

    handler(cmd);
    expect(onActionResult).toHaveBeenCalledWith(cmd.payload);
  });

  it('routes CHAT_RESPONSE to optional onChatResponse', () => {
    const onChatResponse = vi.fn();
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
      onChatResponse,
    });

    const cmd: ChatResponseCommand = {
      ...makeBaseCommand('CHAT_RESPONSE'),
      commandType: 'CHAT_RESPONSE',
      payload: { conversationId: 'conv-1', messageId: 'msg-1', type: 'complete', content: 'hello' },
    };

    handler(cmd);
    expect(onChatResponse).toHaveBeenCalledWith(cmd.payload);
  });

  it('routes CHAT_TOOL_CALL to optional onChatToolCall', () => {
    const onChatToolCall = vi.fn();
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
      onChatToolCall,
    });

    const cmd: ChatToolCallCommand = {
      ...makeBaseCommand('CHAT_TOOL_CALL'),
      commandType: 'CHAT_TOOL_CALL',
      payload: {
        conversationId: 'conv-1', messageId: 'msg-1', toolCallId: 'tc-1',
        toolName: 'search', description: 'search tasks', parameters: {},
        requiresConfirmation: false,
      },
    };

    handler(cmd);
    expect(onChatToolCall).toHaveBeenCalledWith(cmd.payload);
  });

  it('routes CHAT_SYNC to optional onChatSync', () => {
    const onChatSync = vi.fn();
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
      onChatSync,
    });

    const cmd: ChatSyncCommand = {
      ...makeBaseCommand('CHAT_SYNC'),
      commandType: 'CHAT_SYNC',
      payload: { conversationId: 'conv-1', messages: [] },
    };

    handler(cmd);
    expect(onChatSync).toHaveBeenCalledWith(cmd.payload);
  });

  it('does not crash when optional handlers are missing', () => {
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
      // no onChatResponse, onChatToolCall, onChatSync
    });

    const cmd: ChatResponseCommand = {
      ...makeBaseCommand('CHAT_RESPONSE'),
      commandType: 'CHAT_RESPONSE',
      payload: { conversationId: 'conv-1', messageId: 'msg-1', type: 'complete', content: 'hello' },
    };

    // Should not throw
    expect(() => handler(cmd)).not.toThrow();
  });

  it('gracefully ignores unknown commandType', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
    });

    const cmd = { ...makeBaseCommand('FUTURE_COMMAND'), payload: {} } as unknown as OctopusCommand;
    expect(() => handler(cmd)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FUTURE_COMMAND'));
    warnSpy.mockRestore();
  });
});
