import { describe, it, expect, vi, beforeEach } from 'vitest';
import { timeSliceRouter } from './time-slice';
import { timeSliceService } from '@/services/time-slice.service';

vi.mock('@/services/time-slice.service', () => ({
  timeSliceService: {
    switchTask: vi.fn(),
    getByPomodoro: vi.fn(),
    updateSlice: vi.fn(),
  },
}));

const mockService = timeSliceService as {
  switchTask: ReturnType<typeof vi.fn>;
  getByPomodoro: ReturnType<typeof vi.fn>;
  updateSlice: ReturnType<typeof vi.fn>;
};

// Create a mock caller
const createCaller = () => {
  const ctx = { user: { userId: 'test-user' } };
  return timeSliceRouter.createCaller(ctx as never);
};

describe('timeSliceRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('switch', () => {
    it('should call switchTask and return new slice', async () => {
      mockService.switchTask.mockResolvedValue({
        success: true,
        data: { id: 'slice-2', pomodoroId: 'pomo-1', taskId: 'task-2' },
      });

      const caller = createCaller();
      const result = await caller.switch({
        pomodoroId: '00000000-0000-0000-0000-000000000001',
        currentSliceId: '00000000-0000-0000-0000-000000000002',
        newTaskId: '00000000-0000-0000-0000-000000000003',
      });

      expect(result).toEqual({ id: 'slice-2', pomodoroId: 'pomo-1', taskId: 'task-2' });
    });

    it('should throw on service error', async () => {
      mockService.switchTask.mockResolvedValue({
        success: false,
        error: { message: 'Switch failed' },
      });

      const caller = createCaller();
      await expect(
        caller.switch({
          pomodoroId: '00000000-0000-0000-0000-000000000001',
          currentSliceId: null,
          newTaskId: '00000000-0000-0000-0000-000000000003',
        })
      ).rejects.toThrow('Switch failed');
    });
  });

  describe('getByPomodoro', () => {
    it('should return time slices for pomodoro', async () => {
      const slices = [
        { id: 'slice-1', taskId: 'task-1', durationSeconds: 600 },
        { id: 'slice-2', taskId: 'task-2', durationSeconds: 300 },
      ];
      mockService.getByPomodoro.mockResolvedValue({ success: true, data: slices });

      const caller = createCaller();
      const result = await caller.getByPomodoro({
        pomodoroId: '00000000-0000-0000-0000-000000000001',
      });

      expect(result).toEqual(slices);
    });
  });

  describe('update', () => {
    it('should update slice task association', async () => {
      mockService.updateSlice.mockResolvedValue({
        success: true,
        data: { id: 'slice-1', taskId: 'task-new' },
      });

      const caller = createCaller();
      const result = await caller.update({
        sliceId: '00000000-0000-0000-0000-000000000001',
        taskId: '00000000-0000-0000-0000-000000000002',
      });

      expect(result).toEqual({ id: 'slice-1', taskId: 'task-new' });
    });
  });
});
