import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== Prisma mock =====

const mockPrisma = vi.hoisted(() => ({
  habit: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
  },
  habitEntry: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ===== Imports =====

import { habitService } from './habit.service';
import type { Habit, HabitEntry } from '@prisma/client';

// ===== Constants =====

// Valid UUIDs (RecordEntrySchema requires UUID format for habitId)
const H1 = '00000000-0000-4000-8000-000000000001';
const H2 = '00000000-0000-4000-8000-000000000002';
const H_OTHER = '00000000-0000-4000-8000-000000000099';
const UID = '00000000-0000-4000-8000-000000000010';
const E1 = '00000000-0000-4000-8000-000000000101';
const E2 = '00000000-0000-4000-8000-000000000102';
const E3 = '00000000-0000-4000-8000-000000000103';

// ===== Helpers =====

function d(dateStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function fakeHabit(overrides: Partial<Habit> = {}): Habit {
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
  } as Habit;
}

function fakeEntry(overrides: Partial<HabitEntry> = {}): HabitEntry {
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
  } as HabitEntry;
}

// ===== Tests =====

describe('HabitService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 10, 10, 0, 0)); // 2025-03-10 10:00
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('should create a habit with correct defaults', async () => {
      const created = fakeHabit();
      mockPrisma.habit.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.habit.create.mockResolvedValue(created);

      const result = await habitService.create(UID, {
        title: '冥想',
        type: 'BOOLEAN',
        freqNum: 1,
        freqDen: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(created);
      expect(mockPrisma.habit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: UID,
          title: '冥想',
          type: 'BOOLEAN',
          sortOrder: 3,
        }),
      });
    });

    it('should return VALIDATION_ERROR for empty title', async () => {
      const result = await habitService.create(UID, { title: '' } as any);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('update', () => {
    it('should update a habit after ownership check', async () => {
      const updated = fakeHabit({ title: '冥想 10 分钟' });
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      mockPrisma.habit.update.mockResolvedValue(updated);

      const result = await habitService.update(UID, H1, { title: '冥想 10 分钟' });

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('冥想 10 分钟');
    });

    it('should return NOT_FOUND if habit does not belong to user', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(null);
      const result = await habitService.update(UID, H_OTHER, { title: 'test' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('updateStatus', () => {
    it('should update habit status', async () => {
      const paused = fakeHabit({ status: 'PAUSED' });
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      mockPrisma.habit.update.mockResolvedValue(paused);

      const result = await habitService.updateStatus(UID, H1, 'PAUSED');
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('PAUSED');
    });
  });

  describe('delete', () => {
    it('should delete a habit after ownership check', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      mockPrisma.habit.delete.mockResolvedValue(fakeHabit());

      const result = await habitService.delete(UID, H1);
      expect(result.success).toBe(true);
      expect(mockPrisma.habit.delete).toHaveBeenCalledWith({ where: { id: H1 } });
    });

    it('should return NOT_FOUND if habit does not belong to user', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(null);
      const result = await habitService.delete(UID, H_OTHER);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('listByUser', () => {
    it('should list habits ordered by sortOrder', async () => {
      const habits = [
        fakeHabit({ id: H1, sortOrder: 1 }),
        fakeHabit({ id: H2, sortOrder: 2 }),
      ];
      mockPrisma.habit.findMany.mockResolvedValue(habits);

      const result = await habitService.listByUser(UID);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should filter by status when provided', async () => {
      mockPrisma.habit.findMany.mockResolvedValue([]);
      await habitService.listByUser(UID, { status: 'PAUSED' });
      expect(mockPrisma.habit.findMany).toHaveBeenCalledWith({
        where: { userId: UID, status: 'PAUSED' },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('getById', () => {
    it('should return habit if found and owned by user', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      const result = await habitService.getById(UID, H1);
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(H1);
    });

    it('should return NOT_FOUND if not found', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(null);
      const result = await habitService.getById(UID, H_OTHER);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('recordEntry', () => {
    it('should create entry for BOOLEAN habit with value=1', async () => {
      const habit = fakeHabit({ type: 'BOOLEAN' });
      const entry = fakeEntry();
      mockPrisma.habit.findFirst.mockResolvedValue(habit);
      mockPrisma.habitEntry.upsert.mockResolvedValue(entry);

      const result = await habitService.recordEntry(UID, H1, '2025-03-10', 1);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(entry);
      expect(mockPrisma.habitEntry.upsert).toHaveBeenCalledWith({
        where: { habitId_date: { habitId: H1, date: d('2025-03-10') } },
        create: expect.objectContaining({
          habitId: H1,
          userId: UID,
          value: 1,
          entryType: 'YES_MANUAL',
        }),
        update: expect.objectContaining({ value: 1, entryType: 'YES_MANUAL' }),
      });
    });

    it('should reject BOOLEAN habit with value != 1', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit({ type: 'BOOLEAN' }));

      const result = await habitService.recordEntry(UID, H1, '2025-03-10', 5);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('BOOLEAN');
    });

    it('should reject MEASURABLE habit with value <= 0', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit({ type: 'MEASURABLE' }));

      const result = await habitService.recordEntry(UID, H1, '2025-03-10', 0);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject future dates', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());

      const result = await habitService.recordEntry(UID, H1, '2025-03-11', 1);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('future');
    });

    it('should reject dates more than 7 days ago', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());

      const result = await habitService.recordEntry(UID, H1, '2025-03-02', 1);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('7 days');
    });

    it('should accept a date exactly 7 days ago', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      mockPrisma.habitEntry.upsert.mockResolvedValue(fakeEntry({ date: d('2025-03-03') }));

      const result = await habitService.recordEntry(UID, H1, '2025-03-03', 1);

      expect(result.success).toBe(true);
    });
  });

  describe('skipEntry', () => {
    it('should upsert entry with entryType=SKIP', async () => {
      const entry = fakeEntry({ entryType: 'SKIP', value: 0 });
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      mockPrisma.habitEntry.upsert.mockResolvedValue(entry);

      const result = await habitService.skipEntry(UID, H1, '2025-03-10');

      expect(result.success).toBe(true);
      expect(result.data?.entryType).toBe('SKIP');
      expect(mockPrisma.habitEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ entryType: 'SKIP', value: 0 }),
          update: expect.objectContaining({ entryType: 'SKIP', value: 0 }),
        }),
      );
    });

    it('should return NOT_FOUND if habit does not belong to user', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(null);
      const result = await habitService.skipEntry(UID, H_OTHER, '2025-03-10');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('deleteEntry', () => {
    it('should delete an existing entry', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      mockPrisma.habitEntry.findUnique.mockResolvedValue(fakeEntry());
      mockPrisma.habitEntry.delete.mockResolvedValue(fakeEntry());

      const result = await habitService.deleteEntry(UID, H1, '2025-03-10');

      expect(result.success).toBe(true);
      expect(mockPrisma.habitEntry.delete).toHaveBeenCalledWith({ where: { id: E1 } });
    });

    it('should return NOT_FOUND if entry does not exist', async () => {
      mockPrisma.habit.findFirst.mockResolvedValue(fakeHabit());
      mockPrisma.habitEntry.findUnique.mockResolvedValue(null);

      const result = await habitService.deleteEntry(UID, H1, '2025-03-10');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('getTodayHabits', () => {
    it('should return empty array when no active habits', async () => {
      mockPrisma.habit.findMany.mockResolvedValue([]);
      const result = await habitService.getTodayHabits(UID);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return due habits with today entry and streak', async () => {
      const habit = fakeHabit({ freqNum: 1, freqDen: 1 });
      mockPrisma.habit.findMany.mockResolvedValue([habit]);
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([]) // today entries
        .mockResolvedValueOnce([]) // recent entries
        .mockResolvedValueOnce([]); // all entries for streak

      const result = await habitService.getTodayHabits(UID);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].isDue).toBe(true);
      expect(result.data![0].todayEntry).toBeNull();
      expect(result.data![0].streak).toEqual({ current: 0, best: 0 });
    });

    it('should include streak info when entries exist', async () => {
      const habit = fakeHabit({ freqNum: 1, freqDen: 1 });
      const todayEntry = fakeEntry({ date: d('2025-03-10') });
      const entries = [
        fakeEntry({ id: E1, date: d('2025-03-10') }),
        fakeEntry({ id: E2, date: d('2025-03-09') }),
        fakeEntry({ id: E3, date: d('2025-03-08') }),
      ];

      mockPrisma.habit.findMany.mockResolvedValue([habit]);
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([todayEntry]) // today entries
        .mockResolvedValueOnce(entries) // recent entries
        .mockResolvedValueOnce(entries); // all entries

      const result = await habitService.getTodayHabits(UID);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].todayEntry).toEqual(todayEntry);
      expect(result.data![0].streak.current).toBe(3);
    });

    it('should exclude habits that are not due today (weekly, quota met)', async () => {
      const habit = fakeHabit({ freqNum: 3, freqDen: 7 });

      // Set today to Wednesday 2025-03-12 so we can have Mon/Tue/Wed entries
      vi.setSystemTime(new Date(2025, 2, 12, 10, 0, 0));

      const weekEntries = [
        fakeEntry({ id: E1, date: d('2025-03-10') }), // Mon
        fakeEntry({ id: E2, date: d('2025-03-11') }), // Tue
        fakeEntry({ id: E3, date: d('2025-03-12') }), // Wed
      ];

      mockPrisma.habit.findMany.mockResolvedValue([habit]);
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce(weekEntries) // today entries
        .mockResolvedValueOnce(weekEntries) // recent entries
        .mockResolvedValueOnce(weekEntries); // all entries

      const result = await habitService.getTodayHabits(UID);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0); // 3/7 quota met → not due
    });
  });

  describe('happy path: create → list → recordEntry → getTodayHabits → skipEntry → delete', () => {
    it('should work end to end', async () => {
      const habit = fakeHabit({ title: '运动' });
      const entry = fakeEntry();
      const skipData = fakeEntry({ entryType: 'SKIP', value: 0 });

      // 1. Create
      mockPrisma.habit.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.habit.create.mockResolvedValue(habit);
      const createResult = await habitService.create(UID, { title: '运动' });
      expect(createResult.success).toBe(true);

      // 2. List
      mockPrisma.habit.findMany.mockResolvedValue([habit]);
      const listResult = await habitService.listByUser(UID);
      expect(listResult.success).toBe(true);
      expect(listResult.data).toHaveLength(1);

      // 3. Record entry
      mockPrisma.habit.findFirst.mockResolvedValue(habit);
      mockPrisma.habitEntry.upsert.mockResolvedValue(entry);
      const recordResult = await habitService.recordEntry(UID, H1, '2025-03-10', 1);
      expect(recordResult.success).toBe(true);

      // 4. getTodayHabits
      mockPrisma.habit.findMany.mockResolvedValue([habit]);
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([entry])
        .mockResolvedValueOnce([entry])
        .mockResolvedValueOnce([entry]);
      const todayResult = await habitService.getTodayHabits(UID);
      expect(todayResult.success).toBe(true);
      expect(todayResult.data![0].todayEntry).toEqual(entry);

      // 5. Skip entry
      mockPrisma.habit.findFirst.mockResolvedValue(habit);
      mockPrisma.habitEntry.upsert.mockResolvedValue(skipData);
      const skipResult = await habitService.skipEntry(UID, H1, '2025-03-10');
      expect(skipResult.success).toBe(true);
      expect(skipResult.data?.entryType).toBe('SKIP');

      // 6. Delete
      mockPrisma.habit.findFirst.mockResolvedValue(habit);
      mockPrisma.habit.delete.mockResolvedValue(habit);
      const deleteResult = await habitService.delete(UID, H1);
      expect(deleteResult.success).toBe(true);
    });
  });

  describe('integration: create → recordEntry → getTodayHabits(completed) → deleteEntry → getTodayHabits(not completed)', () => {
    it('should reflect completion state changes in getTodayHabits', async () => {
      const habit = fakeHabit({ freqNum: 1, freqDen: 1 });
      const entry = fakeEntry({ date: d('2025-03-10'), value: 1, entryType: 'YES_MANUAL' });

      // 1. Create habit
      mockPrisma.habit.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      mockPrisma.habit.create.mockResolvedValue(habit);
      const createResult = await habitService.create(UID, { title: '冥想' });
      expect(createResult.success).toBe(true);

      // 2. Record entry for today
      mockPrisma.habit.findFirst.mockResolvedValue(habit);
      mockPrisma.habitEntry.upsert.mockResolvedValue(entry);
      const recordResult = await habitService.recordEntry(UID, H1, '2025-03-10', 1);
      expect(recordResult.success).toBe(true);
      expect(recordResult.data?.entryType).toBe('YES_MANUAL');

      // 3. getTodayHabits — should show completed (todayEntry present)
      mockPrisma.habit.findMany.mockResolvedValue([habit]);
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([entry])  // today entries → has entry
        .mockResolvedValueOnce([entry])  // recent entries
        .mockResolvedValueOnce([entry]); // all entries for streak
      const todayCompleted = await habitService.getTodayHabits(UID);
      expect(todayCompleted.success).toBe(true);
      expect(todayCompleted.data).toHaveLength(1);
      expect(todayCompleted.data![0].todayEntry).toEqual(entry);
      expect(todayCompleted.data![0].todayEntry?.entryType).toBe('YES_MANUAL');

      // 4. Delete the entry
      mockPrisma.habit.findFirst.mockResolvedValue(habit);
      mockPrisma.habitEntry.findUnique.mockResolvedValue(entry);
      mockPrisma.habitEntry.delete.mockResolvedValue(entry);
      const deleteEntryResult = await habitService.deleteEntry(UID, H1, '2025-03-10');
      expect(deleteEntryResult.success).toBe(true);

      // 5. getTodayHabits — should show not completed (todayEntry null)
      mockPrisma.habit.findMany.mockResolvedValue([habit]);
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([])  // today entries → no entry
        .mockResolvedValueOnce([])  // recent entries
        .mockResolvedValueOnce([]); // all entries for streak
      const todayNotCompleted = await habitService.getTodayHabits(UID);
      expect(todayNotCompleted.success).toBe(true);
      expect(todayNotCompleted.data).toHaveLength(1);
      expect(todayNotCompleted.data![0].todayEntry).toBeNull();
      expect(todayNotCompleted.data![0].streak).toEqual({ current: 0, best: 0 });
    });
  });
});
