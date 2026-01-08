import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { TimeFormatter } from '@/lib/time-formatter';

/**
 * Feature: desktop-tray-enhancement, Property 8: Time Format Consistency
 * 
 * For any time display (pomodoro countdown, rest countdown, over-rest duration), 
 * the format should be consistent and follow the MM:SS pattern for countdowns.
 * 
 * Validates: Requirements 1.7, 8.7
 */

describe('Property 8: Time Format Consistency', () => {
  /**
   * Property 8.1: MM:SS format consistency for countdowns
   * For any countdown time, the format should always be consistent MM:SS
   */
  it('countdown formatting produces consistent MM:SS format for any valid time input', () => {
    fc.assert(
      fc.property(
        // Generate seconds from 0 to 24 hours (86400 seconds) - covers all possible countdown scenarios
        fc.integer({ min: 0, max: 86400 }),
        (seconds) => {
          const formatted = TimeFormatter.formatTime(seconds);
          
          // Property: Should always contain exactly one colon
          const colonCount = (formatted.match(/:/g) || []).length;
          expect(colonCount).toBe(1);
          
          // Property: Should split into exactly two parts
          const parts = formatted.split(':');
          expect(parts.length).toBe(2);
          
          const [minutesPart, secondsPart] = parts;
          
          // Property: Both parts should be numeric
          expect(minutesPart).toMatch(/^\d+$/);
          expect(secondsPart).toMatch(/^\d+$/);
          
          // Property: Seconds part should always be exactly 2 digits
          expect(secondsPart.length).toBe(2);
          
          // Property: Seconds part should never exceed 59
          const secondsValue = parseInt(secondsPart, 10);
          expect(secondsValue).toBeGreaterThanOrEqual(0);
          expect(secondsValue).toBeLessThanOrEqual(59);
          
          // Property: Minutes part should be at least 2 digits (zero-padded)
          expect(minutesPart.length).toBeGreaterThanOrEqual(2);
          
          // Property: For times under 100 minutes, minutes should be exactly 2 digits
          if (seconds < 6000) { // Less than 100 minutes
            expect(minutesPart.length).toBe(2);
          }
          
          // Property: Calculated values should match input
          const minutesValue = parseInt(minutesPart, 10);
          const expectedMinutes = Math.floor(seconds / 60);
          const expectedSeconds = seconds % 60;
          
          expect(minutesValue).toBe(expectedMinutes);
          expect(secondsValue).toBe(expectedSeconds);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.2: Over-rest duration format consistency
   * For any over-rest duration, the format should be consistent and human-readable
   */
  it('over-rest duration formatting produces consistent format for any duration input', () => {
    fc.assert(
      fc.property(
        // Generate seconds from 0 to 48 hours (172800 seconds) - covers all reasonable over-rest scenarios
        fc.integer({ min: 0, max: 172800 }),
        (seconds) => {
          const formatted = TimeFormatter.formatOverRestDuration(seconds);
          
          // Property: Should always be a non-empty string
          expect(formatted.length).toBeGreaterThan(0);
          
          // Property: Should match one of the expected formats
          const validFormats = [
            /^\d+s$/, // seconds: "45s"
            /^\d+ min$/, // minutes: "5 min"
            /^\d+h$/, // hours only: "2h"
            /^\d+h \d+m$/ // hours and minutes: "2h 30m"
          ];
          
          const matchesFormat = validFormats.some(regex => regex.test(formatted));
          expect(matchesFormat).toBe(true);
          
          // Property: Format should be appropriate for the duration
          if (seconds < 60) {
            // Should be in seconds format
            expect(formatted).toMatch(/^\d+s$/);
            const value = parseInt(formatted.replace('s', ''), 10);
            expect(value).toBe(seconds);
          } else if (seconds < 3600) {
            // Should be in minutes format
            expect(formatted).toMatch(/^\d+ min$/);
            const value = parseInt(formatted.replace(' min', ''), 10);
            const expectedMinutes = Math.floor(seconds / 60);
            expect(value).toBe(expectedMinutes);
          } else {
            // Should be in hours format (with or without minutes)
            expect(formatted).toMatch(/^\d+h( \d+m)?$/);
            
            const hoursMatch = formatted.match(/^(\d+)h/);
            expect(hoursMatch).toBeTruthy();
            
            const hours = parseInt(hoursMatch![1], 10);
            const expectedHours = Math.floor(seconds / 3600);
            expect(hours).toBe(expectedHours);
            
            // Check minutes part if present
            const minutesMatch = formatted.match(/(\d+)m$/);
            if (minutesMatch) {
              const minutes = parseInt(minutesMatch[1], 10);
              const expectedMinutes = Math.floor((seconds % 3600) / 60);
              expect(minutes).toBe(expectedMinutes);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.3: Round-trip consistency for countdown times
   * For any formatted countdown time, parsing it back should yield the original value
   */
  it('countdown time formatting and parsing are consistent for any valid time', () => {
    fc.assert(
      fc.property(
        // Generate seconds from 0 to 10 hours (36000 seconds) - reasonable countdown range
        fc.integer({ min: 0, max: 36000 }),
        (originalSeconds) => {
          // Format the time
          const formatted = TimeFormatter.formatTime(originalSeconds);
          
          // Parse it back
          const parsedSeconds = TimeFormatter.parseTime(formatted);
          
          // Property: Should be able to parse back successfully
          expect(parsedSeconds).not.toBeNull();
          
          // Property: Parsed value should match original
          expect(parsedSeconds).toBe(originalSeconds);
          
          // Property: Formatting should be idempotent
          const reformatted = TimeFormatter.formatTime(parsedSeconds!);
          expect(reformatted).toBe(formatted);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.4: Format validation consistency
   * For any formatted time string, validation should be consistent with parsing
   */
  it('time format validation is consistent with parsing for any formatted time', () => {
    fc.assert(
      fc.property(
        // Generate seconds to create valid formatted times
        fc.integer({ min: 0, max: 36000 }),
        (seconds) => {
          const formatted = TimeFormatter.formatTime(seconds);
          
          // Property: Valid formatted times should pass validation
          expect(TimeFormatter.isValidTimeFormat(formatted)).toBe(true);
          
          // Property: Valid formatted times should be parseable
          const parsed = TimeFormatter.parseTime(formatted);
          expect(parsed).not.toBeNull();
          expect(parsed).toBe(seconds);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.5: Invalid format rejection consistency
   * For any invalid time format, both validation and parsing should reject it consistently
   */
  it('invalid time formats are consistently rejected by both validation and parsing', () => {
    fc.assert(
      fc.property(
        // Generate various invalid time format strings
        fc.oneof(
          fc.constant(''), // Empty string
          fc.constant('invalid'), // Non-time string
          fc.constant('25:60'), // Invalid seconds (>59)
          fc.constant('1:5'), // Single digit seconds
          fc.constant(':30'), // Missing minutes
          fc.constant('30:'), // Missing seconds
          fc.constant('30'), // Missing colon
          fc.constant('30:30:30'), // Too many parts
          fc.constant('-5:30'), // Negative minutes
          fc.constant('5:-30'), // Negative seconds
          fc.constant('abc:30'), // Non-numeric minutes
          fc.constant('30:abc'), // Non-numeric seconds
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            !TimeFormatter.isValidTimeFormat(s) && 
            !s.match(/^\d+:\d{2}$/) // Avoid accidentally generating valid formats
          )
        ),
        (invalidFormat) => {
          // Property: Invalid formats should fail validation
          expect(TimeFormatter.isValidTimeFormat(invalidFormat)).toBe(false);
          
          // Property: Invalid formats should fail parsing
          const parsed = TimeFormatter.parseTime(invalidFormat);
          expect(parsed).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.6: Cross-format consistency
   * For any time value, different formatting methods should be internally consistent
   */
  it('different time formatting methods are internally consistent for any time value', () => {
    fc.assert(
      fc.property(
        // Generate seconds from 0 to 2 hours (7200 seconds)
        fc.integer({ min: 0, max: 7200 }),
        (seconds) => {
          const mmssFormat = TimeFormatter.formatTime(seconds);
          const durationFormat = TimeFormatter.formatDuration(seconds);
          
          // Property: Both formats should represent the same time value
          // Parse the MM:SS format back to verify consistency
          const parsedSeconds = TimeFormatter.parseTime(mmssFormat);
          expect(parsedSeconds).toBe(seconds);
          
          // Property: Duration format should be human-readable and consistent
          expect(durationFormat.length).toBeGreaterThan(0);
          
          // Property: Duration format should contain appropriate time units
          if (seconds < 60) {
            expect(durationFormat).toContain('second');
          } else if (seconds < 3600) {
            expect(durationFormat).toContain('minute');
          } else {
            expect(durationFormat).toContain('hour');
          }
          
          // Property: Both formats should handle the same edge cases consistently
          if (seconds === 0) {
            expect(mmssFormat).toBe('00:00');
            expect(durationFormat).toContain('0 second');
          }
          
          if (seconds === 1) {
            expect(mmssFormat).toBe('00:01');
            expect(durationFormat).toBe('1 second');
          }
          
          if (seconds === 60) {
            expect(mmssFormat).toBe('01:00');
            expect(durationFormat).toBe('1 minute');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.7: Boundary value consistency
   * For any boundary values (0, 59s, 60s, 3599s, 3600s), formatting should be consistent
   */
  it('boundary values are formatted consistently across all time formatting methods', () => {
    fc.assert(
      fc.property(
        // Generate boundary values and values around them
        fc.oneof(
          fc.constant(0), // Zero
          fc.constant(1), // One second
          fc.constant(59), // 59 seconds
          fc.constant(60), // 1 minute
          fc.constant(61), // 1 minute 1 second
          fc.constant(3599), // 59:59
          fc.constant(3600), // 1 hour
          fc.constant(3661), // 1 hour 1 minute 1 second
          fc.integer({ min: 0, max: 10 }), // Small values
          fc.integer({ min: 50, max: 70 }), // Around minute boundary
          fc.integer({ min: 3590, max: 3610 }) // Around hour boundary
        ),
        (seconds) => {
          const mmssFormat = TimeFormatter.formatTime(seconds);
          const overRestFormat = TimeFormatter.formatOverRestDuration(seconds);
          const durationFormat = TimeFormatter.formatDuration(seconds);
          
          // Property: All formats should be non-empty
          expect(mmssFormat.length).toBeGreaterThan(0);
          expect(overRestFormat.length).toBeGreaterThan(0);
          expect(durationFormat.length).toBeGreaterThan(0);
          
          // Property: MM:SS format should be parseable back to original
          const parsed = TimeFormatter.parseTime(mmssFormat);
          expect(parsed).toBe(seconds);
          
          // Property: All formats should handle zero consistently
          if (seconds === 0) {
            expect(mmssFormat).toBe('00:00');
            expect(overRestFormat).toBe('0s');
            expect(durationFormat).toContain('0 second');
          }
          
          // Property: All formats should handle minute boundaries consistently
          if (seconds === 60) {
            expect(mmssFormat).toBe('01:00');
            expect(overRestFormat).toBe('1 min');
            expect(durationFormat).toBe('1 minute');
          }
          
          // Property: All formats should handle hour boundaries consistently
          if (seconds === 3600) {
            expect(mmssFormat).toBe('60:00');
            expect(overRestFormat).toBe('1h');
            expect(durationFormat).toBe('1 hour');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});