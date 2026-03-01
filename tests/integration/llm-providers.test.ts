/**
 * Integration tests for domestic LLM providers (Qwen / Kimi / SiliconFlow).
 *
 * These tests hit real API endpoints — they require valid API keys in env vars.
 * When a key is missing the corresponding suite is skipped (CI-safe).
 *
 * Run:
 *   npx vitest run tests/integration/llm-providers.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { streamText, generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import {
  getModel,
  MODEL_REGISTRY,
  MODEL_META,
  type ModelId,
} from '../../src/config/llm.config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Provider → env var holding the API key */
const PROVIDER_KEY_MAP: Record<string, string> = {
  qwen: 'QWEN_API_KEY',
  kimi: 'KIMI_API_KEY',
  siliconflow: 'SILICONFLOW_API_KEY',
};

/** Pick one representative model per provider for integration testing */
const PROVIDER_TEST_MODELS: Record<string, ModelId> = {
  qwen: 'qwen-turbo',
  kimi: 'kimi-8k',
  siliconflow: 'sf-qwen-32b',
};

function hasApiKey(provider: string): boolean {
  const envVar = PROVIDER_KEY_MAP[provider];
  return !!envVar && !!process.env[envVar]?.trim();
}

/** Simple test tool: get current weather (stubbed) */
const weatherTool = tool({
  description: '获取指定城市的天气信息',
  inputSchema: z.object({
    city: z.string().describe('城市名称，如 "北京"'),
  }),
  execute: async ({ city }) => ({
    city,
    temperature: 22,
    condition: '晴' as const,
    humidity: 45,
  }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LLM Provider Integration Tests', () => {
  // Timeout: 30s per test to account for network latency
  const TEST_TIMEOUT = 30_000;

  for (const [provider, modelId] of Object.entries(PROVIDER_TEST_MODELS)) {
    const envVar = PROVIDER_KEY_MAP[provider];
    const skip = !hasApiKey(provider);

    describe.skipIf(skip)(`${provider} (${modelId})`, () => {
      let model: ReturnType<typeof getModel>;

      beforeAll(() => {
        model = getModel(modelId);
      });

      // ── 1. Basic conversation ──────────────────────────────────────────
      it(
        '基本对话: 发送中文消息，收到非空回复',
        async () => {
          const result = await generateText({
            model,
            messages: [{ role: 'user', content: '你好，请用一句话介绍你自己。' }],
            maxOutputTokens: 256,
            temperature: 0.7,
          });

          expect(result.text).toBeTruthy();
          expect(result.text.length).toBeGreaterThan(0);
          // Should contain some Chinese characters
          expect(/[\u4e00-\u9fff]/.test(result.text)).toBe(true);
        },
        TEST_TIMEOUT,
      );

      // ── 2. Streaming output ────────────────────────────────────────────
      it(
        '流式输出: onDelta 回调被多次调用',
        async () => {
          const deltas: string[] = [];

          const result = streamText({
            model,
            messages: [{ role: 'user', content: '请从 1 数到 10，每个数字一行。' }],
            maxOutputTokens: 256,
            temperature: 0.3,
          });

          for await (const chunk of result.textStream) {
            deltas.push(chunk);
          }

          // Should have received multiple chunks
          expect(deltas.length).toBeGreaterThan(1);

          // Combined text should be non-empty
          const fullText = deltas.join('');
          expect(fullText.length).toBeGreaterThan(0);
        },
        TEST_TIMEOUT,
      );

      // ── 3. Tool Use ────────────────────────────────────────────────────
      it(
        'Tool Use: 模型能正确调用 tool',
        async () => {
          const result = await generateText({
            model,
            messages: [
              {
                role: 'user',
                content: '请使用 weather 工具查询北京的天气。',
              },
            ],
            tools: { weather: weatherTool },
            maxOutputTokens: 512,
            temperature: 0.3,
            stopWhen: stepCountIs(3),
          });

          // The model should have attempted a tool call
          const hasToolCall =
            result.steps.some((s) => s.toolCalls.length > 0) ||
            result.toolCalls.length > 0;

          // Some models may not support tool use — log but still assert
          if (!hasToolCall) {
            console.warn(
              `[${provider}/${modelId}] Tool call was NOT triggered. ` +
                'The model may not support tool use or chose not to call the tool.',
            );
          }

          expect(hasToolCall).toBe(true);
        },
        TEST_TIMEOUT,
      );

      // ── 4. Chinese handling ────────────────────────────────────────────
      it(
        '中文处理: 中文输入/输出不乱码',
        async () => {
          const chineseInput =
            '请解释"千里之行始于足下"这句话的含义，用简体中文回答。';

          const result = await generateText({
            model,
            messages: [{ role: 'user', content: chineseInput }],
            maxOutputTokens: 512,
            temperature: 0.5,
          });

          const text = result.text;
          expect(text).toBeTruthy();

          // Should contain Chinese characters (not garbled)
          const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
          expect(chineseCharCount).toBeGreaterThan(5);

          // Should NOT contain common garbled patterns (replacement chars)
          expect(text).not.toContain('\uFFFD'); // Unicode replacement character
        },
        TEST_TIMEOUT,
      );
    });
  }

  // ── Registry completeness sanity check ───────────────────────────────
  describe('MODEL_REGISTRY consistency', () => {
    it('every model in PROVIDER_TEST_MODELS exists in MODEL_REGISTRY', () => {
      for (const modelId of Object.values(PROVIDER_TEST_MODELS)) {
        expect(MODEL_REGISTRY).toHaveProperty(modelId);
        expect(MODEL_META).toHaveProperty(modelId);
      }
    });

    it('all providers have env var mappings', () => {
      const providers = Array.from(
        new Set(Object.values(MODEL_META).map((m) => m.provider)),
      );
      for (const provider of providers) {
        expect(PROVIDER_KEY_MAP).toHaveProperty(provider);
      }
    });
  });
});
