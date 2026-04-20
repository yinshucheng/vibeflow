import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createActionRPC } from '../src/protocol/action-rpc';

describe('createActionRPC', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends event with optimisticId and returns promise', async () => {
    const sendEvent = vi.fn();
    const rpc = createActionRPC({ sendEvent, timeout: 5000 });

    const promise = rpc.send('TASK_COMPLETE', { taskId: 't1' });

    expect(sendEvent).toHaveBeenCalledTimes(1);
    const sentEvent = sendEvent.mock.calls[0][0];
    expect(sentEvent.eventType).toBe('USER_ACTION');
    expect(sentEvent.payload.actionType).toBe('TASK_COMPLETE');
    expect(sentEvent.payload.data.taskId).toBe('t1');
    expect(sentEvent.payload.optimisticId).toBeTruthy();

    // Resolve with ACTION_RESULT
    rpc.handleResult({
      optimisticId: sentEvent.payload.optimisticId,
      success: true,
      data: { completed: true },
    });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.data?.completed).toBe(true);
  });

  it('rejects on timeout', async () => {
    const sendEvent = vi.fn();
    const rpc = createActionRPC({ sendEvent, timeout: 5000 });

    const promise = rpc.send('TASK_CREATE', { title: 'new task' });

    vi.advanceTimersByTime(5001);

    await expect(promise).rejects.toThrow('timed out');
    expect(rpc.pendingCount).toBe(0);
  });

  it('uses default 10s timeout', async () => {
    const sendEvent = vi.fn();
    const rpc = createActionRPC({ sendEvent });

    const promise = rpc.send('TASK_CREATE', { title: 'new task' });

    vi.advanceTimersByTime(9999);
    // Not yet timed out
    expect(rpc.pendingCount).toBe(1);

    vi.advanceTimersByTime(2);
    await expect(promise).rejects.toThrow('timed out');
  });

  it('clearAll rejects all pending actions', async () => {
    const sendEvent = vi.fn();
    const rpc = createActionRPC({ sendEvent, timeout: 10000 });

    const p1 = rpc.send('TASK_COMPLETE', { taskId: 't1' });
    const p2 = rpc.send('TASK_CREATE', { title: 'new' });

    expect(rpc.pendingCount).toBe(2);

    rpc.clearAll();

    await expect(p1).rejects.toThrow('Connection lost');
    await expect(p2).rejects.toThrow('Connection lost');
    expect(rpc.pendingCount).toBe(0);
  });

  it('ignores ACTION_RESULT for unknown optimisticId', () => {
    const sendEvent = vi.fn();
    const rpc = createActionRPC({ sendEvent });

    // Should not throw
    expect(() => {
      rpc.handleResult({ optimisticId: 'unknown-id', success: true });
    }).not.toThrow();
  });

  it('clears timeout on successful result', async () => {
    const sendEvent = vi.fn();
    const rpc = createActionRPC({ sendEvent, timeout: 5000 });

    const promise = rpc.send('TASK_COMPLETE', { taskId: 't1' });
    const optimisticId = sendEvent.mock.calls[0][0].payload.optimisticId;

    rpc.handleResult({ optimisticId, success: true });

    const result = await promise;
    expect(result.success).toBe(true);

    // Advancing time should not cause issues — timer was cleared
    vi.advanceTimersByTime(10000);
    expect(rpc.pendingCount).toBe(0);
  });

  it('handles error result', async () => {
    const sendEvent = vi.fn();
    const rpc = createActionRPC({ sendEvent });

    const promise = rpc.send('TASK_CREATE', { title: 'test' });
    const optimisticId = sendEvent.mock.calls[0][0].payload.optimisticId;

    rpc.handleResult({
      optimisticId,
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Title too long' },
    });

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
