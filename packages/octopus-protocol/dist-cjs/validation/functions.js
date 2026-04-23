"use strict";
/**
 * Octopus Architecture - Validation Functions
 *
 * Runtime validation utilities for events, commands, and policies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEvent = validateEvent;
exports.validateCommand = validateCommand;
exports.validatePolicy = validatePolicy;
const schemas_1 = require("./schemas");
/**
 * Validate an event against the schema
 */
function validateEvent(event) {
    const result = schemas_1.OctopusEventSchema.safeParse(event);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return {
        success: false,
        error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid event format',
            details: { issues: result.error.issues },
        },
    };
}
/**
 * Validate a command against the schema
 */
function validateCommand(command) {
    const result = schemas_1.OctopusCommandSchema.safeParse(command);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return {
        success: false,
        error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid command format',
            details: { issues: result.error.issues },
        },
    };
}
/**
 * Validate a policy against the schema
 */
function validatePolicy(policy) {
    const result = schemas_1.PolicySchema.safeParse(policy);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return {
        success: false,
        error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid policy format',
            details: { issues: result.error.issues },
        },
    };
}
//# sourceMappingURL=functions.js.map