import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  validateEvent,
  type ClientType,
  type EntertainmentStopReason,
  EntertainmentModeEventSchema,
  WorkStartEventSchema,
  EntertainmentModePayloadSchema,
  WorkStartPayloadSchema,
} from '@/types/octopus';

/**
 * Feature: browser-sentinel-enhancement
 * Property 14: Octopus Protocol Consistency
 * Validates: Requirements 10.3, 10.11, 13.7, 13.8
 *
 * For any activity event sent from Browser Sentinel, the event format SHALL match
 * the Octopus protocol specification used by Desktop Client. This includes:
 * - ENTERTAINMENT_MODE events with proper payload structure
 * - WORK_START events with proper payload structure
 * - All events must have valid base fields (eventId, eventType, userId, clientId, etc.)
 */

// =============================================================================
// GENERATORS
// =============================================================================

// Base event field generators
const clientTypeArb = fc.constantFrom<ClientType>('web', 'desktop', 'browser_ext', 'mobile');

const entertainmentStopReasonArb = fc.constantFrom<EntertainmentStopReason>(
  'manual',
  'quota_exhausted',
  'work_time_start'
);

// Date string generator (YYYY-MM-DD format)
const dateStringArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
  (d) => d.toISOString().split('T')[0]
);

// Time string generator (HH:mm format)
const timeStringArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

// Entertainment mode start event generator
const entertainmentModeStartEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('ENTERTAINMENT_MODE' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    action: fc.constant('start' as const),
    sessionId: fc.uuid(),
    timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
    quotaUsedBefore: fc.integer({ min: 0, max: 480 }),
  }),
});

// Entertainment mode stop event generator
const entertainmentModeStopEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('ENTERTAINMENT_MODE' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    action: fc.constant('stop' as const),
    sessionId: fc.uuid(),
    timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
    quotaUsedBefore: fc.integer({ min: 0, max: 480 }),
    quotaUsedAfter: fc.integer({ min: 0, max: 480 }),
    duration: fc.integer({ min: 0, max: 86400 }),
    sitesVisited: fc.array(fc.string({ minLength: 1, maxLength: 255 }), { maxLength: 50 }),
    reason: entertainmentStopReasonArb,
  }),
});

// Combined entertainment mode event generator
const entertainmentModeEventArb = fc.oneof(entertainmentModeStartEventArb, entertainmentModeStopEventArb);

