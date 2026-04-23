/**
 * Octopus Architecture - Validation Functions
 *
 * Runtime validation utilities for events, commands, and policies.
 */
import type { OctopusEvent } from '../types/events';
import type { OctopusCommand } from '../types/commands';
import type { Policy } from '../types/policy';
import type { ErrorCode } from '../types/enums';
/**
 * Validate an event against the schema
 */
export declare function validateEvent(event: unknown): {
    success: true;
    data: OctopusEvent;
} | {
    success: false;
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
};
/**
 * Validate a command against the schema
 */
export declare function validateCommand(command: unknown): {
    success: true;
    data: OctopusCommand;
} | {
    success: false;
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
};
/**
 * Validate a policy against the schema
 */
export declare function validatePolicy(policy: unknown): {
    success: true;
    data: Policy;
} | {
    success: false;
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
};
//# sourceMappingURL=functions.d.ts.map