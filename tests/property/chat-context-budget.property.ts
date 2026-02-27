/**
 * S7.5 Property Test: Context Budget
 *
 * Invariants:
 * - compressToolResult always returns a string whose estimated tokens <= maxTokens + overhead
 * - getCompressionAction always returns a valid action type
 * - Summary threshold is respected: messages <= threshold → no LLM call needed
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { chatSummaryService, SUMMARY_CONFIG } from '@/services/chat-summary.service';

describe('chat-context-budget property', () => {
  it('compressToolResult output never exceeds maxTokens limit (in estimated chars)', () => {
    const maxTokens = SUMMARY_CONFIG.toolResultMaxTokens;
    const maxChars = maxTokens * SUMMARY_CONFIG.charsPerToken;
    const truncationOverhead = '\n... [truncated]'.length;

    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 20000 }), (input) => {
        const result = chatSummaryService.compressToolResult(input);
        expect(result.length).toBeLessThanOrEqual(maxChars + truncationOverhead);
      }),
      { numRuns: 500 }
    );
  });

  it('compressToolResult with custom maxTokens respects the limit', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 10000 }),
        fc.integer({ min: 10, max: 1000 }),
        (input, maxTokens) => {
          const maxChars = maxTokens * SUMMARY_CONFIG.charsPerToken;
          const truncationOverhead = '\n... [truncated]'.length;
          const result = chatSummaryService.compressToolResult(input, maxTokens);
          expect(result.length).toBeLessThanOrEqual(maxChars + truncationOverhead);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('getCompressionAction always returns a valid action type', () => {
    const validTypes = ['none', 'auto_compress', 'suggest_new_session'];

    fc.assert(
      fc.property(fc.double({ min: 0, max: 200, noNaN: true }), (percent) => {
        const action = chatSummaryService.getCompressionAction(percent);
        expect(validTypes).toContain(action.type);
        expect(action.contextUsagePercent).toBe(percent);
      }),
      { numRuns: 300 }
    );
  });

  it('getCompressionAction thresholds are consistent', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 200, noNaN: true }), (percent) => {
        const action = chatSummaryService.getCompressionAction(percent);

        if (percent > SUMMARY_CONFIG.suggestNewSessionThreshold) {
          expect(action.type).toBe('suggest_new_session');
        } else if (percent > SUMMARY_CONFIG.autoCompressThreshold) {
          expect(action.type).toBe('auto_compress');
        } else {
          expect(action.type).toBe('none');
        }
      }),
      { numRuns: 300 }
    );
  });

  it('short strings are never truncated by compressToolResult', () => {
    const maxChars = SUMMARY_CONFIG.toolResultMaxTokens * SUMMARY_CONFIG.charsPerToken;

    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: Math.min(maxChars, 2000) }),
        (input) => {
          if (input.length <= maxChars) {
            const result = chatSummaryService.compressToolResult(input);
            expect(result).toBe(input);
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
