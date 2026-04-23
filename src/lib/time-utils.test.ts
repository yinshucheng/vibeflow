/**
 * Time Window Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseTimeToMinutes,
  getCurrentTimeMinutes,
  isTimeInWindow,
  getWindowDuration,
  getRemainingMinutesInWindow,
  getWindowRemainingMinutes,
  isWithinTimeSlots,
  findCurrentTimeSlot,
  calculateRemainingMinutesInSlots,
} from './time-utils';

describe('Time Window Utilities', () => {
  describe('parseTimeToMinutes', () => {
    it('should parse "09:00" to 540', () => {
      expect(parseTimeToMinutes('09:00')).toBe(540);
    });

    it('should parse "00:00" to 0', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
    });

    it('should parse "23:59" to 1439', () => {
      expect(parseTimeToMinutes('23:59')).toBe(1439);
    });

    it('should parse "18:30" to 1110', () => {
      expect(parseTimeToMinutes('18:30')).toBe(1110);
    });
  });

  describe('isTimeInWindow', () => {
    describe('normal windows (no cross-midnight)', () => {
      it('should return true for time within window', () => {
        expect(isTimeInWindow(600, 540, 1080)).toBe(true); // 10:00 in 09:00-18:00
      });

      it('should return true at start boundary (inclusive)', () => {
        expect(isTimeInWindow(540, 540, 1080)).toBe(true); // 09:00
      });

      it('should return false at end boundary (exclusive)', () => {
        expect(isTimeInWindow(1080, 540, 1080)).toBe(false); // 18:00
      });

      it('should return false before window', () => {
        expect(isTimeInWindow(480, 540, 1080)).toBe(false); // 08:00
      });

      it('should return false after window', () => {
        expect(isTimeInWindow(1200, 540, 1080)).toBe(false); // 20:00
      });
    });

    describe('cross-midnight windows', () => {
      // 22:00-02:00 = 1320-120
      it('should return true for time before midnight', () => {
        expect(isTimeInWindow(1380, 1320, 120)).toBe(true); // 23:00
      });

      it('should return true at start boundary', () => {
        expect(isTimeInWindow(1320, 1320, 120)).toBe(true); // 22:00
      });

      it('should return true for time after midnight', () => {
        expect(isTimeInWindow(60, 1320, 120)).toBe(true); // 01:00
      });

      it('should return false at end boundary', () => {
        expect(isTimeInWindow(120, 1320, 120)).toBe(false); // 02:00
      });

      it('should return false in daytime gap', () => {
        expect(isTimeInWindow(600, 1320, 120)).toBe(false); // 10:00
      });
    });
  });

  describe('getWindowDuration', () => {
    it('should return duration for normal window', () => {
      expect(getWindowDuration(540, 1080)).toBe(540); // 09:00-18:00 = 9 hours
    });

    it('should return duration for cross-midnight window', () => {
      expect(getWindowDuration(1320, 120)).toBe(240); // 22:00-02:00 = 4 hours
    });
  });

  describe('getRemainingMinutesInWindow', () => {
    it('should return remaining minutes when end is later today', () => {
      expect(getRemainingMinutesInWindow(600, 1080)).toBe(480); // 10:00 to 18:00 = 8 hours
    });

    it('should return remaining minutes for cross-midnight (end tomorrow)', () => {
      expect(getRemainingMinutesInWindow(1380, 120)).toBe(180); // 23:00 to 02:00 = 3 hours
    });
  });

  describe('getWindowRemainingMinutes', () => {
    describe('normal windows', () => {
      it('should return full duration when before window', () => {
        expect(getWindowRemainingMinutes(480, 540, 1080)).toBe(540); // 08:00, 09:00-18:00
      });

      it('should return remaining when in window', () => {
        expect(getWindowRemainingMinutes(600, 540, 1080)).toBe(480); // 10:00, 09:00-18:00
      });

      it('should return 0 when after window', () => {
        expect(getWindowRemainingMinutes(1200, 540, 1080)).toBe(0); // 20:00, 09:00-18:00
      });
    });

    describe('cross-midnight windows (e.g., 22:00-02:00)', () => {
      // 22:00-02:00 = 1320-120 = 240 min duration
      it('should return remaining when in morning part (after midnight)', () => {
        expect(getWindowRemainingMinutes(60, 1320, 120)).toBe(60); // 01:00 to 02:00
      });

      it('should return remaining when in evening part (before midnight)', () => {
        expect(getWindowRemainingMinutes(1380, 1320, 120)).toBe(180); // 23:00 to 02:00
      });

      it('should return full duration when in daytime gap', () => {
        expect(getWindowRemainingMinutes(600, 1320, 120)).toBe(240); // 10:00, full 4 hours
      });
    });
  });

  describe('calculateRemainingMinutesInSlots', () => {
    it('should handle single normal slot', () => {
      const slots = [{ startTime: '09:00', endTime: '18:00', enabled: true }];
      // At 10:00 (600), remaining = 18:00-10:00 = 8 hours = 480 min
      expect(calculateRemainingMinutesInSlots(slots, 600)).toBe(480);
    });

    it('should handle cross-midnight slot', () => {
      const slots = [{ startTime: '22:00', endTime: '02:00', enabled: true }];
      // At 23:00 (1380), in window, remaining = 3 hours = 180 min
      expect(calculateRemainingMinutesInSlots(slots, 1380)).toBe(180);
    });

    it('should return 0 for disabled slots', () => {
      const slots = [{ startTime: '09:00', endTime: '18:00', enabled: false }];
      expect(calculateRemainingMinutesInSlots(slots, 600)).toBe(0);
    });

    it('should sum multiple slots', () => {
      const slots = [
        { startTime: '09:00', endTime: '12:00', enabled: true }, // 3 hours
        { startTime: '14:00', endTime: '18:00', enabled: true }, // 4 hours
      ];
      // At 08:00 (480), both slots haven't started
      // First slot: 3 hours, Second slot: 4 hours = 7 hours = 420 min
      expect(calculateRemainingMinutesInSlots(slots, 480)).toBe(420);
    });

    it('should handle negative case from review (night shift at 21:00)', () => {
      const slots = [{ startTime: '22:00', endTime: '02:00', enabled: true }];
      // At 21:00 (1260), we're in the daytime gap before the night shift
      // Window hasn't started yet, should return full 4-hour duration
      expect(calculateRemainingMinutesInSlots(slots, 1260)).toBe(240);
    });

    it('should handle case from review (in window at 23:00)', () => {
      const slots = [{ startTime: '22:00', endTime: '02:00', enabled: true }];
      // At 23:00 (1380), we're in the window, remaining = 3 hours
      expect(calculateRemainingMinutesInSlots(slots, 1380)).toBe(180);
    });
  });

  describe('isWithinTimeSlots', () => {
    it('should return true when in any enabled slot', () => {
      const slots = [
        { startTime: '09:00', endTime: '12:00', enabled: true },
        { startTime: '14:00', endTime: '18:00', enabled: true },
      ];
      expect(isWithinTimeSlots(slots, 600)).toBe(true); // 10:00 - in first slot
      expect(isWithinTimeSlots(slots, 900)).toBe(true); // 15:00 - in second slot
      expect(isWithinTimeSlots(slots, 780)).toBe(false); // 13:00 - gap between slots
    });

    it('should work with cross-midnight slots', () => {
      const slots = [{ startTime: '22:00', endTime: '02:00', enabled: true }];
      expect(isWithinTimeSlots(slots, 1380)).toBe(true); // 23:00
      expect(isWithinTimeSlots(slots, 60)).toBe(true); // 01:00
      expect(isWithinTimeSlots(slots, 600)).toBe(false); // 10:00
    });
  });

  describe('findCurrentTimeSlot', () => {
    it('should find the slot containing current time', () => {
      const slots = [
        { id: '1', startTime: '09:00', endTime: '12:00', enabled: true },
        { id: '2', startTime: '14:00', endTime: '18:00', enabled: true },
      ];
      const slot = findCurrentTimeSlot(slots, 600);
      expect(slot?.id).toBe('1');
    });

    it('should return null when not in any slot', () => {
      const slots = [{ id: '1', startTime: '09:00', endTime: '12:00', enabled: true }];
      expect(findCurrentTimeSlot(slots, 1200)).toBeNull(); // 20:00
    });

    it('should find cross-midnight slot', () => {
      const slots = [{ id: '1', startTime: '22:00', endTime: '02:00', enabled: true }];
      expect(findCurrentTimeSlot(slots, 1380)?.id).toBe('1'); // 23:00
      expect(findCurrentTimeSlot(slots, 60)?.id).toBe('1'); // 01:00
    });
  });
});
