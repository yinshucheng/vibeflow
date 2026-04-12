/**
 * AI Proactive Trigger Service (S4)
 *
 * Event-driven framework for AI-initiated messages.
 * Evaluates trigger conditions (debounce, user preferences, quiet hours, FOCUS protection)
 * and delivers messages via Socket.io with audit logging.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { stateEngineService } from './state-engine.service';
import { chatService } from './chat.service';
import { chatContextService } from './chat-context.service';
import { llmAdapterService } from './llm-adapter.service';
import { mcpAuditService } from './mcp-audit.service';
import type { SystemState } from '@/machines/vibeflow.machine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriggerSourceType = 'mcp_event' | 'cron' | 'state_transition' | 'threshold';
export type TriggerPriority = 'high' | 'normal' | 'low';

export interface TriggerCondition {
  type: TriggerSourceType;
  [key: string]: unknown;
}

export interface TriggerDefinition {
  /** Unique trigger identifier */
  id: string;
  /** Trigger source classification */
  sourceType: TriggerSourceType;
  /** LLM prompt template (for generating proactive messages) */
  promptTemplate: string;
  /** Whether to call LLM or use static template rendering */
  useLLM: boolean;
  /** Debounce: minimum interval between same-type fires (seconds) */
  cooldownSeconds: number;
  /** Whether user can toggle this trigger on/off */
  userConfigurable: boolean;
  /** Default enabled state */
  defaultEnabled: boolean;
  /** Priority: high bypasses quiet hours & FOCUS protection */
  priority: TriggerPriority;
  /** LLM scene key for model selection (e.g. 'trigger:on_rest_enter') */
  scene?: string;
}

export interface AITriggerConfig {
  /** Global kill switch */
  enabled: boolean;
  /** Quiet hours — no messages except high-priority */
  quietHours?: { start: string; end: string };
  /** Per-trigger overrides */
  triggers: Record<string, { enabled: boolean; params?: Record<string, unknown> }>;
}

