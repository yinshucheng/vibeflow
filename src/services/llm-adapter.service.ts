import {
  streamText,
  generateText,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
  type StreamTextResult,
  type GenerateTextResult,
} from 'ai';
import { getModel, getSceneConfig, type ModelId } from '@/config/llm.config';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface CallLLMOptions {
  modelId?: ModelId;
  scene?: string;
  system?: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  maxOutputTokens?: number;
  temperature?: number;
  maxSteps?: number;
  onFinish?: (result: { text: string; usage: TokenUsage }) => void;
}

interface GenerateTextOptions {
  modelId?: ModelId;
  scene?: string;
  system?: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export const llmAdapterService = {
  /**
   * 流式调用 LLM
   * 优先使用 modelId，如果未指定则通过 scene 查找配置
   */
  async callLLM(options: CallLLMOptions): Promise<StreamTextResult<ToolSet, never>> {
    const {
      system,
      messages,
      tools,
      maxSteps,
      onFinish,
    } = options;

    const { modelId, maxOutputTokens, temperature } = resolveModelConfig(options);
    const model = getModel(modelId);

    const hasTools = tools && Object.keys(tools).length > 0;

    // 如果提供了 tools 但调用失败，fallback 到无 tools
    try {
      const result = streamText({
        model,
        system,
        messages,
        tools: hasTools ? tools : undefined,
        maxOutputTokens,
        temperature,
        stopWhen: hasTools ? stepCountIs(maxSteps ?? 5) : undefined,
        onFinish: onFinish
          ? ({ text, usage }) => {
              onFinish({
                text,
                usage: {
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                  totalTokens: usage.totalTokens ?? 0,
                },
              });
            }
          : undefined,
      });
      return result;
    } catch (error) {
      // 如果带 tools 失败，尝试不带 tools 重试
      if (hasTools) {
        console.warn(`[llm-adapter] streamText with tools failed for ${modelId}, retrying without tools:`, error);
        const result = streamText({
          model,
          system,
          messages,
          maxOutputTokens,
          temperature,
          onFinish: onFinish
            ? ({ text, usage }) => {
                onFinish({
                  text,
                  usage: {
                    inputTokens: usage.inputTokens ?? 0,
                    outputTokens: usage.outputTokens ?? 0,
                    totalTokens: usage.totalTokens ?? 0,
                  },
                });
              }
            : undefined,
        });
        return result;
      }
      throw error;
    }
  },

  /**
   * 非流式调用 LLM，用于摘要等不需要流式的场景
   */
  async callGenerateText(options: GenerateTextOptions): Promise<GenerateTextResult<ToolSet, never>> {
    const { system, messages } = options;
    const { modelId, maxOutputTokens, temperature } = resolveModelConfig(options);
    const model = getModel(modelId);

    const result = await generateText({
      model,
      system,
      messages,
      maxOutputTokens,
      temperature,
    });

    return result;
  },
};

/**
 * 解析模型配置：优先使用显式参数，fallback 到 scene 配置
 */
function resolveModelConfig(options: {
  modelId?: ModelId;
  scene?: string;
  maxOutputTokens?: number;
  temperature?: number;
}): { modelId: ModelId; maxOutputTokens: number; temperature: number } {
  if (options.modelId) {
    return {
      modelId: options.modelId,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    };
  }

  const sceneConfig = getSceneConfig(options.scene ?? 'chat:default');
  return {
    modelId: sceneConfig.model,
    maxOutputTokens: options.maxOutputTokens ?? sceneConfig.maxTokens,
    temperature: options.temperature ?? sceneConfig.temperature,
  };
}

export type { CallLLMOptions, GenerateTextOptions, TokenUsage };
