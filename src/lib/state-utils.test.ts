import { describe, it, expect } from 'vitest';
import { normalizeState, serializeState, type SystemState } from './state-utils';

describe('state-utils', () => {
  describe('normalizeState', () => {
    it('should map idle to idle', () => {
      expect(normalizeState('idle')).toBe('idle');
      expect(normalizeState('IDLE')).toBe('idle');
      expect(normalizeState('Idle')).toBe('idle');
    });

    it('should map locked to idle', () => {
      expect(normalizeState('locked')).toBe('idle');
      expect(normalizeState('LOCKED')).toBe('idle');
    });

    it('should map planning to idle', () => {
      expect(normalizeState('planning')).toBe('idle');
      expect(normalizeState('PLANNING')).toBe('idle');
    });

    it('should map rest to idle', () => {
      expect(normalizeState('rest')).toBe('idle');
      expect(normalizeState('REST')).toBe('idle');
    });

    it('should map focus to focus', () => {
      expect(normalizeState('focus')).toBe('focus');
      expect(normalizeState('FOCUS')).toBe('focus');
      expect(normalizeState('Focus')).toBe('focus');
    });

    it('should map over_rest to over_rest', () => {
      expect(normalizeState('over_rest')).toBe('over_rest');
      expect(normalizeState('OVER_REST')).toBe('over_rest');
      expect(normalizeState('Over_Rest')).toBe('over_rest');
    });

    it('should map overrest (no underscore) to over_rest', () => {
      expect(normalizeState('overrest')).toBe('over_rest');
      expect(normalizeState('OVERREST')).toBe('over_rest');
    });

    it('should map unknown values to idle', () => {
      expect(normalizeState('')).toBe('idle');
      expect(normalizeState('invalid')).toBe('idle');
      expect(normalizeState('unknown_state')).toBe('idle');
    });
  });

  describe('serializeState', () => {
    it('should serialize idle to IDLE', () => {
      expect(serializeState('idle')).toBe('IDLE');
    });

    it('should serialize focus to FOCUS', () => {
      expect(serializeState('focus')).toBe('FOCUS');
    });

    it('should serialize over_rest to OVER_REST', () => {
      expect(serializeState('over_rest')).toBe('OVER_REST');
    });

    it('should roundtrip: normalizeState(serializeState(x)) === x', () => {
      const states: SystemState[] = ['idle', 'focus', 'over_rest'];
      for (const s of states) {
        expect(normalizeState(serializeState(s))).toBe(s);
      }
    });
  });
});
