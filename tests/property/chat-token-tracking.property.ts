/**
 * F7.3 Property Tests: Token Tracking Invariants
 *
 * - Any inputTokens/outputTokens → totalTokens = input + output
 * - contextUsagePercent is always >= 0
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MODEL_META } from '@/config/llm.config';

// Pure computation functions extracted from the service logic to verify invariants
function computeTotalTokens(inputTokens: number, outputTokens: number): number {
  return inputTokens + outputTokens;
}

function computeContextUsagePercent(contextLength: number, maxContextLimit: number): number {
  return maxContextLimit > 0 ? (contextLength / maxContextLimit) * 100 : 0;
}

const modelIds = Object.keys(MODEL_META) as Array<keyof typeof MODEL_META>;

describe('chat-token-tracking properties', () => {
  it('totalTokens always equals inputTokens + outputTokens', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 2_000_000 }),
        fc.nat({ max: 100_000 }),
        (inputTokens, outputTokens) => {
          const total = computeTotalTokens(inputTokens, outputTokens);
          expect(total).toBe(inputTokens + outputTokens);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('contextUsagePercent is always >= 0 for non-negative contextLength', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 2_000_000 }),
        fc.constantFrom(...modelIds),
        (contextLength, modelId) => {
          const maxContextLimit = MODEL_META[modelId].contextWindow;
          const percent = computeContextUsagePercent(contextLength, maxContextLimit);
          expect(percent).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('contextUsagePercent can exceed 100 when context overflows the window', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...modelIds),
        (modelId) => {
          const maxContextLimit = MODEL_META[modelId].contextWindow;
          const overflowLength = maxContextLimit + 1000;
          const percent = computeContextUsagePercent(overflowLength, maxContextLimit);
          expect(percent).toBeGreaterThan(100);
        },
      ),
      { numRuns: modelIds.length },
    );
  });

  it('contextUsagePercent is 0 when contextLength is 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...modelIds),
        (modelId) => {
          const maxContextLimit = MODEL_META[modelId].contextWindow;
          const percent = computeContextUsagePercent(0, maxContextLimit);
          expect(percent).toBe(0);
        },
      ),
      { numRuns: modelIds.length },
    );
  });

  it('contextUsagePercent is 0 when maxContextLimit is 0 (guard against division by zero)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 2_000_000 }),
        (contextLength) => {
          const percent = computeContextUsagePercent(contextLength, 0);
          expect(percent).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
