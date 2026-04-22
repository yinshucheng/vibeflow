/**
 * Command Handler — Shared command routing for all clients.
 *
 * Each client's OCTOPUS_COMMAND listener calls `createCommandHandler` once,
 * then routes every incoming command through the returned handler function.
 * The switch/case lives here; clients never write their own.
 */
import type { OctopusCommand, SyncStatePayload, UpdatePolicyPayload, ExecuteActionPayload, ShowUIPayload, ActionResultPayload, DataChangePayload, ChatResponsePayload, ChatToolCallPayload, ChatSyncPayload } from '../types';
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
export declare function createCommandHandler(handlers: CommandHandlers): (command: OctopusCommand) => void;
//# sourceMappingURL=command-handler.d.ts.map