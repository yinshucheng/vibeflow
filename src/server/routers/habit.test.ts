import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// ===== Mocks =====

vi.mock('@/lib/prisma', () => ({ default: {} }));

vi.mock('@/server/socket', () => ({
  socketServer: { broadcastHabitUpdate: vi.fn() },
}));

vi.mock('@/services/habit.service', () => ({
  habitService: {
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    listByUser: vi.fn(),
    getTodayHabits: vi.fn(),
    recordEntry: vi.fn(),
    skipEntry: vi.fn(),
    deleteEntry: vi.fn(),
    getById: vi.fn(),
  },
  CreateHabitSchema: z.object({
    title: z.string().min(1).max(100),
    type: z.enum(['BOOLEAN', 'MEASURABLE', 'TIMED']).default('BOOLEAN'),
    freqNum: z.number().int().min(1).max(31).default(1),
    freqDen: z.number().int().min(1).max(31).default(1),
    description: z.string().max(500).optional(),
    question: z.string().max(200).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    reminderEnabled: z.boolean().optional(),
    reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }),
  UpdateHabitSchema: z.object({
    title: z.string().min(1).max(100).optional(),
    type: z.enum(['BOOLEAN', 'MEASURABLE', 'TIMED']).optional(),
    freqNum: z.number().int().min(1).max(31).optional(),
    freqDen: z.number().int().min(1).max(31).optional(),
    description: z.string().max(500).optional().nullable(),
    question: z.string().max(200).optional().nullable(),
    targetValue: z.number().positive().optional().nullable(),
    targetUnit: z.string().max(20).optional().nullable(),
    icon: z.string().optional().nullable(),
    color: z.string().optional().nullable(),
    reminderEnabled: z.boolean().optional(),
    reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  }),
  RecordEntrySchema: z.object({
    habitId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    value: z.number().min(0),
    note: z.string().max(200).optional(),
  }),
}));

// ===== Imports =====

import { habitRouter } from './habit';
import { habitService } from '@/services/habit.service';

// ===== Typed mocks =====

const mockService = habitService as unknown as {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  listByUser: ReturnType<typeof vi.fn>;
  getTodayHabits: ReturnType<typeof vi.fn>;
  recordEntry: ReturnType<typeof vi.fn>;
  skipEntry: ReturnType<typeof vi.fn>;
  deleteEntry: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
};

// ===== Constants =====

const UID = 'test-user';
const H1 = '00000000-0000-4000-8000-000000000001';
const E1 = '00000000-0000-4000-8000-000000000101';

// ===== Helpers =====

function createCaller() {
  const ctx = { user: { userId: UID } };
  return habitRouter.createCaller(ctx as never);
}

function d(dateStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function fakeHabit(overrides: Record<string, unknown> = {}) {
  return {
    id: H1,
    userId: UID,
    title: '冥想',
    description: null,
    question: null,
    type: 'BOOLEAN',
    targetValue: null,
    targetUnit: null,
    freqNum: 1,
    freqDen: 1,
    projectId: null,
    icon: null,
    color: null,
    sortOrder: 1,
    status: 'ACTIVE',
    reminderEnabled: false,
    reminderTime: null,
    createdAt: d('2025-01-01'),
    updatedAt: d('2025-03-10'),
    ...overrides,
  };
}

function fakeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: E1,
    habitId: H1,
    userId: UID,
    date: d('2025-03-10'),
    value: 1,
    entryType: 'YES_MANUAL',
    note: null,
    pomodoroIds: [],
    createdAt: d('2025-03-10'),
    updatedAt: d('2025-03-10'),
    ...overrides,
  };
}

function fakeTodayHabit(overrides: Record<string, unknown> = {}) {
  return {
    ...fakeHabit(),
    todayEntry: null,
    streak: { current: 0, best: 0 },
    isDue: true,
    ...overrides,
  };
}

// ===== Tests =====

