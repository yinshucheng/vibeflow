import { describe, it, expect, vi, beforeEach } from 'vitest';
import { timeSliceService } from './time-slice.service';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    taskTimeSlice: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pomodoro: {
      update: vi.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';

const mockPrisma = prisma as unknown as {
  taskTimeSlice: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  pomodoro: {
    update: ReturnType<typeof vi.fn>;
  };
};

describe('TimeSliceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startSlice', () => {
    it('should create new slice when no recent slice exists', async () => {
      mockPrisma.taskTimeSlice.findFirst.mockResolvedValue(null);
      mockPrisma.taskTimeSlice.create.mockResolvedValue({
        id: 'slice-1',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
        startTime: new Date(),
      });

      const result = await timeSliceService.startSlice('pomo-1', 'task-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.taskTimeSlice.create).toHaveBeenCalledWith({
        data: { pomodoroId: 'pomo-1', taskId: 'task-1' },
      });
    });

    it('should merge with recent slice if within 60s threshold', async () => {
      const recentEndTime = new Date(Date.now() - 30000); // 30s ago
      mockPrisma.taskTimeSlice.findFirst.mockResolvedValue({
        id: 'slice-old',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
        endTime: recentEndTime,
      });
      mockPrisma.taskTimeSlice.update.mockResolvedValue({
        id: 'slice-old',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
        endTime: null,
        durationSeconds: 0,
      });

      const result = await timeSliceService.startSlice('pomo-1', 'task-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.taskTimeSlice.update).toHaveBeenCalledWith({
        where: { id: 'slice-old' },
        data: { endTime: null, durationSeconds: 0 },
      });
      expect(mockPrisma.taskTimeSlice.create).not.toHaveBeenCalled();
    });

    it('should create new slice if recent slice is beyond 60s threshold', async () => {
      const oldEndTime = new Date(Date.now() - 90000); // 90s ago
      mockPrisma.taskTimeSlice.findFirst.mockResolvedValue({
        id: 'slice-old',
        endTime: oldEndTime,
      });
      mockPrisma.taskTimeSlice.create.mockResolvedValue({
        id: 'slice-new',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
      });

      const result = await timeSliceService.startSlice('pomo-1', 'task-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.taskTimeSlice.create).toHaveBeenCalled();
    });

    it('should create taskless slice when taskId is null', async () => {
      mockPrisma.taskTimeSlice.create.mockResolvedValue({
        id: 'slice-1',
        pomodoroId: 'pomo-1',
        taskId: null,
      });

      const result = await timeSliceService.startSlice('pomo-1', null);

      expect(result.success).toBe(true);
      expect(mockPrisma.taskTimeSlice.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.taskTimeSlice.create).toHaveBeenCalledWith({
        data: { pomodoroId: 'pomo-1', taskId: null },
      });
    });
  });

  describe('endSlice', () => {
    it('should mark slice as fragment if duration < 30s', async () => {
      const startTime = new Date(Date.now() - 20000); // 20s ago
      mockPrisma.taskTimeSlice.findUnique.mockResolvedValue({
        id: 'slice-1',
        startTime,
        endTime: null,
      });
      mockPrisma.taskTimeSlice.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'slice-1', ...data })
      );

      const result = await timeSliceService.endSlice('slice-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.taskTimeSlice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'slice-1' },
          data: expect.objectContaining({ isFragment: true }),
        })
      );
    });

    it('should not mark as fragment if duration >= 30s', async () => {
      const startTime = new Date(Date.now() - 60000); // 60s ago
      mockPrisma.taskTimeSlice.findUnique.mockResolvedValue({
        id: 'slice-1',
        startTime,
        endTime: null,
      });
      mockPrisma.taskTimeSlice.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'slice-1', ...data })
      );

      const result = await timeSliceService.endSlice('slice-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.taskTimeSlice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isFragment: false }),
        })
      );
    });

    it('should return error if slice not found', async () => {
      mockPrisma.taskTimeSlice.findUnique.mockResolvedValue(null);

      const result = await timeSliceService.endSlice('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should return error if slice already ended', async () => {
      mockPrisma.taskTimeSlice.findUnique.mockResolvedValue({
        id: 'slice-1',
        endTime: new Date(),
      });

      const result = await timeSliceService.endSlice('slice-1');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONFLICT');
    });
  });

  describe('switchTask', () => {
    it('should end current slice and start new one', async () => {
      const startTime = new Date(Date.now() - 60000);
      mockPrisma.taskTimeSlice.findUnique.mockResolvedValue({
        id: 'slice-1',
        startTime,
        endTime: null,
      });
      mockPrisma.taskTimeSlice.update.mockResolvedValue({ id: 'slice-1' });
      mockPrisma.pomodoro.update.mockResolvedValue({ id: 'pomo-1' });
      mockPrisma.taskTimeSlice.findFirst.mockResolvedValue(null);
      mockPrisma.taskTimeSlice.create.mockResolvedValue({
        id: 'slice-2',
        pomodoroId: 'pomo-1',
        taskId: 'task-2',
      });

      const result = await timeSliceService.switchTask('pomo-1', 'slice-1', 'task-2');

      expect(result.success).toBe(true);
      expect(mockPrisma.pomodoro.update).toHaveBeenCalledWith({
        where: { id: 'pomo-1' },
        data: { taskSwitchCount: { increment: 1 } },
      });
    });

    it('should increment switch count even without current slice', async () => {
      mockPrisma.pomodoro.update.mockResolvedValue({ id: 'pomo-1' });
      mockPrisma.taskTimeSlice.findFirst.mockResolvedValue(null);
      mockPrisma.taskTimeSlice.create.mockResolvedValue({
        id: 'slice-1',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
      });

      const result = await timeSliceService.switchTask('pomo-1', null, 'task-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.pomodoro.update).toHaveBeenCalled();
    });
  });
});
