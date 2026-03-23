import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { timelineService, TimelineEventType } from '@/services/timeline.service';

/**
 * Feature: pomodoro-enhancement
 * Property 11: Browser Event Storage Integrity
 * Validates: Requirements 7.1, 7.2, 7.4, 7.5
 *
 * For any activity event submitted by Browser Sentinel with (type, timestamp, duration, metadata),
 * storing and then retrieving the event SHALL produce an equivalent event with all fields preserved.
 */

const prisma = new PrismaClient();

let testUserId: string;
let dbAvailable = false;

// Helper to check database connectivity
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch {
    return false;
  }
}

// Generate unique email for test users
function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `browser-event-pbt-${timestamp}-${random}@test.vibeflow.local`;
}

// Valid event types from Browser Sentinel
const BROWSER_SENTINEL_EVENT_TYPES = [
  'activity_log',
  'block',
  'state_change',
  'interruption',
  'idle',
  'distraction',
  'break',
] as const;

// Metadata generators for different event types
const metadataGenerators: Record<string, fc.Arbitrary<Record<string, unknown>>> = {
  activity_log: fc.record({
    url: fc.webUrl(),
    category: fc.constantFrom('productive', 'neutral', 'distracting'),
  }),
  block: fc.record({
    url: fc.webUrl(),
    blockType: fc.constantFrom('hard_block', 'soft_block'),
    userAction: fc.option(fc.constantFrom('proceeded', 'returned'), { nil: undefined }),
    pomodoroId: fc.option(fc.uuid(), { nil: undefined }),
  }),
  state_change: fc.record({
    fromState: fc.constantFrom('IDLE', 'FOCUS', 'OVER_REST'),
    toState: fc.constantFrom('IDLE', 'FOCUS', 'OVER_REST'),
    trigger: fc.constantFrom('user', 'system', 'timer'),
  }),
  interruption: fc.record({
    source: fc.constantFrom('blocked_site', 'tab_switch', 'idle', 'manual'),
    pomodoroId: fc.uuid(),
    details: fc.option(
      fc.record({
        url: fc.option(fc.webUrl(), { nil: undefined }),
        idleSeconds: fc.option(fc.integer({ min: 0, max: 3600 }), { nil: undefined }),
      }),
      { nil: undefined }
    ),
  }),
  idle: fc.record({
    withinWorkHours: fc.boolean(),
    alertTriggered: fc.boolean(),
  }),
  distraction: fc.record({
    url: fc.webUrl(),
    category: fc.constant('distracting'),
  }),
  break: fc.record({
    reason: fc.constantFrom('pomodoro_complete', 'scheduled', 'manual'),
  }),
};

// Generator for browser event data
function browserEventArb() {
  return fc.constantFrom(...BROWSER_SENTINEL_EVENT_TYPES).chain((eventType) => {
    const metadataArb = metadataGenerators[eventType] ?? fc.constant({});
    
    return fc.record({
      type: fc.constant(eventType),
      // Generate timestamps within the last 24 hours
      startTime: fc.date({
        min: new Date(Date.now() - 24 * 60 * 60 * 1000),
        max: new Date(),
      }),
      // Duration between 1 second and 2 hours
      duration: fc.integer({ min: 1, max: 7200 }),
      // Title with reasonable length
      title: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
      metadata: metadataArb,
      source: fc.constant('browser_sentinel'),
    });
  });
}

// Helper to compare metadata objects (handles undefined vs missing keys)
function metadataEquals(stored: Record<string, unknown>, original: Record<string, unknown>): boolean {
  const storedKeys = Object.keys(stored).filter(k => stored[k] !== undefined);
  const originalKeys = Object.keys(original).filter(k => original[k] !== undefined);
  
  if (storedKeys.length !== originalKeys.length) {
    // Check if difference is only undefined values
    const allKeys = new Set([...storedKeys, ...originalKeys]);
    for (const key of Array.from(allKeys)) {
      const storedVal = stored[key];
      const originalVal = original[key];
      if (storedVal !== originalVal && storedVal !== undefined && originalVal !== undefined) {
        return false;
      }
    }
    return true;
  }
  
  for (const key of storedKeys) {
    const storedVal = stored[key];
    const originalVal = original[key];
    
    if (typeof storedVal === 'object' && storedVal !== null && 
        typeof originalVal === 'object' && originalVal !== null) {
      if (!metadataEquals(storedVal as Record<string, unknown>, originalVal as Record<string, unknown>)) {
        return false;
      }
    } else if (storedVal !== originalVal) {
      return false;
    }
  }
  
  return true;
}

