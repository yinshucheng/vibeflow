/**
 * Chat User Configuration Service (S10)
 *
 * S10.1 Trigger configuration: global toggle, quiet hours, per-trigger on/off.
 * S10.2 Model preference: per-scene model overrides (chat:default, chat:planning, etc.)
 *
 * Reads from / writes to UserSettings.aiTriggerConfig and UserSettings.aiModelConfig.
 */

import { prisma } from '@/lib/prisma';
import { DEFAULT_AI_TRIGGER_CONFIG } from './ai-trigger.service';
import type { AITriggerConfig } from './ai-trigger.service';
import { isValidModelId, DEFAULT_SCENE_CONFIG } from '@/config/llm.config';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface AIModelConfig {
  [sceneKey: string]: { model: string };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_AI_MODEL_CONFIG: AIModelConfig = {};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const chatUserConfigService = {
  // -----------------------------------------------------------------------
  // S10.1 — Trigger configuration
  // -----------------------------------------------------------------------

  /**
   * Read the user's AI trigger config, merging with defaults.
   */
  async getAITriggerConfig(userId: string): Promise<ServiceResult<AITriggerConfig>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { aiTriggerConfig: true },
      });

      const stored = (settings?.aiTriggerConfig as unknown as Partial<AITriggerConfig>) ?? {};
      const merged = _mergeTriggerConfig(stored);
      return { success: true, data: merged };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: `getAITriggerConfig failed: ${error instanceof Error ? error.message : String(error)}` },
      };
    }
  },

  /**
   * Update the user's AI trigger config (partial update — deep merge).
   */
  async updateAITriggerConfig(userId: string, patch: Partial<AITriggerConfig>): Promise<ServiceResult<AITriggerConfig>> {
    try {
      // Read current
      const current = await this.getAITriggerConfig(userId);
      if (!current.success || !current.data) {
        return { success: false, error: current.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to read config' } };
      }

      // Deep merge patch into current config
      const updated: AITriggerConfig = {
        ...current.data,
        ...patch,
        triggers: {
          ...current.data.triggers,
          ...(patch.triggers ?? {}),
        },
      };
      if (patch.quietHours !== undefined) {
        updated.quietHours = patch.quietHours;
      }

      // Upsert into UserSettings
      await prisma.userSettings.upsert({
        where: { userId },
        update: { aiTriggerConfig: updated as unknown as Prisma.InputJsonValue },
        create: {
          userId,
          aiTriggerConfig: updated as unknown as Prisma.InputJsonValue,
        },
      });

      return { success: true, data: updated };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: `updateAITriggerConfig failed: ${error instanceof Error ? error.message : String(error)}` },
      };
    }
  },

  // -----------------------------------------------------------------------
  // S10.2 — Model preference
  // -----------------------------------------------------------------------

  /**
   * Read the user's model config.
   */
  async getAIModelConfig(userId: string): Promise<ServiceResult<AIModelConfig>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { aiModelConfig: true },
      });

      const stored = (settings?.aiModelConfig as unknown as AIModelConfig) ?? {};
      return { success: true, data: { ...DEFAULT_AI_MODEL_CONFIG, ...stored } };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: `getAIModelConfig failed: ${error instanceof Error ? error.message : String(error)}` },
      };
    }
  },

  /**
   * Update the user's model config (partial update).
   */
  async updateAIModelConfig(userId: string, patch: AIModelConfig): Promise<ServiceResult<AIModelConfig>> {
    try {
      const current = await this.getAIModelConfig(userId);
      if (!current.success || !current.data) {
        return { success: false, error: current.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to read config' } };
      }

      const updated = { ...current.data, ...patch };

      await prisma.userSettings.upsert({
        where: { userId },
        update: { aiModelConfig: updated as unknown as Prisma.InputJsonValue },
        create: {
          userId,
          aiModelConfig: updated as unknown as Prisma.InputJsonValue,
        },
      });

      return { success: true, data: updated };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: `updateAIModelConfig failed: ${error instanceof Error ? error.message : String(error)}` },
      };
    }
  },

  // -----------------------------------------------------------------------
  // Model resolution (used by LLM adapter / chat service)
  // -----------------------------------------------------------------------

  /**
   * Resolve the model ID for a given scene, respecting priority:
   *   code defaults → env override → user settings override
   */
  async resolveModelForScene(userId: string, scene: string): Promise<string> {
    // 1. Code default
    const sceneConfig = DEFAULT_SCENE_CONFIG[scene] ?? DEFAULT_SCENE_CONFIG['chat:default'];
    let model = sceneConfig.model;

    // 2. Env override (already handled by getSceneConfig in llm.config.ts)
    // We replicate the env check here to maintain the three-level priority chain
    const envMap: Record<string, string> = {
      'chat:default': 'LLM_MODEL_CHAT_DEFAULT',
      'chat:quick_action': 'LLM_MODEL_CHAT_QUICK_ACTION',
      'chat:planning': 'LLM_MODEL_CHAT_PLANNING',
      'chat:review': 'LLM_MODEL_CHAT_REVIEW',
      'chat:summary': 'LLM_MODEL_CHAT_SUMMARY',
    };
    const envKey = envMap[scene];
    if (envKey) {
      const envModel = process.env[envKey];
      if (envModel && isValidModelId(envModel)) {
        model = envModel;
      }
    }

    // 3. User settings override (highest priority)
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { aiModelConfig: true },
      });
      const userConfig = (settings?.aiModelConfig as unknown as AIModelConfig) ?? {};
      const userModel = userConfig[scene]?.model;
      if (userModel && isValidModelId(userModel)) {
        return userModel;
      }
    } catch {
      // Fall through to env/default
    }

    return model;
  },

  /**
   * Get the list of available models for the settings UI.
   */
  getAvailableModels(): Array<{ id: string; displayName: string }> {
    // Import MODEL_META dynamically to avoid circular deps
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MODEL_META } = require('@/config/llm.config');
    return Object.entries(MODEL_META).map(([id, meta]) => ({
      id,
      displayName: (meta as { displayName: string }).displayName,
    }));
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _mergeTriggerConfig(stored: Partial<AITriggerConfig>): AITriggerConfig {
  return {
    enabled: stored.enabled ?? DEFAULT_AI_TRIGGER_CONFIG.enabled,
    quietHours: stored.quietHours ?? DEFAULT_AI_TRIGGER_CONFIG.quietHours,
    triggers: {
      ...DEFAULT_AI_TRIGGER_CONFIG.triggers,
      ...(stored.triggers ?? {}),
    },
  };
}

export default chatUserConfigService;
