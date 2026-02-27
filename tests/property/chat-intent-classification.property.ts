/**
 * S6.5 Property Test: Intent Classification
 *
 * Invariant: classifyIntent() always returns a valid ChatIntent enum value
 * for any string input (never throws).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classifyIntent, type ChatIntent } from '@/services/chat-intent.service';

const VALID_INTENTS: ChatIntent[] = [
  'quick_action',
  'planning',
  'review',
  'task_mgmt',
  'project',
  'default',
];

describe('chat-intent-classification property', () => {
  it('always returns a valid ChatIntent for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = classifyIntent(input);
        expect(VALID_INTENTS).toContain(result);
      }),
      { numRuns: 500 }
    );
  });

  it('never throws for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => classifyIntent(input)).not.toThrow();
      }),
      { numRuns: 500 }
    );
  });

  it('never throws for random unicode strings', () => {
    fc.assert(
      fc.property(fc.unicodeString(), (input) => {
        const result = classifyIntent(input);
        expect(VALID_INTENTS).toContain(result);
      }),
      { numRuns: 200 }
    );
  });

  it('returns "default" for empty or whitespace strings', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r')),
        (input) => {
          expect(classifyIntent(input)).toBe('default');
        }
      ),
      { numRuns: 100 }
    );
  });
});