describe('Property 11: Browser Event Storage Integrity', () => {
  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    const testUser = await prisma.user.create({
      data: {
        email: generateTestEmail(),
        password: 'hashed_password_placeholder',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // Clean up all test data
    if (testUserId) {
      await prisma.timelineEvent.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    // Clean up timeline events before each test
    await prisma.timelineEvent.deleteMany({ where: { userId: testUserId } });
  });

  it('storing and retrieving browser events preserves all fields', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        browserEventArb(),
        async (eventData) => {
          // Store the event
          const createResult = await timelineService.create(testUserId, {
            type: eventData.type as typeof TimelineEventType._type,
            startTime: eventData.startTime,
            duration: eventData.duration,
            title: eventData.title,
            metadata: eventData.metadata,
            source: eventData.source,
          });

          expect(createResult.success).toBe(true);
          expect(createResult.data).toBeDefined();

          const storedEvent = createResult.data!;

          // Retrieve the event by date
          const retrieveResult = await timelineService.getByDate(testUserId, {
            date: eventData.startTime,
          });

          expect(retrieveResult.success).toBe(true);
          expect(retrieveResult.data).toBeDefined();

          // Find the stored event in the results
          const retrievedEvent = retrieveResult.data!.find(e => e.id === storedEvent.id);
          expect(retrievedEvent).toBeDefined();

          // Verify all fields are preserved
          expect(retrievedEvent!.type).toBe(eventData.type);
          expect(retrievedEvent!.startTime.getTime()).toBe(eventData.startTime.getTime());
          expect(retrievedEvent!.duration).toBe(eventData.duration);
          expect(retrievedEvent!.title).toBe(eventData.title);
          expect(retrievedEvent!.source).toBe(eventData.source);
          
          // Verify metadata is preserved
          const retrievedMetadata = retrievedEvent!.metadata as Record<string, unknown>;
          expect(metadataEquals(retrievedMetadata, eventData.metadata)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });


  it('batch storing and retrieving browser events preserves all fields', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    // Helper to get local date string (matching getDayBounds behavior)
    const getLocalDateKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    await fc.assert(
      fc.asyncProperty(
        // Generate 1-10 events
        fc.array(browserEventArb(), { minLength: 1, maxLength: 10 }),
        async (eventsData) => {
          // Clean up before each iteration
          await prisma.timelineEvent.deleteMany({ where: { userId: testUserId } });
          
          // Store all events in batch
          const createResult = await timelineService.createBatch(
            testUserId,
            eventsData.map(e => ({
              type: e.type as typeof TimelineEventType._type,
              startTime: e.startTime,
              duration: e.duration,
              title: e.title,
              metadata: e.metadata,
              source: e.source,
            }))
          );

          expect(createResult.success).toBe(true);
          expect(createResult.data).toBeDefined();
          expect(createResult.data!.count).toBe(eventsData.length);

          // Get all unique local dates from the events
          const dateKeys = Array.from(new Set(eventsData.map(e => getLocalDateKey(e.startTime))));

          // Retrieve events for each date and verify
          for (const dateStr of dateKeys) {
            // Create date at noon local time to ensure correct day bounds
            const [year, month, day] = dateStr.split('-').map(Number);
            const date = new Date(year, month - 1, day, 12, 0, 0);
            const retrieveResult = await timelineService.getByDate(testUserId, { date });

            expect(retrieveResult.success).toBe(true);
            expect(retrieveResult.data).toBeDefined();

            // Get events that should be on this date (using local date comparison)
            const expectedEvents = eventsData.filter(e => 
              getLocalDateKey(e.startTime) === dateStr
            );

            // Verify count matches
            expect(retrieveResult.data!.length).toBe(expectedEvents.length);

            // Verify each expected event exists with correct data
            for (const expected of expectedEvents) {
              const found = retrieveResult.data!.find(e => 
                e.type === expected.type &&
                e.startTime.getTime() === expected.startTime.getTime() &&
                e.duration === expected.duration &&
                e.title === expected.title
              );
              expect(found).toBeDefined();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('event type filtering preserves data integrity', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate events of different types
        fc.array(browserEventArb(), { minLength: 3, maxLength: 10 }),
        // Select a subset of types to filter
        fc.subarray(BROWSER_SENTINEL_EVENT_TYPES as unknown as string[], { minLength: 1 }),
        async (eventsData, filterTypes) => {
          // Clean up before each iteration
          await prisma.timelineEvent.deleteMany({ where: { userId: testUserId } });
          
          // Use a fixed date for all events to simplify retrieval
          const testDate = new Date();
          testDate.setHours(12, 0, 0, 0);

          // Store all events with the same date
          for (const eventData of eventsData) {
            await timelineService.create(testUserId, {
              type: eventData.type as typeof TimelineEventType._type,
              startTime: testDate,
              duration: eventData.duration,
              title: eventData.title,
              metadata: eventData.metadata,
              source: eventData.source,
            });
          }

          // Retrieve with type filter
          const retrieveResult = await timelineService.getByDate(testUserId, {
            date: testDate,
            types: filterTypes as typeof TimelineEventType._type[],
          });

          expect(retrieveResult.success).toBe(true);
          expect(retrieveResult.data).toBeDefined();

          // Verify all returned events match the filter
          for (const event of retrieveResult.data!) {
            expect(filterTypes).toContain(event.type);
          }

          // Verify count matches expected
          const expectedCount = eventsData.filter(e => filterTypes.includes(e.type)).length;
          expect(retrieveResult.data!.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('event retrieval by date range preserves data integrity', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate events spread across multiple days
        fc.array(
          fc.record({
            type: fc.constantFrom(...BROWSER_SENTINEL_EVENT_TYPES),
            // Generate dates within the last 7 days
            startTime: fc.date({
              min: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              max: new Date(),
            }),
            duration: fc.integer({ min: 1, max: 3600 }),
            title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            metadata: fc.constant({}),
            source: fc.constant('browser_sentinel'),
          }),
          { minLength: 5, maxLength: 15 }
        ),
        async (eventsData) => {
          // Clean up before each iteration
          await prisma.timelineEvent.deleteMany({ where: { userId: testUserId } });
          
          // Store all events
          for (const eventData of eventsData) {
            await timelineService.create(testUserId, {
              type: eventData.type as typeof TimelineEventType._type,
              startTime: eventData.startTime,
              duration: eventData.duration,
              title: eventData.title,
              metadata: eventData.metadata,
              source: eventData.source,
            });
          }

          // Define a date range (last 3 days)
          const endDate = new Date();
          const startDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

          // Retrieve events in range
          const retrieveResult = await timelineService.getByDateRange(testUserId, {
            startDate,
            endDate,
          });

          expect(retrieveResult.success).toBe(true);
          expect(retrieveResult.data).toBeDefined();

          // Verify all returned events are within the date range
          for (const event of retrieveResult.data!) {
            const eventDate = event.startTime;
            expect(eventDate.getTime()).toBeGreaterThanOrEqual(startDate.setHours(0, 0, 0, 0));
            expect(eventDate.getTime()).toBeLessThanOrEqual(endDate.setHours(23, 59, 59, 999));
          }

          // Verify count matches expected
          const expectedCount = eventsData.filter(e => {
            const eventTime = e.startTime.getTime();
            return eventTime >= startDate.setHours(0, 0, 0, 0) && 
                   eventTime <= endDate.setHours(23, 59, 59, 999);
          }).length;
          expect(retrieveResult.data!.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('metadata with nested objects is preserved correctly', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate complex nested metadata
        fc.record({
          url: fc.webUrl(),
          category: fc.constantFrom('productive', 'neutral', 'distracting'),
          details: fc.record({
            tabId: fc.integer({ min: 1, max: 10000 }),
            windowId: fc.integer({ min: 1, max: 1000 }),
            incognito: fc.boolean(),
            nested: fc.record({
              level: fc.integer({ min: 1, max: 5 }),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
            }),
          }),
        }),
        async (complexMetadata) => {
          const testDate = new Date();
          
          // Store event with complex metadata
          const createResult = await timelineService.create(testUserId, {
            type: 'activity_log',
            startTime: testDate,
            duration: 60,
            title: 'Complex metadata test',
            metadata: complexMetadata,
            source: 'browser_sentinel',
          });

          expect(createResult.success).toBe(true);
          const storedEvent = createResult.data!;

          // Retrieve the event
          const retrieveResult = await timelineService.getByDate(testUserId, {
            date: testDate,
          });

          expect(retrieveResult.success).toBe(true);
          const retrievedEvent = retrieveResult.data!.find(e => e.id === storedEvent.id);
          expect(retrievedEvent).toBeDefined();

          // Verify complex metadata is preserved
          const retrievedMetadata = retrievedEvent!.metadata as Record<string, unknown>;
          expect(retrievedMetadata.url).toBe(complexMetadata.url);
          expect(retrievedMetadata.category).toBe(complexMetadata.category);
          
          const details = retrievedMetadata.details as Record<string, unknown>;
          expect(details.tabId).toBe(complexMetadata.details.tabId);
          expect(details.windowId).toBe(complexMetadata.details.windowId);
          expect(details.incognito).toBe(complexMetadata.details.incognito);
          
          const nested = details.nested as Record<string, unknown>;
          expect(nested.level).toBe(complexMetadata.details.nested.level);
          expect(nested.tags).toEqual(complexMetadata.details.nested.tags);
        }
      ),
      { numRuns: 100 }
    );
  });
});