export interface FireResult {
  messageId: string;
  conversationId: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Default user config
// ---------------------------------------------------------------------------

export const DEFAULT_AI_TRIGGER_CONFIG: AITriggerConfig = {
  enabled: true,
  quietHours: { start: '22:00', end: '07:00' },
  triggers: {
    // S5 state transition triggers
    on_planning_enter: { enabled: true },
    on_rest_enter: { enabled: true },
    on_over_rest_enter: { enabled: true },
    over_rest_escalation: { enabled: true },
    task_stuck: { enabled: true },
    // S9 cron triggers
    morning_greeting: { enabled: true },
    evening_summary: { enabled: true },
    progress_check: { enabled: false },   // disabled by default
    midday_check: { enabled: false },     // disabled by default
  },
};

// ---------------------------------------------------------------------------
// Built-in trigger definitions (S5 state triggers registered here)
// ---------------------------------------------------------------------------

export const BUILTIN_TRIGGERS: TriggerDefinition[] = [
  {
    id: 'on_planning_enter',
    sourceType: 'state_transition',
    promptTemplate: [
      '你是 VibeFlow 助手。用户刚刚开始新的一天。',
      '请根据以下上下文生成一段简洁的每日规划建议，推荐 Top 3 任务。',
      '',
      '上下文：',
      '{{context}}',
    ].join('\n'),
    useLLM: true,
    cooldownSeconds: 86400, // once per day
    userConfigurable: true,
    defaultEnabled: true,
    priority: 'high',
    scene: 'trigger:on_planning_enter',
  },
  {
    id: 'on_rest_enter',
    sourceType: 'state_transition',
    promptTemplate: [
      '你是 VibeFlow 助手。用户刚刚完成一个番茄钟，进入休息状态。',
      '请简短总结本轮番茄钟的成果，并推荐下一步任务。',
      '',
      '上下文：',
      '{{context}}',
    ].join('\n'),
    useLLM: true,
    cooldownSeconds: 300, // 5 min debounce (each pomodoro fires once)
    userConfigurable: true,
    defaultEnabled: true,
    priority: 'high',
    scene: 'trigger:on_rest_enter',
  },
  {
    id: 'on_over_rest_enter',
    sourceType: 'state_transition',
    promptTemplate: '休息时间已结束。准备回来专注吧？',
    useLLM: false,
    cooldownSeconds: 300,
    userConfigurable: true,
    defaultEnabled: true,
    priority: 'high',
  },
  {
    id: 'over_rest_escalation',
    sourceType: 'threshold',
    promptTemplate: '', // dynamically chosen by escalation level
    useLLM: false,
    cooldownSeconds: 300, // 5 min between escalation messages
    userConfigurable: true,
    defaultEnabled: true,
    priority: 'high',
    scene: 'trigger:over_rest_escalation',
  },
  {
    id: 'task_stuck',
    sourceType: 'threshold',
    promptTemplate: [
      '你是 VibeFlow 助手。用户在同一个任务上已经连续完成了 {{consecutiveCount}} 个番茄钟。',
      '这个任务可能比预期复杂。请建议用户拆分任务或切换思路。',
      '',
      '任务信息：',
      '{{context}}',
    ].join('\n'),
    useLLM: true,
    cooldownSeconds: 86400, // once per task per day
    userConfigurable: true,
    defaultEnabled: true,
    priority: 'normal',
    scene: 'trigger:task_stuck',
  },
];

// ---------------------------------------------------------------------------
// Escalation templates for over_rest
// ---------------------------------------------------------------------------

const OVER_REST_ESCALATION_TEMPLATES = {
  gentle: '休息结束了，准备回来专注？{{taskHint}}',
  moderate: '已经超时 {{overMinutes}} 分钟了。开始下一个番茄钟吧。',
  strong: '休息时间已大幅超出。每多休息一分钟，今天的目标就更难达成。',
};

export function getEscalationLevel(overRestMinutes: number): 'gentle' | 'moderate' | 'strong' {
  if (overRestMinutes <= 5) return 'gentle';
  if (overRestMinutes <= 10) return 'moderate';
  return 'strong';
}

export function getEscalationTemplate(level: 'gentle' | 'moderate' | 'strong'): string {
  return OVER_REST_ESCALATION_TEMPLATES[level];
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/** Broadcaster callback registered at server init */
let proactiveBroadcaster: ((
  userId: string,
  command: {
    commandType: string;
    payload: Record<string, unknown>;
  }
) => void) | null = null;

export function registerProactiveBroadcaster(
  broadcaster: (userId: string, command: { commandType: string; payload: Record<string, unknown> }) => void
): void {
  proactiveBroadcaster = broadcaster;
}

export const aiTriggerService = {
  // -- Registry --
  _triggers: new Map<string, TriggerDefinition>(),
  // -- Cooldowns: userId -> triggerId -> lastFiredAt (ms) --
  _cooldowns: new Map<string, Map<string, number>>(),

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------

  init(): void {
    for (const t of BUILTIN_TRIGGERS) {
      this._triggers.set(t.id, t);
    }
  },

  // -----------------------------------------------------------------------
  // Registry helpers
  // -----------------------------------------------------------------------

  registerTrigger(trigger: TriggerDefinition): void {
    this._triggers.set(trigger.id, trigger);
  },

  getTrigger(triggerId: string): TriggerDefinition | undefined {
    return this._triggers.get(triggerId);
  },

  getAllTriggers(): TriggerDefinition[] {
    return Array.from(this._triggers.values());
  },

  // -----------------------------------------------------------------------
  // shouldFire — evaluate whether a trigger should fire for a given user
  // -----------------------------------------------------------------------

  async shouldFire(
    userId: string,
    trigger: TriggerDefinition,
    options?: { now?: number }
  ): Promise<boolean> {
    const now = options?.now ?? Date.now();

    // 1. Load user config (global + per-trigger)
    const config = await this._getUserConfig(userId);

    // 1a. Global kill switch
    if (!config.enabled) return false;

    // 1b. Per-trigger switch
    const triggerConfig = config.triggers[trigger.id];
    const isEnabled = triggerConfig?.enabled ?? trigger.defaultEnabled;
    if (!isEnabled) return false;

    // 2. Quiet hours check (high priority bypasses)
    if (trigger.priority !== 'high' && config.quietHours) {
      if (this._isInQuietHours(config.quietHours, now)) return false;
    }

    // 3. Cooldown / debounce check
    const lastFired = this._cooldowns.get(userId)?.get(trigger.id);
    if (lastFired !== undefined && now - lastFired < trigger.cooldownSeconds * 1000) {
      return false;
    }

    // 4. FOCUS state protection — only high priority can interrupt
    if (trigger.priority !== 'high') {
      const currentState = await stateEngineService.getState(userId);
      if (currentState === 'focus') {
        return false;
      }
    }

    return true;
  },

  // -----------------------------------------------------------------------
  // fire — generate message → persist → broadcast → audit
  // -----------------------------------------------------------------------

  async fire(
    userId: string,
    trigger: TriggerDefinition,
    context: Record<string, unknown>
  ): Promise<{ success: true; data: FireResult } | { success: false; error: { code: string; message: string } }> {
    const now = Date.now();

    // Update cooldown
    this._updateCooldown(userId, trigger.id, now);

    let content: string;

    try {
      if (trigger.useLLM) {
        content = await this._generateLLMMessage(userId, trigger, context);
      } else {
        content = this._renderTemplate(trigger.promptTemplate, context);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: { code: 'INTERNAL_ERROR', message: `Failed to generate message: ${message}` } };
    }

    // Get or create conversation
    const convResult = await chatService.getOrCreateDefaultConversation(userId);
    if (!convResult.success || !convResult.data) {
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get conversation' } };
    }
    const conversationId = convResult.data.id;

    // Persist as assistant message with proactive metadata
    const metadata = {
      isProactive: true,
      triggerId: trigger.id,
      triggerContext: context,
    };
    const msgResult = await chatService.persistMessage(conversationId, 'assistant', content, metadata);
    if (!msgResult.success || !msgResult.data) {
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to persist message' } };
    }
    const messageId = msgResult.data.id;

    // Broadcast to all user's devices via CHAT_RESPONSE complete
    if (proactiveBroadcaster) {
      proactiveBroadcaster(userId, {
        commandType: 'CHAT_RESPONSE',
        payload: {
          conversationId,
          messageId,
          type: 'complete',
          content,
          isProactive: true,
          triggerId: trigger.id,
        },
      });
    }

    // Audit log
    try {
      await mcpAuditService.logToolCall(userId, {
        agentId: 'ai-trigger-system',
        toolName: `ai_trigger:${trigger.id}`,
        input: context,
        output: { message: content },
        success: true,
        duration: 0,
      });
    } catch {
      // Audit failure is non-fatal
    }

    return {
      success: true,
      data: { messageId, conversationId, content },
    };
  },

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  async _getUserConfig(userId: string): Promise<AITriggerConfig> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { aiTriggerConfig: true },
      });
      if (settings?.aiTriggerConfig && typeof settings.aiTriggerConfig === 'object') {
        const stored = settings.aiTriggerConfig as unknown as Partial<AITriggerConfig>;
        return {
          enabled: stored.enabled ?? DEFAULT_AI_TRIGGER_CONFIG.enabled,
          // Use 'in' check so explicit null/undefined disables quiet hours
          quietHours: 'quietHours' in stored ? stored.quietHours : DEFAULT_AI_TRIGGER_CONFIG.quietHours,
          triggers: {
            ...DEFAULT_AI_TRIGGER_CONFIG.triggers,
            ...(stored.triggers ?? {}),
          },
        };
      }
    } catch {
      // Fall through to defaults
    }
    return DEFAULT_AI_TRIGGER_CONFIG;
  },

  _isInQuietHours(quietHours: { start: string; end: string }, now: number): boolean {
    const date = new Date(now);
    const currentMinutes = date.getHours() * 60 + date.getMinutes();

    const [startH, startM] = quietHours.start.split(':').map(Number);
    const [endH, endM] = quietHours.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same-day range: e.g. 09:00 - 17:00
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range: e.g. 22:00 - 07:00
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  },

  _updateCooldown(userId: string, triggerId: string, now: number): void {
    let userCooldowns = this._cooldowns.get(userId);
    if (!userCooldowns) {
      userCooldowns = new Map<string, number>();
      this._cooldowns.set(userId, userCooldowns);
    }
    userCooldowns.set(triggerId, now);
  },

  _getCooldown(userId: string, triggerId: string): number | undefined {
    return this._cooldowns.get(userId)?.get(triggerId);
  },

  _clearCooldowns(): void {
    this._cooldowns.clear();
  },

  _renderTemplate(template: string, context: Record<string, unknown>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(context)) {
      rendered = rendered.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        String(value ?? ''),
      );
    }
    return rendered;
  },

  async _generateLLMMessage(
    userId: string,
    trigger: TriggerDefinition,
    context: Record<string, unknown>,
  ): Promise<string> {
    // Build a system prompt with user context
    const systemResult = await chatContextService.buildSystemPrompt(userId);
    const systemPrompt = systemResult.success && systemResult.data ? systemResult.data : '';

    // Render the trigger-specific prompt template with context
    const userPrompt = this._renderTemplate(trigger.promptTemplate, {
      ...context,
      context: JSON.stringify(context, null, 2),
    });

    const result = await llmAdapterService.callGenerateText({
      scene: trigger.scene ?? 'trigger:on_rest_enter',
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userPrompt }],
    });

    return result.text || '(AI 生成消息失败)';
  },
};

// Initialize built-in triggers
aiTriggerService.init();

export default aiTriggerService;