describe('habitRouter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 10, 10, 0, 0)); // 2025-03-10 10:00
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('should create a habit and return data', async () => {
      const habit = fakeHabit();
      mockService.create.mockResolvedValue({ success: true, data: habit });

      const caller = createCaller();
      const result = await caller.create({ title: '冥想' });

      expect(result).toEqual(habit);
      expect(mockService.create).toHaveBeenCalledWith(UID, expect.objectContaining({ title: '冥想' }));
    });

    it('should throw on service validation error', async () => {
      mockService.create.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid habit data' },
      });

      const caller = createCaller();
      await expect(caller.create({ title: '冥想' })).rejects.toThrow('Invalid habit data');
    });
  });

  describe('list', () => {
    it('should return habits for user', async () => {
      const habits = [fakeHabit(), fakeHabit({ id: '00000000-0000-4000-8000-000000000002', title: '运动' })];
      mockService.listByUser.mockResolvedValue({ success: true, data: habits });

      const caller = createCaller();
      const result = await caller.list();

      expect(result).toEqual(habits);
      expect(mockService.listByUser).toHaveBeenCalledWith(UID, undefined);
    });

    it('should filter by status when provided', async () => {
      mockService.listByUser.mockResolvedValue({ success: true, data: [] });

      const caller = createCaller();
      const result = await caller.list({ status: 'PAUSED' });

      expect(result).toEqual([]);
      expect(mockService.listByUser).toHaveBeenCalledWith(UID, { status: 'PAUSED' });
    });
  });

  describe('getToday', () => {
    it('should return today habits with streak and entry info', async () => {
      const todayHabits = [
        fakeTodayHabit({ title: '冥想', streak: { current: 5, best: 10 } }),
      ];
      mockService.getTodayHabits.mockResolvedValue({ success: true, data: todayHabits });

      const caller = createCaller();
      const result = await caller.getToday();

      expect(result).toEqual(todayHabits);
      expect(mockService.getTodayHabits).toHaveBeenCalledWith(UID);
    });

    it('should return empty array when no habits due today', async () => {
      mockService.getTodayHabits.mockResolvedValue({ success: true, data: [] });

      const caller = createCaller();
      const result = await caller.getToday();

      expect(result).toEqual([]);
    });
  });

  describe('recordEntry', () => {
    it('should record entry and return data', async () => {
      const entry = fakeEntry();
      mockService.recordEntry.mockResolvedValue({ success: true, data: entry });

      const caller = createCaller();
      const result = await caller.recordEntry({
        habitId: H1,
        date: '2025-03-10',
        value: 1,
      });

      expect(result).toEqual(entry);
      expect(mockService.recordEntry).toHaveBeenCalledWith(UID, H1, '2025-03-10', 1, undefined);
    });

    it('should throw on NOT_FOUND error', async () => {
      mockService.recordEntry.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Habit not found' },
      });

      const caller = createCaller();
      await expect(
        caller.recordEntry({ habitId: H1, date: '2025-03-10', value: 1 })
      ).rejects.toThrow('Habit not found');
    });

    it('should throw on VALIDATION_ERROR', async () => {
      mockService.recordEntry.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'BOOLEAN habit value must be 1' },
      });

      const caller = createCaller();
      await expect(
        caller.recordEntry({ habitId: H1, date: '2025-03-10', value: 5 })
      ).rejects.toThrow('BOOLEAN habit value must be 1');
    });
  });

  describe('integration: create → list → getToday → recordEntry', () => {
    it('should work through the full flow via tRPC caller', async () => {
      const habit = fakeHabit();
      const entry = fakeEntry();

      // 1. Create
      mockService.create.mockResolvedValue({ success: true, data: habit });
      const caller = createCaller();
      const created = await caller.create({ title: '冥想' });
      expect(created.id).toBe(H1);

      // 2. List
      mockService.listByUser.mockResolvedValue({ success: true, data: [habit] });
      const habits = await caller.list();
      expect(habits).toHaveLength(1);
      expect(habits![0].title).toBe('冥想');

      // 3. getToday
      const todayHabit = fakeTodayHabit();
      mockService.getTodayHabits.mockResolvedValue({ success: true, data: [todayHabit] });
      const todayHabits = await caller.getToday();
      expect(todayHabits).toHaveLength(1);
      expect(todayHabits![0].todayEntry).toBeNull();
      expect(todayHabits![0].isDue).toBe(true);

      // 4. recordEntry
      mockService.recordEntry.mockResolvedValue({ success: true, data: entry });
      const recorded = await caller.recordEntry({
        habitId: H1,
        date: '2025-03-10',
        value: 1,
      });
      expect(recorded.entryType).toBe('YES_MANUAL');
      expect(recorded.value).toBe(1);

      // 5. getToday — now with entry
      const todayHabitCompleted = fakeTodayHabit({ todayEntry: entry });
      mockService.getTodayHabits.mockResolvedValue({ success: true, data: [todayHabitCompleted] });
      const todayAfter = await caller.getToday();
      expect(todayAfter).toHaveLength(1);
      expect(todayAfter![0].todayEntry).toEqual(entry);
    });
  });

  describe('deleteEntry', () => {
    it('should delete entry and return success', async () => {
      mockService.deleteEntry.mockResolvedValue({ success: true });

      const caller = createCaller();
      const result = await caller.deleteEntry({ habitId: H1, date: '2025-03-10' });

      expect(result).toEqual({ success: true });
      expect(mockService.deleteEntry).toHaveBeenCalledWith(UID, H1, '2025-03-10');
    });

    it('should throw on NOT_FOUND', async () => {
      mockService.deleteEntry.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Entry not found' },
      });

      const caller = createCaller();
      await expect(
        caller.deleteEntry({ habitId: H1, date: '2025-03-10' })
      ).rejects.toThrow('Entry not found');
    });
  });

  describe('skipEntry', () => {
    it('should skip entry and return data', async () => {
      const entry = fakeEntry({ entryType: 'SKIP', value: 0 });
      mockService.skipEntry.mockResolvedValue({ success: true, data: entry });

      const caller = createCaller();
      const result = await caller.skipEntry({ habitId: H1, date: '2025-03-10' });

      expect(result.entryType).toBe('SKIP');
      expect(mockService.skipEntry).toHaveBeenCalledWith(UID, H1, '2025-03-10');
    });
  });

  describe('delete', () => {
    it('should delete habit and return success', async () => {
      mockService.delete.mockResolvedValue({ success: true });

      const caller = createCaller();
      const result = await caller.delete({ id: H1 });

      expect(result).toEqual({ success: true });
      expect(mockService.delete).toHaveBeenCalledWith(UID, H1);
    });
  });

  describe('update', () => {
    it('should update habit and return data', async () => {
      const updated = fakeHabit({ title: '冥想 10 分钟' });
      mockService.update.mockResolvedValue({ success: true, data: updated });

      const caller = createCaller();
      const result = await caller.update({ id: H1, data: { title: '冥想 10 分钟' } });

      expect(result.title).toBe('冥想 10 分钟');
      expect(mockService.update).toHaveBeenCalledWith(UID, H1, { title: '冥想 10 分钟' });
    });
  });

  describe('updateStatus', () => {
    it('should update status and return data', async () => {
      const paused = fakeHabit({ status: 'PAUSED' });
      mockService.updateStatus.mockResolvedValue({ success: true, data: paused });

      const caller = createCaller();
      const result = await caller.updateStatus({ id: H1, status: 'PAUSED' });

      expect(result.status).toBe('PAUSED');
      expect(mockService.updateStatus).toHaveBeenCalledWith(UID, H1, 'PAUSED');
    });
  });
});
