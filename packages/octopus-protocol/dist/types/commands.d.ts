/**
 * Octopus Architecture - Command Types
 *
 * Command Stream types (Vibe Brain -> Tentacle).
 */
import type { CommandType, CommandPriority, ClientType, ActionType, UIType } from './enums';
import type { SyncStateCommand } from './state';
import type { Policy } from './policy';
import type { ActionResultCommand } from './actions';
import type { ChatResponseCommand, ChatToolCallCommand, ChatToolResultCommand, ChatSyncCommand } from './chat';
/**
 * Base interface for all commands from Vibe Brain to Tentacles
 * Requirements: 2.2, 2.4, 8.6
 */
export interface BaseCommand {
    /** UUID */
    commandId: string;
    /** Command type discriminator */
    commandType: CommandType;
    /** Target client type or 'all' for broadcast */
    targetClient: ClientType | 'all';
    priority: CommandPriority;
    /** Whether client must acknowledge */
    requiresAck: boolean;
    /** Unix timestamp, command expires after this */
    expiryTime?: number;
    /** Unix timestamp */
    createdAt: number;
}
/**
 * Execute action payload
 * Requirements: 8.3
 */
export interface ExecuteActionPayload {
    action: ActionType;
    parameters: Record<string, unknown>;
    /** Milliseconds */
    timeout?: number;
    fallbackAction?: ActionType;
}
/**
 * Execute an action on client
 * Requirements: 8.3
 */
export interface ExecuteActionCommand extends BaseCommand {
    commandType: 'EXECUTE_ACTION';
    payload: ExecuteActionPayload;
}
/**
 * Update policy payload
 * Requirements: 8.4
 */
export interface UpdatePolicyPayload {
    policyType: 'full' | 'partial';
    policy: Policy;
    /** When policy takes effect */
    effectiveTime: number;
}
/**
 * Update policy on client
 * Requirements: 8.4
 */
export interface UpdatePolicyCommand extends BaseCommand {
    commandType: 'UPDATE_POLICY';
    payload: UpdatePolicyPayload;
}
/**
 * Show UI payload
 * Requirements: 8.5
 */
export interface ShowUIPayload {
    uiType: UIType;
    content: Record<string, unknown>;
    /** Duration in milliseconds */
    duration?: number;
    dismissible: boolean;
}
/**
 * Show UI on client
 * Requirements: 8.5
 */
export interface ShowUICommand extends BaseCommand {
    commandType: 'SHOW_UI';
    payload: ShowUIPayload;
}
/**
 * Union type for all command types
 */
export type OctopusCommand = SyncStateCommand | ExecuteActionCommand | UpdatePolicyCommand | ShowUICommand | ActionResultCommand | ChatResponseCommand | ChatToolCallCommand | ChatToolResultCommand | ChatSyncCommand;
//# sourceMappingURL=commands.d.ts.map