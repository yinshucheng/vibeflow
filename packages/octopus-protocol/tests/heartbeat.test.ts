import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHeartbeat } from '../src/protocol/heartbeat';
import type { HeartbeatEvent } from '../src/types';

function mockHeartbeatEvent(): HeartbeatEvent {
  return {
    eventId: 'hb-1',
    eventType: 'HEARTBEAT',
    userId: 'user-1',
    clientId: 'client-1',
    clientType: 'desktop',
    timestamp: Date.now(),
    sequenceNumber: 0,
    payload: {
      clientVersion: '1.0.0',
      platform: 'macos',
      connectionQuality: 'good',
      localStateHash: 'abc',
      capabilities: [],
      uptime: 0,
    },
  };
}

describe('createHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends immediate heartbeat on start', () => {
    const sendEvent = vi.fn();
    const hb = createHeartbeat({
      buildHeartbeat: mockHeartbeatEvent,
      sendEvent,
      intervalMs: 30_000,
    });

    hb.start();

    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent.mock.calls[0][0].eventType).toBe('HEARTBEAT');

    hb.stop();
  });

  it('sends periodic heartbeats', () => {
    const sendEvent = vi.fn();
    const hb = createHeartbeat({
      buildHeartbeat: mockHeartbeatEvent,
      sendEvent,
      intervalMs: 10_000,
    });

    hb.start();
    expect(sendEvent).toHaveBeenCalledTimes(1); // immediate

    vi.advanceTimersByTime(10_000);
    expect(sendEvent).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);
    expect(sendEvent).toHaveBeenCalledTimes(3);

    hb.stop();
  });

  it('stops sending after stop()', () => {
    const sendEvent = vi.fn();
    const hb = createHeartbeat({
      buildHeartbeat: mockHeartbeatEvent,
      sendEvent,
      intervalMs: 10_000,
    });

    hb.start();
    expect(sendEvent).toHaveBeenCalledTimes(1);

    hb.stop();

    vi.advanceTimersByTime(30_000);
    expect(sendEvent).toHaveBeenCalledTimes(1); // no more after stop
  });

  it('uses default 30s interval', () => {
    const sendEvent = vi.fn();
    const hb = createHeartbeat({
      buildHeartbeat: mockHeartbeatEvent,
      sendEvent,
    });

    hb.start();
    expect(sendEvent).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(29_999);
    expect(sendEvent).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(sendEvent).toHaveBeenCalledTimes(2);

    hb.stop();
  });

  it('sendNow sends a heartbeat immediately', () => {
    const sendEvent = vi.fn();
    const hb = createHeartbeat({
      buildHeartbeat: mockHeartbeatEvent,
      sendEvent,
      intervalMs: 30_000,
    });

    hb.sendNow();
    expect(sendEvent).toHaveBeenCalledTimes(1);

    hb.sendNow();
    expect(sendEvent).toHaveBeenCalledTimes(2);
  });

  it('start is idempotent (no double intervals)', () => {
    const sendEvent = vi.fn();
    const hb = createHeartbeat({
      buildHeartbeat: mockHeartbeatEvent,
      sendEvent,
      intervalMs: 10_000,
    });

    hb.start();
    hb.start(); // second start should be no-op
    expect(sendEvent).toHaveBeenCalledTimes(1); // only one immediate beat

    vi.advanceTimersByTime(10_000);
    expect(sendEvent).toHaveBeenCalledTimes(2); // only one interval

    hb.stop();
  });
});
