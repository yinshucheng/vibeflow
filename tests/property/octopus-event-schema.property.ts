import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  validateEvent,
  type ClientType,
  type ActivityCategory,
  type ConnectionQuality,
  type NavigationType,
  type SearchEngine,
  type BrowserFocusState,
} from '@/types/octopus';

/**
 * Feature: octopus-architecture
 * Property 1: Event Schema Validation
 * Validates: Requirements 2.3, 7.2, 7.3, 7.4, 7.5, 7.6
 *
 * For any event sent from a Tentacle to Vibe Brain, the event SHALL contain
 * all required base fields (eventId, eventType, userId, clientId, clientType,
 * timestamp, sequenceNumber) and type-specific payload fields. Events missing
 * required fields SHALL be rejected with a validation error.
 */

// =============================================================================
// GENERATORS
// =============================================================================

// Base event field generators
const clientTypeArb = fc.constantFrom<ClientType>('web', 'desktop', 'browser_ext', 'mobile');

const activityCategoryArb = fc.constantFrom<ActivityCategory>('productive', 'neutral', 'distracting');

const connectionQualityArb = fc.constantFrom<ConnectionQuality>('good', 'degraded', 'poor');

const navigationTypeArb = fc.constantFrom<NavigationType>('link', 'typed', 'reload', 'back_forward', 'other');

const searchEngineArb = fc.constantFrom<SearchEngine>('google', 'bing', 'duckduckgo', 'other');

const browserFocusStateArb = fc.constantFrom<BrowserFocusState>('focused', 'blurred', 'unknown');

// Activity log event generator
const activityLogEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('ACTIVITY_LOG' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    source: fc.constantFrom('browser' as const, 'desktop_app' as const, 'mobile_app' as const),
    identifier: fc.string({ minLength: 1, maxLength: 255 }),
    title: fc.string({ maxLength: 255 }),
    duration: fc.float({ min: 0, max: 86400, noNaN: true }),
    category: activityCategoryArb,
    metadata: fc.option(
      fc.record({
        domain: fc.option(fc.string({ maxLength: 255 }), { nil: undefined }),
        appBundleId: fc.option(fc.string({ maxLength: 255 }), { nil: undefined }),
        windowTitle: fc.option(fc.string({ maxLength: 255 }), { nil: undefined }),
      }),
      { nil: undefined }
    ),
  }),
});

// Heartbeat event generator
const heartbeatEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('HEARTBEAT' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    clientVersion: fc.string({ minLength: 1, maxLength: 50 }),
    platform: fc.string({ minLength: 1, maxLength: 50 }),
    connectionQuality: connectionQualityArb,
    localStateHash: fc.string({ maxLength: 64 }),
    capabilities: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 20 }),
    uptime: fc.float({ min: 0, max: 86400 * 365, noNaN: true }),
  }),
});

// State change event generator
const stateChangeEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('STATE_CHANGE' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    previousState: fc.string({ minLength: 1, maxLength: 50 }),
    newState: fc.string({ minLength: 1, maxLength: 50 }),
    trigger: fc.string({ minLength: 1, maxLength: 100 }),
    timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  }),
});

// User action event generator
const userActionEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('USER_ACTION' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    actionType: fc.string({ minLength: 1, maxLength: 50 }),
    targetEntity: fc.string({ minLength: 1, maxLength: 100 }),
    parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ maxLength: 100 })),
    result: fc.string({ minLength: 1, maxLength: 50 }),
  }),
});

// Browser activity event generator
const browserActivityEventArb = fc.integer({ min: 1, max: Date.now() }).chain((startTime) =>
  fc.record({
    eventId: fc.uuid(),
    eventType: fc.constant('BROWSER_ACTIVITY' as const),
    userId: fc.string({ minLength: 1, maxLength: 36 }),
    clientId: fc.string({ minLength: 1, maxLength: 36 }),
    clientType: clientTypeArb,
    timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
    sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
    payload: fc.record({
      url: fc.webUrl(),
      title: fc.string({ maxLength: 255 }),
      domain: fc.string({ minLength: 1, maxLength: 255 }),
      startTime: fc.constant(startTime),
      endTime: fc.integer({ min: startTime, max: startTime + 86400000 }),
      duration: fc.float({ min: 0, max: 86400, noNaN: true }),
      activeDuration: fc.float({ min: 0, max: 86400, noNaN: true }),
      idleTime: fc.float({ min: 0, max: 86400, noNaN: true }),
      category: activityCategoryArb,
      productivityScore: fc.integer({ min: 0, max: 100 }),
      scrollDepth: fc.integer({ min: 0, max: 100 }),
      interactionCount: fc.integer({ min: 0, max: 10000 }),
      isMediaPlaying: fc.boolean(),
      mediaPlayDuration: fc.float({ min: 0, max: 86400, noNaN: true }),
      referrer: fc.option(fc.string({ maxLength: 255 }), { nil: undefined }),
      navigationType: navigationTypeArb,
      searchQuery: fc.option(fc.string({ maxLength: 255 }), { nil: undefined }),
      searchEngine: fc.option(searchEngineArb, { nil: undefined }),
    }),
  })
);

