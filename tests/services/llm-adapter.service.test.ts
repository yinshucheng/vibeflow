import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @ai-sdk/openai before importing anything that uses it
vi.mock('@ai-sdk/openai', () => {
  const mockModel = { modelId: 'mock-model', provider: 'mock-provider' };
  const mockChatFn = vi.fn(() => mockModel);
  const mockProviderFn = vi.fn(() => mockModel);
  mockProviderFn.chat = mockChatFn;
  return {
    createOpenAI: vi.fn(() => mockProviderFn),
  };
});

// Mock ai SDK
vi.mock('ai', () => {
  return {
    streamText: vi.fn(),
    generateText: vi.fn(),
    stepCountIs: vi.fn((n: number) => ({ type: 'stepCount', count: n })),
  };
});

import { streamText, generateText } from 'ai';
import {
  getModel,
  getModelMeta,
  getSceneConfig,
  MODEL_META,
  MODEL_REGISTRY,
  DEFAULT_SCENE_CONFIG,
  isValidModelId,
  type ModelId,
} from '../../src/config/llm.config';
import { llmAdapterService } from '../../src/services/llm-adapter.service';

describe('llm.config', () => {
  describe('getModel', () => {
    it('should return a model instance for a registered modelId', () => {
      const model = getModel('qwen-plus');
      expect(model).toBeDefined();
    });

    it('should throw for unknown modelId', () => {
      expect(() => getModel('nonexistent' as ModelId)).toThrow(
        /Unknown model ID: nonexistent/
      );
    });

    it('should return instances for all registered models', () => {
      const modelIds = Object.keys(MODEL_REGISTRY) as ModelId[];
      for (const id of modelIds) {
        expect(() => getModel(id)).not.toThrow();
      }
    });
  });

  describe('getModelMeta', () => {
    it('should return metadata for a registered modelId', () => {
      const meta = getModelMeta('qwen-plus');
      expect(meta).toHaveProperty('contextWindow');
      expect(meta).toHaveProperty('maxOutputTokens');
      expect(meta).toHaveProperty('provider');
      expect(meta).toHaveProperty('displayName');
    });

    it('should throw for unknown modelId', () => {
      expect(() => getModelMeta('nonexistent' as ModelId)).toThrow(
        /Unknown model ID/
      );
    });
  });

  describe('MODEL_META invariants', () => {
    it('every MODEL_REGISTRY key has a corresponding MODEL_META entry', () => {
      const registryKeys = Object.keys(MODEL_REGISTRY);
      const metaKeys = Object.keys(MODEL_META);
      for (const key of registryKeys) {
        expect(metaKeys).toContain(key);
      }
    });

    it('contextWindow > maxOutputTokens for all models', () => {
      const modelIds = Object.keys(MODEL_META) as ModelId[];
      for (const id of modelIds) {
        const meta = MODEL_META[id];
        expect(meta.contextWindow).toBeGreaterThan(meta.maxOutputTokens);
      }
    });

    it('all models have non-empty provider and displayName', () => {
      const modelIds = Object.keys(MODEL_META) as ModelId[];
      for (const id of modelIds) {
        const meta = MODEL_META[id];
        expect(meta.provider.length).toBeGreaterThan(0);
        expect(meta.displayName.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isValidModelId', () => {
    it('returns true for registered model IDs', () => {
      expect(isValidModelId('qwen-plus')).toBe(true);
      expect(isValidModelId('kimi-32k')).toBe(true);
      expect(isValidModelId('sf-deepseek-v3')).toBe(true);
    });

    it('returns false for unknown model IDs', () => {
      expect(isValidModelId('nonexistent')).toBe(false);
      expect(isValidModelId('')).toBe(false);
    });
  });

  describe('getSceneConfig', () => {
    it('returns config for known scenes', () => {
      const config = getSceneConfig('chat:default');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('maxTokens');
      expect(config).toHaveProperty('temperature');
      expect(config).toHaveProperty('toolsEnabled');
    });

    it('falls back to chat:default for unknown scenes', () => {
      const config = getSceneConfig('unknown:scene');
      const defaultConfig = DEFAULT_SCENE_CONFIG['chat:default'];
      expect(config.model).toBe(defaultConfig.model);
    });

    it('respects environment variable override', () => {
      const originalEnv = process.env.LLM_MODEL_CHAT_DEFAULT;
      process.env.LLM_MODEL_CHAT_DEFAULT = 'kimi-32k';

      const config = getSceneConfig('chat:default');
      expect(config.model).toBe('kimi-32k');

      if (originalEnv !== undefined) {
        process.env.LLM_MODEL_CHAT_DEFAULT = originalEnv;
      } else {
        delete process.env.LLM_MODEL_CHAT_DEFAULT;
      }
    });

    it('ignores invalid environment variable override', () => {
      const originalEnv = process.env.LLM_MODEL_CHAT_DEFAULT;
      process.env.LLM_MODEL_CHAT_DEFAULT = 'invalid-model';

      const config = getSceneConfig('chat:default');
      const defaultConfig = DEFAULT_SCENE_CONFIG['chat:default'];
      expect(config.model).toBe(defaultConfig.model);

      if (originalEnv !== undefined) {
        process.env.LLM_MODEL_CHAT_DEFAULT = originalEnv;
      } else {
        delete process.env.LLM_MODEL_CHAT_DEFAULT;
      }
    });
  });
});

describe('llmAdapterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callLLM', () => {
    it('should call streamText with correct parameters', async () => {
      const mockResult = { textStream: {} };
      vi.mocked(streamText).mockReturnValue(mockResult as unknown as ReturnType<typeof streamText>);

      const result = await llmAdapterService.callLLM({
        modelId: 'qwen-plus',
        system: 'You are helpful.',
        messages: [{ role: 'user', content: '你好' }],
        maxOutputTokens: 1024,
        temperature: 0.5,
      });

      expect(streamText).toHaveBeenCalledOnce();
      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: '你好' }],
          maxOutputTokens: 1024,
          temperature: 0.5,
        })
      );
      expect(result).toBe(mockResult);
    });

    it('should use scene config when modelId is not provided', async () => {
      const mockResult = { textStream: {} };
      vi.mocked(streamText).mockReturnValue(mockResult as unknown as ReturnType<typeof streamText>);

      await llmAdapterService.callLLM({
        scene: 'chat:quick_action',
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 1024,
          temperature: 0.3,
        })
      );
    });

    it('should pass tools when provided', async () => {
      const mockResult = { textStream: {} };
      vi.mocked(streamText).mockReturnValue(mockResult as unknown as ReturnType<typeof streamText>);

      const mockTool = {
        description: 'A test tool',
        parameters: { type: 'object' as const, properties: {} },
        execute: vi.fn(),
      };

      await llmAdapterService.callLLM({
        modelId: 'qwen-plus',
        messages: [{ role: 'user', content: 'use tool' }],
        tools: { testTool: mockTool as never },
      });

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: { testTool: mockTool },
        })
      );
    });

    it('should retry without tools on failure when tools are provided', async () => {
      const mockResult = { textStream: {} };

      // First call throws, second succeeds
      vi.mocked(streamText)
        .mockImplementationOnce(() => {
          throw new Error('Tool use not supported');
        })
        .mockReturnValueOnce(mockResult as unknown as ReturnType<typeof streamText>);

      const mockTool = {
        description: 'A test tool',
        parameters: { type: 'object' as const, properties: {} },
        execute: vi.fn(),
      };

      const result = await llmAdapterService.callLLM({
        modelId: 'qwen-plus',
        messages: [{ role: 'user', content: 'use tool' }],
        tools: { testTool: mockTool as never },
      });

      expect(streamText).toHaveBeenCalledTimes(2);
      // Second call should not include tools
      const secondCall = vi.mocked(streamText).mock.calls[1][0] as Record<string, unknown>;
      expect(secondCall.tools).toBeUndefined();
      expect(result).toBe(mockResult);
    });

    it('should throw when failing without tools', async () => {
      vi.mocked(streamText).mockImplementation(() => {
        throw new Error('API Error');
      });

      await expect(
        llmAdapterService.callLLM({
          modelId: 'qwen-plus',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('API Error');
    });

    it('should invoke onFinish callback with correct usage fields', async () => {
      const onFinish = vi.fn();

      vi.mocked(streamText).mockImplementation((opts: Record<string, unknown>) => {
        // Simulate the onFinish being called by the SDK
        if (typeof opts.onFinish === 'function') {
          (opts.onFinish as (result: {
            text: string;
            usage: { inputTokens: number; outputTokens: number; totalTokens: number };
          }) => void)({
            text: 'Hello',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          });
        }
        return { textStream: {} } as unknown as ReturnType<typeof streamText>;
      });

      await llmAdapterService.callLLM({
        modelId: 'qwen-plus',
        messages: [{ role: 'user', content: 'test' }],
        onFinish,
      });

      expect(onFinish).toHaveBeenCalledWith({
        text: 'Hello',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      });
    });
  });

  describe('callGenerateText', () => {
    it('should call generateText with correct parameters', async () => {
      const mockResult = {
        text: 'Generated text',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      };

      vi.mocked(generateText).mockResolvedValue(mockResult as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await llmAdapterService.callGenerateText({
        modelId: 'qwen-plus',
        system: 'Summarize.',
        messages: [{ role: 'user', content: 'Some text' }],
        maxOutputTokens: 2048,
        temperature: 0.3,
      });

      expect(generateText).toHaveBeenCalledOnce();
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'Summarize.',
          messages: [{ role: 'user', content: 'Some text' }],
          maxOutputTokens: 2048,
          temperature: 0.3,
        })
      );
      expect(result).toBe(mockResult);
    });

    it('should use scene config defaults when no explicit params', async () => {
      const mockResult = {
        text: 'Result',
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };

      vi.mocked(generateText).mockResolvedValue(mockResult as unknown as Awaited<ReturnType<typeof generateText>>);

      await llmAdapterService.callGenerateText({
        scene: 'chat:summary',
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: 2048,
          temperature: 0.3,
        })
      );
    });
  });
});
