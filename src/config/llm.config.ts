import { createOpenAI } from '@ai-sdk/openai';

// ===== Provider 初始化 =====

// Qwen (通义千问 — 阿里云 DashScope OpenAI 兼容)
const qwen = createOpenAI({
  baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY || '',
});

// Kimi (月之暗面 — Moonshot AI)
const kimi = createOpenAI({
  baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
  apiKey: process.env.KIMI_API_KEY || '',
});

// SiliconFlow (硅基流动 — 聚合平台)
const siliconflow = createOpenAI({
  baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
  apiKey: process.env.SILICONFLOW_API_KEY || '',
});

// ===== MODEL_REGISTRY =====
// 按 provider 分组，lazy 实例化
const MODEL_REGISTRY = {
  // Qwen
  'qwen-max': () => qwen('qwen-max'),
  'qwen-plus': () => qwen('qwen-plus'),
  'qwen-turbo': () => qwen('qwen-turbo'),

  // Kimi
  'kimi-128k': () => kimi('moonshot-v1-128k'),
  'kimi-32k': () => kimi('moonshot-v1-32k'),
  'kimi-8k': () => kimi('moonshot-v1-8k'),

  // SiliconFlow (聚合多种模型)
  'sf-deepseek-v3': () => siliconflow('deepseek-ai/DeepSeek-V3'),
  'sf-deepseek-r1': () => siliconflow('deepseek-ai/DeepSeek-R1'),
  'sf-qwen-72b': () => siliconflow('Qwen/Qwen2.5-72B-Instruct'),
  'sf-qwen-32b': () => siliconflow('Qwen/Qwen2.5-32B-Instruct'),
} as const;

type ModelId = keyof typeof MODEL_REGISTRY;

// ===== MODEL_META =====
const MODEL_META: Record<ModelId, {
  contextWindow: number;
  maxOutputTokens: number;
  provider: string;
  displayName: string;
}> = {
  // Qwen
  'qwen-max': {
    contextWindow: 32768,
    maxOutputTokens: 8192,
    provider: 'qwen',
    displayName: 'Qwen Max',
  },
  'qwen-plus': {
    contextWindow: 131072,
    maxOutputTokens: 8192,
    provider: 'qwen',
    displayName: 'Qwen Plus',
  },
  'qwen-turbo': {
    contextWindow: 131072,
    maxOutputTokens: 8192,
    provider: 'qwen',
    displayName: 'Qwen Turbo',
  },

  // Kimi
  'kimi-128k': {
    contextWindow: 131072,
    maxOutputTokens: 8192,
    provider: 'kimi',
    displayName: 'Kimi 128K',
  },
  'kimi-32k': {
    contextWindow: 32768,
    maxOutputTokens: 8192,
    provider: 'kimi',
    displayName: 'Kimi 32K',
  },
  'kimi-8k': {
    contextWindow: 8192,
    maxOutputTokens: 4096,
    provider: 'kimi',
    displayName: 'Kimi 8K',
  },

  // SiliconFlow
  'sf-deepseek-v3': {
    contextWindow: 65536,
    maxOutputTokens: 8192,
    provider: 'siliconflow',
    displayName: 'DeepSeek V3 (SiliconFlow)',
  },
  'sf-deepseek-r1': {
    contextWindow: 65536,
    maxOutputTokens: 8192,
    provider: 'siliconflow',
    displayName: 'DeepSeek R1 (SiliconFlow)',
  },
  'sf-qwen-72b': {
    contextWindow: 32768,
    maxOutputTokens: 8192,
    provider: 'siliconflow',
    displayName: 'Qwen 2.5 72B (SiliconFlow)',
  },
  'sf-qwen-32b': {
    contextWindow: 32768,
    maxOutputTokens: 8192,
    provider: 'siliconflow',
    displayName: 'Qwen 2.5 32B (SiliconFlow)',
  },
};

// ===== 场景配置 =====
interface SceneModelConfig {
  model: ModelId;
  maxTokens: number;
  temperature: number;
  toolsEnabled: boolean;
}

// 环境变量覆盖映射: scene key -> env var name
const SCENE_ENV_MAP: Record<string, string> = {
  'chat:default': 'LLM_MODEL_CHAT_DEFAULT',
  'chat:quick_action': 'LLM_MODEL_CHAT_QUICK_ACTION',
  'chat:summary': 'LLM_MODEL_CHAT_SUMMARY',
  'chat:decompose': 'LLM_MODEL_CHAT_DECOMPOSE',
};

const DEFAULT_SCENE_CONFIG: Record<string, SceneModelConfig> = {
  'chat:default': {
    model: 'qwen-plus',
    maxTokens: 4096,
    temperature: 0.7,
    toolsEnabled: true,
  },
  'chat:quick_action': {
    model: 'qwen-turbo',
    maxTokens: 1024,
    temperature: 0.3,
    toolsEnabled: true,
  },
  'chat:summary': {
    model: 'qwen-plus',
    maxTokens: 2048,
    temperature: 0.3,
    toolsEnabled: false,
  },
  'chat:decompose': {
    model: 'qwen-plus',
    maxTokens: 2048,
    temperature: 0.5,
    toolsEnabled: false,
  },
};

// ===== 导出函数 =====

function isValidModelId(id: string): id is ModelId {
  return id in MODEL_REGISTRY;
}

function getModel(modelId: ModelId) {
  const factory = MODEL_REGISTRY[modelId];
  if (!factory) {
    throw new Error(`Unknown model ID: ${modelId}. Available models: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
  }
  return factory();
}

function getModelMeta(modelId: ModelId) {
  const meta = MODEL_META[modelId];
  if (!meta) {
    throw new Error(`Unknown model ID: ${modelId}`);
  }
  return meta;
}

function getSceneConfig(scene: string): SceneModelConfig {
  const base = DEFAULT_SCENE_CONFIG[scene];
  if (!base) {
    return DEFAULT_SCENE_CONFIG['chat:default'];
  }

  // 检查环境变量覆盖
  const envKey = SCENE_ENV_MAP[scene];
  if (envKey) {
    const envModel = process.env[envKey];
    if (envModel && isValidModelId(envModel)) {
      return { ...base, model: envModel };
    }
  }

  return base;
}

export {
  MODEL_REGISTRY,
  MODEL_META,
  DEFAULT_SCENE_CONFIG,
  getModel,
  getModelMeta,
  getSceneConfig,
  isValidModelId,
};
export type { ModelId, SceneModelConfig };
