'use client';

/**
 * HabitCreateDialog Component
 *
 * Minimal dialog for creating a new BOOLEAN habit (Phase 1).
 * Fields: title, frequency (每天/隔天/每周N次), optional reminder time.
 * Type is fixed to BOOLEAN — type selection comes in Phase 2.
 */

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';

/** Preset frequency options */
const FREQ_PRESETS = [
  { label: '每天', freqNum: 1, freqDen: 1 },
  { label: '隔天', freqNum: 1, freqDen: 2 },
  { label: '每周 3 次', freqNum: 3, freqDen: 7 },
  { label: '每周 5 次', freqNum: 5, freqDen: 7 },
] as const;

interface HabitCreateDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export function HabitCreateDialog({
  onClose,
  onCreated,
}: HabitCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [freqIndex, setFreqIndex] = useState(0); // default: 每天
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [error, setError] = useState('');

  const createMutation = trpc.habit.create.useMutation({
    onSuccess: () => onCreated(),
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('请输入习惯名称');
      return;
    }

    const freq = FREQ_PRESETS[freqIndex];

    createMutation.mutate({
      title: trimmed,
      type: 'BOOLEAN',
      freqNum: freq.freqNum,
      freqDen: freq.freqDen,
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-notion-bg rounded-notion-lg shadow-notion-lg max-w-md w-full mx-4 border border-notion-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border">
          <h2 className="text-sm font-semibold text-notion-text">创建习惯</h2>
          <button
            onClick={onClose}
            className="text-notion-text-tertiary hover:text-notion-text transition-colors duration-fast"
          >
            <Icons.close className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-notion-text-secondary mb-1">
              习惯名称
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              placeholder="例如：冥想、读书、运动"
              autoFocus
              maxLength={100}
              className="w-full px-3 py-2 border border-notion-border rounded-notion-md text-sm text-notion-text bg-notion-bg placeholder:text-notion-text-tertiary focus:outline-none focus:ring-2 focus:ring-notion-accent-blue focus:border-transparent"
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-notion-text-secondary mb-1.5">
              频率
            </label>
            <div className="flex flex-wrap gap-2">
              {FREQ_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setFreqIndex(idx)}
                  className={`
                    px-3 py-1.5 rounded-notion-md text-xs font-medium
                    transition-all duration-fast
                    ${
                      freqIndex === idx
                        ? 'bg-notion-accent-blue text-notion-text-inverse shadow-notion-sm'
                        : 'bg-notion-bg-tertiary text-notion-text-secondary hover:bg-notion-bg-hover border border-notion-border'
                    }
                  `}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reminder */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="rounded border-notion-border text-notion-accent-blue focus:ring-notion-accent-blue"
              />
              <span className="text-sm text-notion-text-secondary">
                设置提醒时间
              </span>
            </label>
            {reminderEnabled && (
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="mt-2 px-3 py-2 border border-notion-border rounded-notion-md text-sm text-notion-text bg-notion-bg focus:outline-none focus:ring-2 focus:ring-notion-accent-blue focus:border-transparent"
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-notion-accent-red">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={createMutation.isPending}
            >
              创建
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
