/**
 * Time Formatter Tests
 * 
 * Unit tests for the TimeFormatter utility class.
 * Requirements: 1.7, 8.7
 */

import { describe, it, expect } from 'vitest';
import { TimeFormatter } from './time-formatter';

describe('TimeFormatter', () => {
  describe('formatTime', () => {
    it('should format seconds to MM:SS format', () => {
      expect(TimeFormatter.formatTime(0)).toBe('00:00');
      expect(TimeFormatter.formatTime(30)).toBe('00:30');
      expect(TimeFormatter.formatTime(60)).toBe('01:00');
      expect(TimeFormatter.formatTime(90)).toBe('01:30');
      expect(TimeFormatter.formatTime(1500)).toBe('25:00');
      expect(TimeFormatter.formatTime(3599)).toBe('59:59');
    });

    it('should handle negative values by returning 00:00', () => {
      expect(TimeFormatter.formatTime(-10)).toBe('00:00');
      expect(TimeFormatter.formatTime(-100)).toBe('00:00');
    });

    it('should handle decimal values by flooring them', () => {
      expect(TimeFormatter.formatTime(30.7)).toBe('00:30');
      expect(TimeFormatter.formatTime(90.9)).toBe('01:30');
    });

    it('should handle very large values', () => {
      expect(TimeFormatter.formatTime(6000)).toBe('100:00');
      expect(TimeFormatter.formatTime(7200)).toBe('120:00');
    });
  });

  describe('formatOverRestDuration', () => {
    it('should format seconds for short durations', () => {
      expect(TimeFormatter.formatOverRestDuration(0)).toBe('0s');
      expect(TimeFormatter.formatOverRestDuration(15)).toBe('15s');
      expect(TimeFormatter.formatOverRestDuration(59)).toBe('59s');
    });

    it('should format minutes for medium durations', () => {
      expect(TimeFormatter.formatOverRestDuration(60)).toBe('1 min');
      expect(TimeFormatter.formatOverRestDuration(120)).toBe('2 min');
      expect(TimeFormatter.formatOverRestDuration(900)).toBe('15 min');
      expect(TimeFormatter.formatOverRestDuration(3599)).toBe('59 min');
    });

    it('should format hours for long durations', () => {
      expect(TimeFormatter.formatOverRestDuration(3600)).toBe('1h');
      expect(TimeFormatter.formatOverRestDuration(7200)).toBe('2h');
      expect(TimeFormatter.formatOverRestDuration(3660)).toBe('1h 1m');
      expect(TimeFormatter.formatOverRestDuration(9000)).toBe('2h 30m');
    });

    it('should handle negative values', () => {
      expect(TimeFormatter.formatOverRestDuration(-10)).toBe('0s');
      expect(TimeFormatter.formatOverRestDuration(-100)).toBe('0s');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds for very short durations', () => {
      expect(TimeFormatter.formatDuration(1)).toBe('1 second');
      expect(TimeFormatter.formatDuration(30)).toBe('30 seconds');
      expect(TimeFormatter.formatDuration(59)).toBe('59 seconds');
    });

    it('should format minutes for medium durations', () => {
      expect(TimeFormatter.formatDuration(60)).toBe('1 minute');
      expect(TimeFormatter.formatDuration(120)).toBe('2 minutes');
      expect(TimeFormatter.formatDuration(1800)).toBe('30 minutes');
    });

    it('should format hours and minutes for long durations', () => {
      expect(TimeFormatter.formatDuration(3600)).toBe('1 hour');
      expect(TimeFormatter.formatDuration(7200)).toBe('2 hours');
      expect(TimeFormatter.formatDuration(3660)).toBe('1 hour 1 minute');
      expect(TimeFormatter.formatDuration(9000)).toBe('2 hours 30 minutes');
    });
  });

  describe('parseTime', () => {
    it('should parse valid MM:SS format', () => {
      expect(TimeFormatter.parseTime('00:00')).toBe(0);
      expect(TimeFormatter.parseTime('00:30')).toBe(30);
      expect(TimeFormatter.parseTime('01:00')).toBe(60);
      expect(TimeFormatter.parseTime('25:00')).toBe(1500);
      expect(TimeFormatter.parseTime('59:59')).toBe(3599);
    });

    it('should return null for invalid formats', () => {
      expect(TimeFormatter.parseTime('invalid')).toBe(null);
      expect(TimeFormatter.parseTime('25:60')).toBe(null); // Invalid seconds
      expect(TimeFormatter.parseTime('25')).toBe(null); // Missing seconds
      expect(TimeFormatter.parseTime('')).toBe(null);
      expect(TimeFormatter.parseTime('1:5')).toBe(null); // Single digit seconds
    });

    it('should handle edge cases', () => {
      expect(TimeFormatter.parseTime('1:00')).toBe(60); // Single digit minute
      expect(TimeFormatter.parseTime('100:00')).toBe(6000); // Large minutes
    });
  });

  describe('isValidTimeFormat', () => {
    it('should validate correct MM:SS formats', () => {
      expect(TimeFormatter.isValidTimeFormat('00:00')).toBe(true);
      expect(TimeFormatter.isValidTimeFormat('25:00')).toBe(true);
      expect(TimeFormatter.isValidTimeFormat('59:59')).toBe(true);
      expect(TimeFormatter.isValidTimeFormat('100:00')).toBe(true);
      expect(TimeFormatter.isValidTimeFormat('1:00')).toBe(true); // Single digit minute
    });

    it('should reject invalid formats', () => {
      expect(TimeFormatter.isValidTimeFormat('invalid')).toBe(false);
      expect(TimeFormatter.isValidTimeFormat('25:60')).toBe(false);
      expect(TimeFormatter.isValidTimeFormat('25')).toBe(false);
      expect(TimeFormatter.isValidTimeFormat('')).toBe(false);
      expect(TimeFormatter.isValidTimeFormat('1:5')).toBe(false); // Single digit seconds
    });
  });

  describe('round-trip consistency', () => {
    it('should maintain consistency when formatting and parsing', () => {
      const testValues = [0, 30, 60, 90, 1500, 3599];
      
      testValues.forEach(seconds => {
        const formatted = TimeFormatter.formatTime(seconds);
        const parsed = TimeFormatter.parseTime(formatted);
        expect(parsed).toBe(seconds);
      });
    });
  });
});