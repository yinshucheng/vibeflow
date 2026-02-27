/**
 * S6.5 Tests: Scene Config Resolution
 *
 * - Default: uses DEFAULT_SCENE_CONFIG
 * - Env override: LLM_MODEL_CHAT_PLANNING → uses env model
 * - Unknown scene → falls back to chat:default
 * - All scenes have valid structure
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getSceneConfig,
  DEFAULT_SCENE_CONFIG,
  MODEL_META,
  type SceneModelConfig,
} from '@/config/llm.config';
import { resolveSceneForIntent } from '@/services/chat-intent.service';

describe('Scene Config (S6.4)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── Default config ──
  describe('default configuration', () => {
    it('returns chat:default config for default scene', () => {
      const config = getSceneConfig('chat:default');
      expect(config.model).toBe('qwen-plus');
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.7);
      expect(config.toolsEnabled).toBe(true);
    });

    it('returns chat:quick_action config', () => {
      const config = getSceneConfig('chat:quick_action');
      expect(config.model).toBe('qwen-turbo');
      expect(config.maxTokens).toBe(1024);
      expect(config.temperature).toBe(0.3);
      expect(config.toolsEnabled).toBe(true);
    });

    it('returns chat:planning config', () => {
      const config = getSceneConfig('chat:planning');
      expect(config.model).toBe('qwen-plus');
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.7);
      expect(config.toolsEnabled).toBe(true);
    });

    it('returns chat:review config', () => {
      const config = getSceneConfig('chat:review');
      expect(config.model).toBe('qwen-plus');
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.5);
      expect(config.toolsEnabled).toBe(true);
    });

    it('returns internal:summarize config', () => {
      const config = getSceneConfig('internal:summarize');
      expect(config.model).toBe('qwen-turbo');
      expect(config.maxTokens).toBe(512);
      expect(config.temperature).toBe(0.3);
      expect(config.toolsEnabled).toBe(false);
    });
  });

  // ── Env override ──
  describe('environment variable override', () => {
    it('uses env var model when set for chat:default', () => {
      vi.stubEnv('LLM_MODEL_CHAT_DEFAULT', 'qwen-turbo');
      const config = getSceneConfig('chat:default');
      expect(config.model).toBe('qwen-turbo');
      // Other fields unchanged
      expect(config.maxTokens).toBe(4096);
    });

    it('uses env var model for chat:planning', () => {
      vi.stubEnv('LLM_MODEL_CHAT_PLANNING', 'qwen-max');
      const config = getSceneConfig('chat:planning');
      expect(config.model).toBe('qwen-max');
    });

    it('uses env var model for chat:review', () => {
      vi.stubEnv('LLM_MODEL_CHAT_REVIEW', 'kimi-128k');
      const config = getSceneConfig('chat:review');
      expect(config.model).toBe('kimi-128k');
    });

    it('ignores invalid env var model', () => {
      vi.stubEnv('LLM_MODEL_CHAT_DEFAULT', 'invalid-model-xxx');
      const config = getSceneConfig('chat:default');
      expect(config.model).toBe('qwen-plus'); // falls back to default
    });
  });

  // ── Unknown scene ──
  describe('unknown scene fallback', () => {
    it('falls back to chat:default for unknown scene', () => {
      const config = getSceneConfig('unknown:scene');
      expect(config.model).toBe(DEFAULT_SCENE_CONFIG['chat:default'].model);
    });
  });

  // ── All scenes have valid structure ──
  describe('all scenes valid', () => {
    it('every DEFAULT_SCENE_CONFIG entry has a valid model in MODEL_META', () => {
      for (const [scene, config] of Object.entries(DEFAULT_SCENE_CONFIG)) {
        expect(MODEL_META).toHaveProperty(config.model);
        expect(config.maxTokens).toBeGreaterThan(0);
        expect(config.temperature).toBeGreaterThanOrEqual(0);
        expect(config.temperature).toBeLessThanOrEqual(1);
        expect(typeof config.toolsEnabled).toBe('boolean');
      }
    });
  });

  // ── Intent → Scene mapping ──
  describe('resolveSceneForIntent', () => {
    it('quick_action → chat:quick_action', () => {
      expect(resolveSceneForIntent('quick_action')).toBe('chat:quick_action');
    });

    it('planning → chat:planning', () => {
      expect(resolveSceneForIntent('planning')).toBe('chat:planning');
    });

    it('review → chat:review', () => {
      expect(resolveSceneForIntent('review')).toBe('chat:review');
    });

    it('task_mgmt → chat:default', () => {
      expect(resolveSceneForIntent('task_mgmt')).toBe('chat:default');
    });

    it('project → chat:default', () => {
      expect(resolveSceneForIntent('project')).toBe('chat:default');
    });

    it('default → chat:default', () => {
      expect(resolveSceneForIntent('default')).toBe('chat:default');
    });
  });
});
