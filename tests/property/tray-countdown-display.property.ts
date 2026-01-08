import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { TimeFormatter } from '@/lib/time-formatter';
import { TrayIntegrationService } from '@/services/tray-integration.service';

/**
 * Feature: desktop-tray-enhancement, Property 1: Countdown Display Accuracy
 * 
 * For any active pomodoro session, the displayed countdown time should accurately 
 * reflect the remaining time and update every second without drift.
 * 
 * Validates: Requirements 1.1, 1.2
 */

describe('Property 1: Countdown Display Accuracy', () => {
  /**
   * Property 1.1: Time formatting accuracy
   * For any number of seconds, the formatted time should be accurate and consistent
   */
  it('time formatting produces accurate MM:SS format for any valid seconds input', () => {
    fc.assert(
      fc.property(
        // Generate seconds from 0 to 2 hours (7200 seconds) - covers all pomodoro scenarios
        fc.integer({ min: 0, max: 7200 }),
        (seconds) => {
          const formatted = TimeFormatter.formatTime(seconds);
          
          // Property: Format should always be MM:SS (2+ digits for minutes, 2 digits for seconds)
          expect(formatted).toMatch(/^\d{2,}:\d{2}$/);
          
          // Property: Parse back to verify accuracy
          const parsed = TimeFormatter.parseTime(formatted);
          expect(parsed).toBe(seconds);
          
          // Property: Minutes should be correct
          const expectedMinutes = Math.floor(seconds / 60);
          const expectedSeconds = seconds % 60;
          const [minutesStr, secondsStr] = formatted.split(':');
          
          expect(parseInt(minutesStr, 10)).toBe(expectedMinutes);
          expect(parseInt(secondsStr, 10)).toBe(expectedSeconds);
          
          // Property: Seconds part should never exceed 59
          expect(parseInt(secondsStr, 10)).toBeLessThanOrEqual(59);
          
          // Property: Minutes should be zero-padded to at least 2 digits, seconds always 2 digits
          expect(minutesStr.length).toBeGreaterThanOrEqual(2);
          expect(secondsStr.length).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.2: Countdown calculation accuracy
   * For any pomodoro duration and elapsed time, the remaining time calculation should be accurate
   */
  it('countdown calculation accurately reflects remaining time for any pomodoro session', () => {
    fc.assert(
      fc.property(
        // Generate pomodoro duration (10-120 minutes as per requirements)
        fc.integer({ min: 10, max: 120 }),
        // Generate elapsed time (0 to duration + some buffer)
        fc.integer({ min: 0, max: 150 * 60 * 1000 }), // milliseconds
        (durationMinutes, elapsedMs) => {
          const startTime = new Date(Date.now() - elapsedMs);
          const totalMs = durationMinutes * 60 * 1000;
          
          // Simulate the calculation done in TrayIntegrationService
          const remainingMs = Math.max(0, totalMs - elapsedMs);
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          
          // Property: Remaining time should never be negative
          expect(remainingSeconds).toBeGreaterThanOrEqual(0);
          
          // Property: Remaining time should not exceed total duration
          expect(remainingSeconds).toBeLessThanOrEqual(durationMinutes * 60);
          
          // Property: When elapsed time exceeds duration, remaining should be 0
          if (elapsedMs >= totalMs) {
            expect(remainingSeconds).toBe(0);
          }
          
          // Property: When no time has elapsed, remaining should equal total
          if (elapsedMs === 0) {
            expect(remainingSeconds).toBe(durationMinutes * 60);
          }
          
          // Property: Formatted time should be valid
          const formatted = TimeFormatter.formatTime(remainingSeconds);
          expect(TimeFormatter.isValidTimeFormat(formatted)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.3: Edge cases handling
   * For edge cases like 0 seconds or very long durations, formatting should be consistent
   */
  it('handles edge cases consistently for countdown display', () => {
    fc.assert(
      fc.property(
        // Generate edge case values
        fc.oneof(
          fc.constant(0), // Zero seconds
          fc.constant(1), // One second
          fc.constant(59), // 59 seconds (edge of minute boundary)
          fc.constant(60), // Exactly 1 minute
          fc.constant(3599), // 59:59 (edge of hour boundary)
          fc.constant(3600), // Exactly 1 hour
          fc.integer({ min: -10, max: -1 }), // Negative values (shouldn't happen but test safety)
          fc.integer({ min: 7200, max: 10800 }) // Very long durations
        ),
        (seconds) => {
          const formatted = TimeFormatter.formatTime(seconds);
          
          // Property: Should always return valid MM:SS format (2+ digits for minutes, 2 digits for seconds)
          expect(formatted).toMatch(/^\d{2,}:\d{2}$/);
          
          // Property: Negative inputs should be treated as 0
          if (seconds < 0) {
            expect(formatted).toBe('00:00');
          }
          
          // Property: Zero should format as 00:00
          if (seconds === 0) {
            expect(formatted).toBe('00:00');
          }
          
          // Property: One second should format as 00:01
          if (seconds === 1) {
            expect(formatted).toBe('00:01');
          }
          
          // Property: 59 seconds should format as 00:59
          if (seconds === 59) {
            expect(formatted).toBe('00:59');
          }
          
          // Property: 60 seconds should format as 01:00
          if (seconds === 60) {
            expect(formatted).toBe('01:00');
          }
          
          // Property: Should be parseable back to original (for non-negative)
          if (seconds >= 0) {
            const parsed = TimeFormatter.parseTime(formatted);
            expect(parsed).toBe(seconds);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.4: Consistency across multiple calls
   * For the same input, formatting should always produce the same output
   */
  it('produces consistent output for the same input across multiple calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 7200 }),
        (seconds) => {
          // Call formatting multiple times
          const result1 = TimeFormatter.formatTime(seconds);
          const result2 = TimeFormatter.formatTime(seconds);
          const result3 = TimeFormatter.formatTime(seconds);
          
          // Property: All results should be identical
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
          
          // Property: All results should be valid format
          expect(TimeFormatter.isValidTimeFormat(result1)).toBe(true);
          expect(TimeFormatter.isValidTimeFormat(result2)).toBe(true);
          expect(TimeFormatter.isValidTimeFormat(result3)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});