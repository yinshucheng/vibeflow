/**
 * Idle Service Tests — specifically for isWithinWorkHours cross-midnight support
 */

import { describe, it, expect } from 'vitest';
import { isWithinWorkHours } from './idle.service';

describe('isWithinWorkHours', () => {
  describe('normal time ranges (no cross-midnight)', () => {
    const slots = [{ id: '1', startTime: '09:00', endTime: '18:00', enabled: true }];

    it('should return true at 10:00 (within range)', () => {
      expect(isWithinWorkHours(slots, 10 * 60)).toBe(true);
    });

    it('should return true at 09:00 (start boundary, inclusive)', () => {
      expect(isWithinWorkHours(slots, 9 * 60)).toBe(true);
    });

    it('should return false at 18:00 (end boundary, exclusive)', () => {
      expect(isWithinWorkHours(slots, 18 * 60)).toBe(false);
    });

    it('should return false at 08:59 (before range)', () => {
      expect(isWithinWorkHours(slots, 8 * 60 + 59)).toBe(false);
    });

    it('should return false at 20:00 (after range)', () => {
      expect(isWithinWorkHours(slots, 20 * 60)).toBe(false);
    });
  });

  describe('cross-midnight time ranges (night shift)', () => {
    const nightShiftSlots = [{ id: '1', startTime: '22:00', endTime: '02:00', enabled: true }];

    it('should return true at 23:00 (within range, before midnight)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 23 * 60)).toBe(true);
    });

    it('should return true at 22:00 (start boundary, inclusive)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 22 * 60)).toBe(true);
    });

    it('should return true at 00:30 (within range, after midnight)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 30)).toBe(true);
    });

    it('should return true at 01:59 (just before end)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 1 * 60 + 59)).toBe(true);
    });

    it('should return false at 02:00 (end boundary, exclusive)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 2 * 60)).toBe(false);
    });

    it('should return false at 21:59 (before range)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 21 * 60 + 59)).toBe(false);
    });

    it('should return false at 10:00 (daytime, outside range)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 10 * 60)).toBe(false);
    });

    it('should return false at 03:00 (after range ends)', () => {
      expect(isWithinWorkHours(nightShiftSlots, 3 * 60)).toBe(false);
    });
  });

  describe('disabled slots', () => {
    const disabledSlots = [{ id: '1', startTime: '09:00', endTime: '18:00', enabled: false }];

    it('should return false even during "work hours" if slot is disabled', () => {
      expect(isWithinWorkHours(disabledSlots, 12 * 60)).toBe(false);
    });
  });

  describe('multiple slots', () => {
    const multiSlots = [
      { id: '1', startTime: '09:00', endTime: '12:00', enabled: true },
      { id: '2', startTime: '14:00', endTime: '18:00', enabled: true },
      { id: '3', startTime: '22:00', endTime: '02:00', enabled: true }, // night shift
    ];

    it('should return true in first slot', () => {
      expect(isWithinWorkHours(multiSlots, 10 * 60)).toBe(true);
    });

    it('should return true in second slot', () => {
      expect(isWithinWorkHours(multiSlots, 15 * 60)).toBe(true);
    });

    it('should return true in night shift slot (before midnight)', () => {
      expect(isWithinWorkHours(multiSlots, 23 * 60)).toBe(true);
    });

    it('should return true in night shift slot (after midnight)', () => {
      expect(isWithinWorkHours(multiSlots, 1 * 60)).toBe(true);
    });

    it('should return false in gap between slots', () => {
      expect(isWithinWorkHours(multiSlots, 13 * 60)).toBe(false);
    });
  });
});
