/**
 * DailyState Service — Unit Tests
 *
 * Focused tests for getOrCreateToday() initial state behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock prisma ────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  dailyState: { upsert: vi.fn() },
  userSettings: { findUnique: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ── Import after mocks ────────────────────────────────────────────────

import { dailyStateService } from './daily-state.service';

// ── Tests ─────────────────────────────────────────────────────────────

describe('dailyStateService.getOrCreateToday', () => {
  const TEST_USER_ID = 'test-user-getorcreate';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new daily state with IDLE as initial systemState', async () => {
    const fakeDailyState = {
      id: 'ds-new',
      userId: TEST_USER_ID,
      systemState: 'IDLE',
      pomodoroCount: 0,
    };
    mockPrisma.dailyState.upsert.mockResolvedValue(fakeDailyState);

    const result = await dailyStateService.getOrCreateToday(TEST_USER_ID);

    expect(result.success).toBe(true);
    expect(result.data!.systemState).toBe('IDLE');

    // Verify the upsert create payload uses 'IDLE'
    expect(mockPrisma.dailyState.upsert).toHaveBeenCalledOnce();
    const call = mockPrisma.dailyState.upsert.mock.calls[0][0];
    expect(call.create.systemState).toBe('IDLE');
  });

  it('should not query airlockMode from userSettings', async () => {
    mockPrisma.dailyState.upsert.mockResolvedValue({
      id: 'ds-new',
      userId: TEST_USER_ID,
      systemState: 'IDLE',
      pomodoroCount: 0,
    });

    await dailyStateService.getOrCreateToday(TEST_USER_ID);

    // airlockMode lookup should NOT happen — no userSettings query
    expect(mockPrisma.userSettings.findUnique).not.toHaveBeenCalled();
  });

  it('should return existing daily state as-is (no update)', async () => {
    const existingState = {
      id: 'ds-existing',
      userId: TEST_USER_ID,
      systemState: 'FOCUS',
      pomodoroCount: 3,
    };
    mockPrisma.dailyState.upsert.mockResolvedValue(existingState);

    const result = await dailyStateService.getOrCreateToday(TEST_USER_ID);

    expect(result.success).toBe(true);
    // Existing state preserved, not overwritten
    expect(result.data!.systemState).toBe('FOCUS');

    // Verify update is empty (no-op for existing records)
    const call = mockPrisma.dailyState.upsert.mock.calls[0][0];
    expect(call.update).toEqual({});
  });

  it('should return error on prisma failure', async () => {
    mockPrisma.dailyState.upsert.mockRejectedValue(new Error('DB connection failed'));

    const result = await dailyStateService.getOrCreateToday(TEST_USER_ID);

    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('INTERNAL_ERROR');
    expect(result.error!.message).toContain('DB connection failed');
  });
});
