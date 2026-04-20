/**
 * Octopus Architecture - Error Types
 *
 * Error response types for protocol errors.
 */
import type { ErrorCode } from './enums';
/**
 * Error response structure
 */
export interface ErrorResponse {
    success: false;
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
        retryable: boolean;
        /** Seconds */
        retryAfter?: number;
    };
}
//# sourceMappingURL=errors.d.ts.map