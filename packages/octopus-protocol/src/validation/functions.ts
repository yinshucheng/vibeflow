/**
 * Octopus Architecture - Validation Functions
 *
 * Runtime validation utilities for events, commands, and policies.
 */

import type { OctopusEvent } from '../types/events';
import type { OctopusCommand } from '../types/commands';
import type { Policy } from '../types/policy';
import type { ErrorCode } from '../types/enums';
import { OctopusEventSchema, OctopusCommandSchema, PolicySchema } from './schemas';

/**
 * Validate an event against the schema
 */
export function validateEvent(event: unknown): { success: true; data: OctopusEvent } | { success: false; error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } {
  const result = OctopusEventSchema.safeParse(event);
  if (result.success) {
    return { success: true, data: result.data as OctopusEvent };
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
export function validateCommand(command: unknown): { success: true; data: OctopusCommand } | { success: false; error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } {
  const result = OctopusCommandSchema.safeParse(command);
  if (result.success) {
    return { success: true, data: result.data as OctopusCommand };
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
export function validatePolicy(policy: unknown): { success: true; data: Policy } | { success: false; error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } {
  const result = PolicySchema.safeParse(policy);
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