// Browser session event generator
const browserSessionEventArb = fc.integer({ min: 1, max: Date.now() }).chain((startTime) =>
  fc.record({
    eventId: fc.uuid(),
    eventType: fc.constant('BROWSER_SESSION' as const),
    userId: fc.string({ minLength: 1, maxLength: 36 }),
    clientId: fc.string({ minLength: 1, maxLength: 36 }),
    clientType: clientTypeArb,
    timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
    sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
    payload: fc.record({
      sessionId: fc.string({ minLength: 1, maxLength: 36 }),
      startTime: fc.constant(startTime),
      endTime: fc.integer({ min: startTime, max: startTime + 86400000 }),
      totalDuration: fc.float({ min: 0, max: 86400, noNaN: true }),
      activeDuration: fc.float({ min: 0, max: 86400, noNaN: true }),
      domainBreakdown: fc.array(
        fc.record({
          domain: fc.string({ minLength: 1, maxLength: 255 }),
          duration: fc.float({ min: 0, max: 86400, noNaN: true }),
          activeDuration: fc.float({ min: 0, max: 86400, noNaN: true }),
          category: activityCategoryArb,
          visitCount: fc.integer({ min: 1, max: 1000 }),
        }),
        { maxLength: 50 }
      ),
      tabSwitchCount: fc.integer({ min: 0, max: 10000 }),
      rapidTabSwitches: fc.integer({ min: 0, max: 10000 }),
      uniqueDomainsVisited: fc.integer({ min: 0, max: 1000 }),
      productiveTime: fc.float({ min: 0, max: 86400, noNaN: true }),
      distractingTime: fc.float({ min: 0, max: 86400, noNaN: true }),
      neutralTime: fc.float({ min: 0, max: 86400, noNaN: true }),
      productivityScore: fc.integer({ min: 0, max: 100 }),
    }),
  })
);

// Tab switch event generator
const tabSwitchEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('TAB_SWITCH' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    fromTabId: fc.integer({ min: 0, max: 1000000 }),
    toTabId: fc.integer({ min: 0, max: 1000000 }),
    fromUrl: fc.string({ maxLength: 2000 }),
    toUrl: fc.string({ maxLength: 2000 }),
    fromDomain: fc.string({ maxLength: 255 }),
    toDomain: fc.string({ maxLength: 255 }),
    timeSinceLastSwitch: fc.float({ min: 0, max: 86400000, noNaN: true }),
    isRapidSwitch: fc.boolean(),
  }),
});

// Browser focus event generator
const browserFocusEventArb = fc.record({
  eventId: fc.uuid(),
  eventType: fc.constant('BROWSER_FOCUS' as const),
  userId: fc.string({ minLength: 1, maxLength: 36 }),
  clientId: fc.string({ minLength: 1, maxLength: 36 }),
  clientType: clientTypeArb,
  timestamp: fc.integer({ min: 1, max: Date.now() + 86400000 }),
  sequenceNumber: fc.integer({ min: 0, max: 1000000 }),
  payload: fc.record({
    isFocused: fc.boolean(),
    previousState: browserFocusStateArb,
    focusDuration: fc.option(fc.float({ min: 0, max: 86400, noNaN: true }), { nil: undefined }),
  }),
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 1: Event Schema Validation', () => {
  /**
   * Feature: octopus-architecture, Property 1: Event Schema Validation
   * Validates: Requirements 2.3, 7.2, 7.3, 7.4, 7.5, 7.6
   */

  it('should accept valid ActivityLogEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(activityLogEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('ACTIVITY_LOG');
          expect(result.data.eventId).toBe(event.eventId);
          expect(result.data.userId).toBe(event.userId);
          expect(result.data.clientId).toBe(event.clientId);
          expect(result.data.clientType).toBe(event.clientType);
          expect(result.data.timestamp).toBe(event.timestamp);
          expect(result.data.sequenceNumber).toBe(event.sequenceNumber);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid HeartbeatEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('HEARTBEAT');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid StateChangeEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(stateChangeEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('STATE_CHANGE');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid UserActionEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(userActionEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('USER_ACTION');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid BrowserActivityEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(browserActivityEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('BROWSER_ACTIVITY');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid BrowserSessionEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(browserSessionEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('BROWSER_SESSION');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid TabSwitchEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(tabSwitchEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('TAB_SWITCH');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid BrowserFocusEvent with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(browserFocusEventArb, async (event) => {
        const result = validateEvent(event);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.eventType).toBe('BROWSER_FOCUS');
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should reject events missing required base fields', async () => {
    // Generator for events with randomly missing required fields
    const requiredFields = ['eventId', 'eventType', 'userId', 'clientId', 'clientType', 'timestamp', 'sequenceNumber'];

    await fc.assert(
      fc.asyncProperty(
        activityLogEventArb,
        fc.subarray(requiredFields, { minLength: 1 }),
        async (validEvent, fieldsToRemove) => {
          // Create a copy and remove some required fields
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

  it('should reject events with invalid eventType', async () => {
    await fc.assert(
      fc.asyncProperty(
        activityLogEventArb,
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !['ACTIVITY_LOG', 'STATE_CHANGE', 'USER_ACTION', 'HEARTBEAT', 'BROWSER_ACTIVITY', 'BROWSER_SESSION', 'TAB_SWITCH', 'BROWSER_FOCUS'].includes(s)),
        async (validEvent, invalidEventType) => {
          const invalidEvent = { ...validEvent, eventType: invalidEventType };
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

  it('should reject events with invalid clientType', async () => {
    await fc.assert(
      fc.asyncProperty(
        activityLogEventArb,
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !['web', 'desktop', 'browser_ext', 'mobile'].includes(s)),
        async (validEvent, invalidClientType) => {
          const invalidEvent = { ...validEvent, clientType: invalidClientType };
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

  it('should reject events with negative timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(activityLogEventArb, fc.integer({ min: -1000000, max: 0 }), async (validEvent, negativeTimestamp) => {
        const invalidEvent = { ...validEvent, timestamp: negativeTimestamp };
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

  it('should reject events with negative sequenceNumber', async () => {
    await fc.assert(
      fc.asyncProperty(activityLogEventArb, fc.integer({ min: -1000000, max: -1 }), async (validEvent, negativeSeq) => {
        const invalidEvent = { ...validEvent, sequenceNumber: negativeSeq };
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
});
