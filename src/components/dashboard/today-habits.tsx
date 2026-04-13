'use client';

/**
 * TodayHabits Component
 *
 * Dashboard section showing today's due habits with one-click check-in.
 * Calls trpc.habit.getToday for the habit list.
 * Listens to socket `habit:entry_updated` / `habit:created` / `habit:deleted` events
 * to refresh the list in real time.
 */

import { useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { HabitCreateDialog } from '@/components/habits/habit-create-dialog';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import { getSocket } from '@/lib/socket-client';
import { useState } from 'react';

/** Format a Date to YYYY-MM-DD using local time */
function todayDateString(): string {
  const now = new Date();
  // Mirror server's 04:00 AM reset: before 4 AM counts as yesterday
  if (now.getHours() < 4) {
    now.setDate(now.getDate() - 1);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function TodayHabits() {
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data: habits, isLoading } = trpc.habit.getToday.useQuery();

  const recordEntry = trpc.habit.recordEntry.useMutation({
    onSuccess: () => utils.habit.getToday.invalidate(),
  });

  const deleteEntry = trpc.habit.deleteEntry.useMutation({
    onSuccess: () => utils.habit.getToday.invalidate(),
  });

  // Listen to socket events for real-time refresh
  const invalidate = useCallback(() => {
    utils.habit.getToday.invalidate();
  }, [utils]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('habit:entry_updated' as never, invalidate);
    socket.on('habit:created' as never, invalidate);
    socket.on('habit:deleted' as never, invalidate);
    socket.on('habit:updated' as never, invalidate);

    return () => {
      socket.off('habit:entry_updated' as never, invalidate);
      socket.off('habit:created' as never, invalidate);
      socket.off('habit:deleted' as never, invalidate);
      socket.off('habit:updated' as never, invalidate);
    };
  }, [invalidate]);

  const handleCheck = (habitId: string, isCompleted: boolean) => {
    const date = todayDateString();
    if (isCompleted) {
      deleteEntry.mutate({ habitId, date });
    } else {
      recordEntry.mutate({ habitId, date, value: 1 });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader
          title="今日习惯"
          actions={
            <Button variant="ghost" size="sm" disabled>
              <Icons.plus className="w-3.5 h-3.5" />
            </Button>
          }
        />
        <CardContent>
          <div className="flex items-center justify-center h-16">
            <Icons.loader className="w-4 h-4 animate-spin text-notion-text-tertiary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const habitList = habits ?? [];

  return (
    <>
      <Card>
        <CardHeader
          title="今日习惯"
          actions={
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
              <Icons.plus className="w-3.5 h-3.5" />
            </Button>
          }
        />
        <CardContent className="p-0">
          {habitList.length === 0 ? (
            <EmptyState
              icon={<Icons.repeat className="w-8 h-8 text-notion-text-tertiary" />}
              title="创建你的第一个习惯"
              description="每天坚持一点点，积累改变"
              action={
                <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                  <Icons.plus className="w-3.5 h-3.5" />
                  创建习惯
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-notion-border">
              {habitList.map((habit) => {
                const isCompleted =
                  habit.todayEntry != null &&
                  (habit.todayEntry.entryType === 'YES_MANUAL' ||
                    habit.todayEntry.entryType === 'YES_AUTO');
                const isMutating =
                  recordEntry.isPending || deleteEntry.isPending;

                return (
                  <li
                    key={habit.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-notion-bg-hover transition-colors duration-fast"
                  >
                    {/* Check button */}
                    <button
                      disabled={isMutating}
                      onClick={() => handleCheck(habit.id, isCompleted)}
                      className={`
                        flex-shrink-0 transition-colors duration-fast
                        ${isCompleted
                          ? 'text-notion-accent-green hover:text-notion-accent-green/70'
                          : 'text-notion-text-tertiary hover:text-notion-text-secondary'
                        }
                        disabled:opacity-50
                      `}
                    >
                      {isCompleted ? (
                        <Icons.circleCheck className="w-5 h-5" />
                      ) : (
                        <Icons.circle className="w-5 h-5" />
                      )}
                    </button>

                    {/* Title */}
                    <span
                      className={`
                        flex-1 text-sm truncate
                        ${isCompleted ? 'line-through text-notion-text-tertiary' : 'text-notion-text'}
                      `}
                    >
                      {habit.title}
                    </span>

                    {/* Streak badge */}
                    {habit.streak.current > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-notion-accent-orange font-medium">
                        <Icons.flame className="w-3 h-3" />
                        {habit.streak.current}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <HabitCreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            utils.habit.getToday.invalidate();
          }}
        />
      )}
    </>
  );
}
