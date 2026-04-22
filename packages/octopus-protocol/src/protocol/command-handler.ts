/**
 * Command Handler — Shared command routing for all clients.
 *
 * Each client's OCTOPUS_COMMAND listener calls `createCommandHandler` once,
 * then routes every incoming command through the returned handler function.
 * The switch/case lives here; clients never write their own.
 */

import type {
  OctopusCommand,
  SyncStatePayload,
  UpdatePolicyPayload,
  ExecuteActionPayload,
  ShowUIPayload,
  ActionResultPayload,
  DataChangePayload,
  ChatResponsePayload,
  ChatToolCallPayload,
  ChatSyncPayload,
} from '../types';

export interface CommandHandlers {
  onStateSync: (payload: SyncStatePayload) => void;
  onPolicyUpdate: (payload: UpdatePolicyPayload) => void;
  onExecuteAction: (payload: ExecuteActionPayload) => void;
  onShowUI: (payload: ShowUIPayload) => void;
  onActionResult: (payload: ActionResultPayload) => void;
  onDataChange?: (payload: DataChangePayload) => void;
  onChatResponse?: (payload: ChatResponsePayload) => void;
  onChatToolCall?: (payload: ChatToolCallPayload) => void;
  onChatSync?: (payload: ChatSyncPayload) => void;
}

/**
 * Create a command handler. All clients share this single switch/case.
 *
 * Unknown commandTypes are logged and ignored (forward compatibility).
 */
export function createCommandHandler(handlers: CommandHandlers) {
  return function handleCommand(command: OctopusCommand): void {
    switch (command.commandType) {
      case 'SYNC_STATE':
        handlers.onStateSync(command.payload);
        break;
      case 'UPDATE_POLICY':
        handlers.onPolicyUpdate(command.payload);
        break;
      case 'EXECUTE_ACTION':
        handlers.onExecuteAction(command.payload);
        break;
      case 'SHOW_UI':
        handlers.onShowUI(command.payload);
        break;
      case 'ACTION_RESULT':
        handlers.onActionResult(command.payload);
        break;
      case 'DATA_CHANGE':
        handlers.onDataChange?.(command.payload);
        break;
      case 'CHAT_RESPONSE':
        handlers.onChatResponse?.(command.payload);
        break;
      case 'CHAT_TOOL_CALL':
        handlers.onChatToolCall?.(command.payload);
        break;
      case 'CHAT_SYNC':
        handlers.onChatSync?.(command.payload);
        break;
      default:
        // Forward compatibility: unknown commandType from a newer server
        console.warn(`[Octopus] Unknown commandType: ${(command as unknown as { commandType: string }).commandType}, ignoring`);
    }
  };
}
