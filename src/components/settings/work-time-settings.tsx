'use client';

/**
 * WorkTimeSettings Component
 * 
 * Form for configuring work time slots and idle alert settings.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 8.2, 8.3
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import { useSettingsLock } from '@/hooks/use-settings-lock';
import { SettingsLockIndicator } from './settings-lock-indicator';

// Work time slot interface
export interface WorkTimeSlot {
  id: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  enabled: boolean;
}

// Idle alert action types
export type IdleAlertAction = 
  | 'show_overlay'
  | 'close_distracting_apps'
  | 'open_pomodoro_page'
  | 'browser_notification';

interface WorkTimeConfig {
  slots: WorkTimeSlot[];
  maxIdleMinutes: number;
  idleAlertActions: IdleAlertAction[];
}

// Validation result interface
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Generate unique ID for slots
function generateSlotId(): string {
  return `slot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Validate time format (HH:mm)
function isValidTimeFormat(time: string): boolean {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time);
}

// Validate work time slots for overlaps and format
export function validateWorkTimeSlots(slots: WorkTimeSlot[]): ValidationResult {
  const errors: string[] = [];
  const enabledSlots = slots.filter(s => s.enabled);

  // Check time format and start < end for each slot
  for (const slot of slots) {
    if (!isValidTimeFormat(slot.startTime)) {
      errors.push(`Invalid start time format: ${slot.startTime}`);
    }
    if (!isValidTimeFormat(slot.endTime)) {
      errors.push(`Invalid end time format: ${slot.endTime}`);
    }
    if (slot.startTime >= slot.endTime) {
      errors.push(`Start time must be before end time: ${slot.startTime} - ${slot.endTime}`);
    }
  }

  // Check for overlaps among enabled slots
  const sortedSlots = [...enabledSlots].sort((a, b) => 
    a.startTime.localeCompare(b.startTime)
  );

  for (let i = 0; i < sortedSlots.length - 1; i++) {
    if (sortedSlots[i].endTime > sortedSlots[i + 1].startTime) {
      errors.push(
        `Time slots overlap: ${sortedSlots[i].startTime}-${sortedSlots[i].endTime} ` +
        `and ${sortedSlots[i + 1].startTime}-${sortedSlots[i + 1].endTime}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

const IDLE_ALERT_OPTIONS: { value: IdleAlertAction; label: string; icon: string; description: string }[] = [
  { 
    value: 'show_overlay', 
    label: 'Show Overlay', 
    icon: '🖼️',
    description: 'Display a focus reminder overlay in the browser'
  },
  { 
    value: 'browser_notification', 
    label: 'Browser Notification', 
    icon: '🔔',
    description: 'Send a browser notification'
  },
  { 
    value: 'open_pomodoro_page', 
    label: 'Open Pomodoro Page', 
    icon: '🍅',
    description: 'Navigate to the pomodoro timer page'
  },
  { 
    value: 'close_distracting_apps', 
    label: 'Close Distracting Apps', 
    icon: '🚫',
    description: 'Close tabs with distracting websites'
  },
];

const DEFAULT_SLOTS: WorkTimeSlot[] = [
  { id: generateSlotId(), startTime: '09:00', endTime: '12:00', enabled: true },
  { id: generateSlotId(), startTime: '14:00', endTime: '18:00', enabled: true },
];

export function WorkTimeSettings() {
  const utils = trpc.useUtils();
  
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  
  // Settings lock integration (Requirements 8.2, 8.3)
  const { canModify, isLoading: isLockLoading } = useSettingsLock();
  const workTimeSlotsLock = canModify('workTimeSlots');
  const isLocked = !workTimeSlotsLock.allowed;
  
  const [formData, setFormData] = useState<WorkTimeConfig>({
    slots: DEFAULT_SLOTS,
    maxIdleMinutes: 15,
    idleAlertActions: ['show_overlay'],
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      const s = settings as {
        workTimeSlots?: WorkTimeSlot[] | string;
        maxIdleMinutes?: number;
        idleAlertActions?: string[];
      };
      
      // Parse workTimeSlots - could be JSON string or array
      let slots: WorkTimeSlot[] = DEFAULT_SLOTS;
      if (s.workTimeSlots) {
        if (typeof s.workTimeSlots === 'string') {
          try {
            const parsed = JSON.parse(s.workTimeSlots);
            if (Array.isArray(parsed) && parsed.length > 0) {
              slots = parsed;
            }
          } catch {
            // Use default slots if parsing fails
          }
        } else if (Array.isArray(s.workTimeSlots) && s.workTimeSlots.length > 0) {
          slots = s.workTimeSlots;
        }
      }
      
      setFormData({
        slots,
        maxIdleMinutes: s.maxIdleMinutes ?? 15,
        idleAlertActions: (s.idleAlertActions as IdleAlertAction[]) ?? ['show_overlay'],
      });
    }
  }, [settings]);

  const updateMutation = trpc.settings.updateWorkTime.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setIsDirty(false);
      setError(null);
      setValidationErrors([]);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Validate slots whenever they change
  const validateSlots = useCallback((slots: WorkTimeSlot[]) => {
    const result = validateWorkTimeSlots(slots);
    setValidationErrors(result.errors);
    return result.valid;
  }, []);

  const handleAddSlot = () => {
    const newSlot: WorkTimeSlot = {
      id: generateSlotId(),
      startTime: '09:00',
      endTime: '12:00',
      enabled: true,
    };
    const newSlots = [...formData.slots, newSlot];
    setFormData(prev => ({ ...prev, slots: newSlots }));
    setIsDirty(true);
    validateSlots(newSlots);
  };

  const handleRemoveSlot = (slotId: string) => {
    const newSlots = formData.slots.filter(s => s.id !== slotId);
    setFormData(prev => ({ ...prev, slots: newSlots }));
    setIsDirty(true);
    validateSlots(newSlots);
  };

  const handleSlotChange = (slotId: string, field: keyof WorkTimeSlot, value: string | boolean) => {
    const newSlots = formData.slots.map(s => 
      s.id === slotId ? { ...s, [field]: value } : s
    );
    setFormData(prev => ({ ...prev, slots: newSlots }));
    setIsDirty(true);
    validateSlots(newSlots);
  };

  const handleMaxIdleChange = (value: number) => {
    setFormData(prev => ({ ...prev, maxIdleMinutes: value }));
    setIsDirty(true);
  };

  const handleIdleActionToggle = (action: IdleAlertAction) => {
    setFormData(prev => {
      const actions = prev.idleAlertActions.includes(action)
        ? prev.idleAlertActions.filter(a => a !== action)
        : [...prev.idleAlertActions, action];
      return { ...prev, idleAlertActions: actions };
    });
    setIsDirty(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate before submitting
    if (!validateSlots(formData.slots)) {
      return;
    }

    updateMutation.mutate({
      slots: formData.slots,
      maxIdleMinutes: formData.maxIdleMinutes,
      idleAlertActions: formData.idleAlertActions,
    });
  };

  const handleReset = () => {
    if (settings) {
      const s = settings as {
        workTimeSlots?: WorkTimeSlot[] | string;
        maxIdleMinutes?: number;
        idleAlertActions?: string[];
      };
      
      let slots: WorkTimeSlot[] = DEFAULT_SLOTS;
      if (s.workTimeSlots) {
        if (typeof s.workTimeSlots === 'string') {
          try {
            const parsed = JSON.parse(s.workTimeSlots);
            if (Array.isArray(parsed) && parsed.length > 0) {
              slots = parsed;
            }
          } catch {
            // Use default slots
          }
        } else if (Array.isArray(s.workTimeSlots) && s.workTimeSlots.length > 0) {
          slots = s.workTimeSlots;
        }
      }
      
      setFormData({
        slots,
        maxIdleMinutes: s.maxIdleMinutes ?? 15,
        idleAlertActions: (s.idleAlertActions as IdleAlertAction[]) ?? ['show_overlay'],
      });
      setIsDirty(false);
      setError(null);
      setValidationErrors([]);
    }
  };

  if (isLoading || isLockLoading) {
    return (
      <Card>
        <CardHeader title="Work Time Settings" description="Configure your work hours" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader 
          title="Work Time Settings"
          description={
            isLocked 
              ? workTimeSlotsLock.reason 
              : "Configure your work hours and idle alert preferences"
          }
          actions={<SettingsLockIndicator settingKey="workTimeSlots" showLabel />}
        />
        <CardContent className={`space-y-6 ${isLocked ? 'opacity-60' : ''}`}>
          {/* Work Time Slots Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                ⏰ Work Time Slots
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSlot}
                disabled={isLocked}
              >
                + Add Slot
              </Button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Define your work hours. Idle alerts will only trigger during these times.
            </p>
            
            <div className="space-y-3">
              {formData.slots.map((slot, index) => (
                <div 
                  key={slot.id} 
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border
                    ${slot.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'}
                  `}
                >
                  {/* Enable Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={slot.enabled}
                    onClick={() => handleSlotChange(slot.id, 'enabled', !slot.enabled)}
                    disabled={isLocked}
                    className={`
                      relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0
                      ${slot.enabled ? 'bg-blue-600' : 'bg-gray-300'}
                      ${isLocked ? 'cursor-not-allowed' : ''}
                    `}
                  >
                    <span
                      className={`
                        inline-block h-3 w-3 transform rounded-full bg-white transition-transform
                        ${slot.enabled ? 'translate-x-5' : 'translate-x-1'}
                      `}
                    />
                  </button>

                  {/* Slot Number */}
                  <span className="text-sm text-gray-500 w-6">#{index + 1}</span>

                  {/* Start Time */}
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => handleSlotChange(slot.id, 'startTime', e.target.value)}
                    className={`
                      px-2 py-1 border rounded text-sm
                      ${slot.enabled && !isLocked ? 'border-gray-300' : 'border-gray-200 text-gray-400'}
                    `}
                    disabled={!slot.enabled || isLocked}
                  />

                  <span className="text-gray-400">→</span>

                  {/* End Time */}
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => handleSlotChange(slot.id, 'endTime', e.target.value)}
                    className={`
                      px-2 py-1 border rounded text-sm
                      ${slot.enabled && !isLocked ? 'border-gray-300' : 'border-gray-200 text-gray-400'}
                    `}
                    disabled={!slot.enabled || isLocked}
                  />

                  {/* Duration Display */}
                  <span className="text-xs text-gray-500 flex-1">
                    {slot.enabled && slot.startTime < slot.endTime && (
                      <>
                        {(() => {
                          const [sh, sm] = slot.startTime.split(':').map(Number);
                          const [eh, em] = slot.endTime.split(':').map(Number);
                          const mins = (eh * 60 + em) - (sh * 60 + sm);
                          const hours = Math.floor(mins / 60);
                          const minutes = mins % 60;
                          return `${hours}h ${minutes}m`;
                        })()}
                      </>
                    )}
                  </span>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(slot.id)}
                    disabled={isLocked}
                    className={`
                      text-gray-400 transition-colors
                      ${isLocked ? 'cursor-not-allowed' : 'hover:text-red-500'}
                    `}
                    title={isLocked ? 'Locked during work hours' : 'Remove slot'}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {formData.slots.length === 0 && (
                <div className="text-center py-6 text-gray-500 border border-dashed rounded-lg">
                  No work time slots configured. Click &quot;Add Slot&quot; to create one.
                </div>
              )}
            </div>
          </div>

          {/* Max Idle Time */}
          <div className="pt-4 border-t border-gray-200">
            <label htmlFor="maxIdleMinutes" className="block text-sm font-medium text-gray-700 mb-1">
              💤 Max Idle Time Before Alert
            </label>
            <div className="flex items-center gap-3">
              <input
                id="maxIdleMinutes"
                type="range"
                min={1}
                max={60}
                step={1}
                value={formData.maxIdleMinutes}
                onChange={(e) => handleMaxIdleChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="w-20 text-center">
                <span className="text-lg font-semibold text-gray-900">{formData.maxIdleMinutes}</span>
                <span className="text-sm text-gray-500 ml-1">min</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Trigger an alert when no pomodoro is active for this long during work hours
            </p>
          </div>

          {/* Idle Alert Actions */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ⚡ Idle Alert Actions
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Select what happens when you&apos;ve been idle too long during work hours
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {IDLE_ALERT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleIdleActionToggle(option.value)}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border-2 transition-colors text-left
                    ${formData.idleAlertActions.includes(option.value)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <span className="text-xl">{option.icon}</span>
                  <div>
                    <span className={`
                      text-sm font-medium block
                      ${formData.idleAlertActions.includes(option.value) ? 'text-blue-700' : 'text-gray-700'}
                    `}>
                      {option.label}
                    </span>
                    <span className="text-xs text-gray-500">{option.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Summary</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="text-gray-500">Active work slots:</span>{' '}
                <span className="font-medium">
                  {formData.slots.filter(s => s.enabled).length} of {formData.slots.length}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Total work hours:</span>{' '}
                <span className="font-medium">
                  {(() => {
                    const totalMins = formData.slots
                      .filter(s => s.enabled && s.startTime < s.endTime)
                      .reduce((acc, s) => {
                        const [sh, sm] = s.startTime.split(':').map(Number);
                        const [eh, em] = s.endTime.split(':').map(Number);
                        return acc + (eh * 60 + em) - (sh * 60 + sm);
                      }, 0);
                    const hours = Math.floor(totalMins / 60);
                    const minutes = totalMins % 60;
                    return `${hours}h ${minutes}m`;
                  })()}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Idle alert after:</span>{' '}
                <span className="font-medium">{formData.maxIdleMinutes} minutes</span>
              </p>
            </div>
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 mb-1">⚠️ Validation Issues</p>
              <ul className="text-sm text-yellow-700 list-disc list-inside">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleReset}
              disabled={!isDirty || isLocked}
            >
              Reset
            </Button>
            <Button 
              type="submit" 
              isLoading={updateMutation.isPending}
              disabled={!isDirty || validationErrors.length > 0 || isLocked}
            >
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
