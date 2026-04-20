/**
 * Octopus Architecture - Unified Event and Command Protocol Types
 *
 * Re-exported from @vibeflow/octopus-protocol shared package.
 * This file exists for backward compatibility — all types are defined
 * in packages/octopus-protocol/ and re-exported here.
 */

// Types (no runtime cost)
export * from '@vibeflow/octopus-protocol';

// Zod schemas + validation functions (runtime)
export * from '@vibeflow/octopus-protocol/validation';
