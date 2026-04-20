import { describe, it, expect, vi } from 'vitest';
import { createEventBuilder } from '../src/protocol/event-builder';

describe('createEventBuilder', () => {
  it('builds events with correct BaseEvent fields', () => {
    const builder = createEventBuilder({
      clientType: 'mobile',
      clientId: 'ios-device-1',
      userId: 'user-123',
    });

    const event = builder.build('ACTIVITY_LOG', {
      source: 'mobile_app',
      identifier: 'com.test',
      title: 'Test App',
      duration: 60,
      category: 'productive',
    });

    expect(event.eventType).toBe('ACTIVITY_LOG');
    expect(event.userId).toBe('user-123');
    expect(event.clientId).toBe('ios-device-1');
    expect(event.clientType).toBe('mobile');
    expect(event.eventId).toBeTruthy();
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.sequenceNumber).toBe(0);
  });

  it('increments sequenceNumber', () => {
    const builder = createEventBuilder({
      clientType: 'desktop',
      clientId: 'desktop-1',
      userId: 'user-1',
    });

    const e1 = builder.build('STATE_CHANGE', { previousState: 'idle', newState: 'focus', trigger: 'user', timestamp: Date.now() });
    const e2 = builder.build('STATE_CHANGE', { previousState: 'focus', newState: 'idle', trigger: 'timer', timestamp: Date.now() });
    const e3 = builder.build('HEARTBEAT', { uptime: 100 });

    expect(e1.sequenceNumber).toBe(0);
    expect(e2.sequenceNumber).toBe(1);
    expect(e3.sequenceNumber).toBe(2);
  });

  it('generates unique eventIds', () => {
    const builder = createEventBuilder({
      clientType: 'browser_ext',
      clientId: 'ext-1',
      userId: 'user-1',
    });

    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const event = builder.build('HEARTBEAT', { uptime: i });
      ids.add(event.eventId);
    }
    expect(ids.size).toBe(100);
  });

  it('resetSequence resets counter to 0', () => {
    const builder = createEventBuilder({
      clientType: 'mobile',
      clientId: 'ios-1',
      userId: 'user-1',
    });

    builder.build('HEARTBEAT', { uptime: 0 });
    builder.build('HEARTBEAT', { uptime: 1 });
    const e3 = builder.build('HEARTBEAT', { uptime: 2 });
    expect(e3.sequenceNumber).toBe(2);

    builder.resetSequence();

    const e4 = builder.build('HEARTBEAT', { uptime: 3 });
    expect(e4.sequenceNumber).toBe(0);
  });

  describe('buildHeartbeat', () => {
    it('injects getUptime value', () => {
      const builder = createEventBuilder({
        clientType: 'desktop',
        clientId: 'desktop-1',
        userId: 'user-1',
        getUptime: () => 42.5,
      });

      const hb = builder.buildHeartbeat();
      expect(hb.eventType).toBe('HEARTBEAT');
      expect(hb.payload.uptime).toBe(42.5);
    });

    it('defaults uptime to 0 when getUptime is not provided', () => {
      const builder = createEventBuilder({
        clientType: 'browser_ext',
        clientId: 'ext-1',
        userId: 'user-1',
        // no getUptime
      });

      const hb = builder.buildHeartbeat();
      expect(hb.payload.uptime).toBe(0);
    });

    it('does not crash when getUptime is undefined', () => {
      const builder = createEventBuilder({
        clientType: 'mobile',
        clientId: 'ios-1',
        userId: 'user-1',
      });

      expect(() => builder.buildHeartbeat()).not.toThrow();
    });

    it('merges platform metadata', () => {
      const builder = createEventBuilder({
        clientType: 'desktop',
        clientId: 'desktop-1',
        userId: 'user-1',
        getUptime: () => 100,
      });

      const hb = builder.buildHeartbeat({
        clientVersion: '1.0.0',
        platform: 'macos',
        connectionQuality: 'good',
        localStateHash: 'abc123',
        capabilities: ['sensor:app'],
      });

      expect(hb.payload.uptime).toBe(100);
      expect(hb.payload.clientVersion).toBe('1.0.0');
      expect(hb.payload.platform).toBe('macos');
    });
  });
});
