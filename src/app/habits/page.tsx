'use client';

/**
 * Habits Management Page
 *
 * Lists all ACTIVE habits with edit/delete operations.
 * Reuses HabitCreateDialog for create and edit flows.
 */

import { useEffect, useCallback, useState } from 'react';
import { MainLayout, PageHeader, Card, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { HabitCreateDialog } from '@/components/habits/habit-create-dialog';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import { getSocket } from '@/lib/socket-client';

/** Map freqNum/freqDen to a human-readable string */
function formatFrequency(freqNum: number, freqDen: number): string {
  if (freqNum === 1 && freqDen === 1) return '每天';
  if (freqNum === 1 && freqDen === 2) return '隔天';
  if (freqDen === 7) return `每周 ${freqNum} 次`;
  return `${freqDen} 天 ${freqNum} 次`;
}

/** Habit type display label */
function formatType(type: string): string {
  switch (type) {
    case 'BOOLEAN': return '打卡';
    case 'MEASURABLE': return '计数';
    case 'TIMED': return '时长';
    default: return type;
  }
}

interface HabitItem {
  id: string;
  title: string;
  type: string;
  freqNum: number;
  freqDen: number;
  reminderEnabled: boolean;
  reminderTime: string | null;
  status: string;
  sortOrder: number;
  icon: string | null;
  color: string | null;
  description: string | null;
}

export default function HabitsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitItem | null>(null);
  const utils = trpc.useUtils();

  const { data: habits, isLoading } = trpc.habit.list.useQuery({ status: 'ACTIVE' });

  const deleteMutation = trpc.habit.delete.useMutation({
    onSuccess: () => utils.habit.list.invalidate(),
  });

  // Listen to socket events for real-time refresh
  const invalidate = useCallback(() => {
    utils.habit.list.invalidate();
  }, [utils]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('habit:created' as never, invalidate);
    socket.on('habit:updated' as never, invalidate);
    socket.on('habit:deleted' as never, invalidate);

    return () => {
      socket.off('habit:created' as never, invalidate);
      socket.off('habit:updated' as never, invalidate);
      socket.off('habit:deleted' as never, invalidate);
    };
  }, [invalidate]);

  const handleDelete = (habit: HabitItem) => {
    if (confirm(`确定删除习惯「${habit.title}」？所有打卡记录将一并删除。`)) {
      deleteMutation.mutate({ id: habit.id });
    }
  };

  const handleCreated = () => {
    setShowCreate(false);
    setEditingHabit(null);
    utils.habit.list.invalidate();
    utils.habit.getToday.invalidate();
  };

  const habitList = habits ?? [];

  return (
    <MainLayout title="习惯">
      <PageHeader
        title="习惯"
        description="管理你的每日习惯"
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Icons.plus className="w-3.5 h-3.5" />
            创建习惯
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse h-16 bg-notion-bg-tertiary rounded-notion-md"
            />
          ))}
        </div>
      ) : habitList.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Icons.repeat className="w-8 h-8 text-notion-text-tertiary" />}
              title="还没有习惯"
              description="创建你的第一个习惯，开始每天的坚持"
              action={
                <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                  <Icons.plus className="w-3.5 h-3.5" />
                  创建习惯
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {habitList.map((habit) => (
            <Card key={habit.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Icon */}
                <div className="flex-shrink-0 w-8 h-8 rounded-notion-md bg-notion-bg-tertiary flex items-center justify-center">
                  <Icons.repeat className="w-4 h-4 text-notion-text-secondary" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-notion-text truncate">
                      {habit.title}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-notion-bg-tertiary text-notion-text-tertiary">
                      {formatType(habit.type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-notion-text-tertiary">
                      {formatFrequency(habit.freqNum, habit.freqDen)}
                    </span>
                    {habit.reminderEnabled && habit.reminderTime && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-notion-text-tertiary">
                        <Icons.bell className="w-3 h-3" />
                        {habit.reminderTime}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingHabit(habit)}
                    className="p-1.5 rounded-notion-md text-notion-text-tertiary hover:text-notion-text hover:bg-notion-bg-hover transition-colors duration-fast"
                    title="编辑"
                  >
                    <Icons.edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(habit)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded-notion-md text-notion-text-tertiary hover:text-notion-accent-red hover:bg-notion-bg-hover transition-colors duration-fast disabled:opacity-50"
                    title="删除"
                  >
                    <Icons.trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <HabitCreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Edit dialog — reuse create dialog with initial values */}
      {editingHabit && (
        <HabitCreateDialog
          habit={editingHabit}
          onClose={() => setEditingHabit(null)}
          onCreated={handleCreated}
        />
      )}
    </MainLayout>
  );
}