// Work start event generator
const workStartEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('WORK_START' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    date: dateStringArb,
    configuredStartTime: timeStringArb,
    actualStartTime: fc.integer({ min: 1, max: Date.now() + 86400000 }),
    delayMinutes: fc.integer({ min: 0, max: 1440 }),
    trigger: fc.constant('first_pomodoro' as const),
  }),
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 14: Octopus Protocol Consistency', () => {
  /**
   * Feature: browser-sentinel-enhancement, Property 14: Octopus Protocol Consistency
   * Validates: Requirements 10.3, 10.11, 13.7, 13.8
   */

  it('should accept valid EntertainmentModeEvent (start) with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(entertainmentModeStartEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('ENTERTAINMENT_MODE');
          expect(result.data.eventId).toBe(event.eventId);
          expect(result.data.userId).toBe(event.userId);
          expect(result.data.clientId).toBe(event.clientId);
          expect(result.data.clientType).toBe(event.clientType);
          expect(result.data.timestamp).toBe(event.timestamp);
          expect(result.data.sequenceNumber).toBe(event.sequenceNumber);
          if ('payload' in result.data) {
            const payload = result.data.payload as { action: string; sessionId: string };
            expect(payload.action).toBe('start');
            expect(payload.sessionId).toBe(event.payload.sessionId);
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid EntertainmentModeEvent (stop) with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(entertainmentModeStopEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('ENTERTAINMENT_MODE');
          if ('payload' in result.data) {
            const payload = result.data.payload as {
              action: string;
              sessionId: string;
              duration?: number;
              reason?: string;
            };
            expect(payload.action).toBe('stop');
            expect(payload.sessionId).toBe(event.payload.sessionId);
            expect(payload.duration).toBe(event.payload.duration);
            expect(payload.reason).toBe(event.payload.reason);
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid WorkStartEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(workStartEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('WORK_START');
          expect(result.data.eventId).toBe(event.eventId);
          expect(result.data.userId).toBe(event.userId);
          expect(result.data.clientId).toBe(event.clientId);
          expect(result.data.clientType).toBe(event.clientType);
          expect(result.data.timestamp).toBe(event.timestamp);
          expect(result.data.sequenceNumber).toBe(event.sequenceNumber);
          if ('payload' in result.data) {
            const payload = result.data.payload as {
              date: string;
              configuredStartTime: string;
              actualStartTime: number;
              delayMinutes: number;
              trigger: string;
            };
            expect(payload.date).toBe(event.payload.date);
            expect(payload.configuredStartTime).toBe(event.payload.configuredStartTime);
            expect(payload.actualStartTime).toBe(event.payload.actualStartTime);
            expect(payload.delayMinutes).toBe(event.payload.delayMinutes);
            expect(payload.trigger).toBe('first_pomodoro');
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should reject EntertainmentModeEvent with invalid action', async () => {
    await fc.assert(
      fc.asyncProperty(
        entertainmentModeStartEventArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !['start', 'stop'].includes(s)),
        async (validEvent, invalidAction) => {
          const invalidEvent = {
            ...validEvent,
            payload: { ...validEvent.payload, action: invalidAction },
          };
          const result = validateEvent(invalidEvent);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject WorkStartEvent with invalid date format', async () => {
    await fc.assert(
      fc.asyncProperty(
        workStartEventArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s)),
        async (validEvent, invalidDate) => {
          const invalidEvent = {
            ...validEvent,
            payload: { ...validEvent.payload, date: invalidDate },
          };
          const result = validateEvent(invalidEvent);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject WorkStartEvent with invalid time format', async () => {
    await fc.assert(
      fc.asyncProperty(
        workStartEventArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
        async (validEvent, invalidTime) => {
          const invalidEvent = {
            ...validEvent,
            payload: { ...validEvent.payload, configuredStartTime: invalidTime },
          };
          const result = validateEvent(invalidEvent);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject WorkStartEvent with invalid trigger', async () => {
    await fc.assert(
      fc.asyncProperty(
        workStartEventArb,
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s !== 'first_pomodoro'),
        async (validEvent, invalidTrigger) => {
          const invalidEvent = {
            ...validEvent,
            payload: { ...validEvent.payload, trigger: invalidTrigger },
          };
          const result = validateEvent(invalidEvent);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject WorkStartEvent with negative delayMinutes', async () => {
    await fc.assert(
      fc.asyncProperty(workStartEventArb, fc.integer({ min: -1000, max: -1 }), async (validEvent, negativeDelay) => {
        const invalidEvent = {
          ...validEvent,
          payload: { ...validEvent.payload, delayMinutes: negativeDelay },
        };
        const result = validateEvent(invalidEvent);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should reject events missing required base fields', async () => {
    const requiredFields = ['eventId', 'eventType', 'userId', 'clientId', 'clientType', 'timestamp', 'sequenceNumber'];

    await fc.assert(
      fc.asyncProperty(
        entertainmentModeEventArb,
        fc.subarray(requiredFields, { minLength: 1 }),
        async (validEvent, fieldsToRemove) => {
          const invalidEvent = { ...validEvent } as Record<string, unknown>;
          for (const field of fieldsToRemove) {
            delete invalidEvent[field];
          }

          const result = validateEvent(invalidEvent);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate EntertainmentModePayload schema directly', async () => {
    // Test start payload
    const startPayload = {
      action: 'start' as const,
      sessionId: 'test-session-id',
      timestamp: Date.now(),
      quotaUsedBefore: 30,
    };
    const startResult = EntertainmentModePayloadSchema.safeParse(startPayload);
    expect(startResult.success).toBe(true);

    // Test stop payload
    const stopPayload = {
      action: 'stop' as const,
      sessionId: 'test-session-id',
      timestamp: Date.now(),
      quotaUsedBefore: 30,
      quotaUsedAfter: 60,
      duration: 1800,
      sitesVisited: ['youtube.com', 'twitter.com'],
      reason: 'manual' as const,
    };
    const stopResult = EntertainmentModePayloadSchema.safeParse(stopPayload);
    expect(stopResult.success).toBe(true);
  });

  it('should validate WorkStartPayload schema directly', async () => {
    const payload = {
      date: '2025-01-03',
      configuredStartTime: '09:00',
      actualStartTime: Date.now(),
      delayMinutes: 15,
      trigger: 'first_pomodoro' as const,
    };
    const result = WorkStartPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should ensure event format consistency between Browser Sentinel and Desktop Client', async () => {
    // This test verifies that the event structure is consistent
    // by checking that all required fields are present and properly typed
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(entertainmentModeEventArb, workStartEventArb),
        async (event) => {
          const result = validateEvent(event);
          expect(result.success).toBe(true);

          if (result.success) {
            // Verify base event fields are present (consistent with Desktop Client)
            expect(typeof result.data.eventId).toBe('string');
            expect(typeof result.data.eventType).toBe('string');
            expect(typeof result.data.userId).toBe('string');
            expect(typeof result.data.clientId).toBe('string');
            expect(typeof result.data.clientType).toBe('string');
            expect(typeof result.data.timestamp).toBe('number');
            expect(typeof result.data.sequenceNumber).toBe('number');

            // Verify clientType is valid
            expect(['web', 'desktop', 'browser_ext', 'mobile']).toContain(result.data.clientType);

            // Verify timestamp is positive
            expect(result.data.timestamp).toBeGreaterThan(0);

            // Verify sequenceNumber is non-negative
            expect(result.data.sequenceNumber).toBeGreaterThanOrEqual(0);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
