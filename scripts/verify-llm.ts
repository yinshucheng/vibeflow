/**
 * LLM 连通性验证脚本
 *
 * 用法:
 *   npx tsx scripts/verify-llm.ts              # 测试所有可用模型
 *   npx tsx scripts/verify-llm.ts --model qwen-plus  # 测试单个模型
 *
 * 需要在 .env 中配置对应 provider 的 API Key。
 */

import 'dotenv/config';
import { generateText, streamText } from 'ai';
import {
  MODEL_REGISTRY,
  MODEL_META,
  getModel,
  type ModelId,
} from '../src/config/llm.config';

const PROMPT = '你好，请用一句话介绍你自己。';
const TIMEOUT_MS = 30_000;

// ===== ANSI Colors =====
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// ===== Provider → env key mapping =====
const PROVIDER_KEY_MAP: Record<string, string> = {
  qwen: 'QWEN_API_KEY',
  kimi: 'KIMI_API_KEY',
  siliconflow: 'SILICONFLOW_API_KEY',
};

function hasApiKey(modelId: ModelId): boolean {
  const meta = MODEL_META[modelId];
  const envKey = PROVIDER_KEY_MAP[meta.provider];
  return !!envKey && !!process.env[envKey];
}

function truncate(s: string, maxLen: number): string {
  const clean = s.replace(/\n/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + '...' : clean;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// ===== generateText 测试 =====
async function testGenerateText(modelId: ModelId): Promise<void> {
  const start = Date.now();
  try {
    const model = getModel(modelId);
    const result = await withTimeout(
      generateText({
        model,
        messages: [{ role: 'user', content: PROMPT }],
        maxOutputTokens: 256,
      }),
      TIMEOUT_MS
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const text = truncate(result.text, 50);
    const tokens = result.usage.totalTokens ?? '?';
    const padded = modelId.padEnd(20);
    console.log(
      `${green('✅')} ${padded} | "${text}" | ${tokens} tokens | ${elapsed}s`
    );
  } catch (error) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const padded = modelId.padEnd(20);
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${red('❌')} ${padded} | Error: ${truncate(msg, 60)} | ${elapsed}s`);
  }
}

// ===== streamText 测试 =====
async function testStreamText(modelId: ModelId): Promise<void> {
  const start = Date.now();
  try {
    const model = getModel(modelId);
    const result = streamText({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      maxOutputTokens: 256,
    });

    let chunks = 0;
    let fullText = '';

    const textStream = result.textStream;
    const reader = textStream[Symbol.asyncIterator]();

    const streamPromise = (async () => {
      let next = await reader.next();
      while (!next.done) {
        chunks++;
        fullText += next.value;
        next = await reader.next();
      }
    })();

    await withTimeout(streamPromise, TIMEOUT_MS);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const text = truncate(fullText, 50);
    const padded = `${modelId} (stream)`.padEnd(20);
    console.log(
      `${green('✅')} ${padded} | chunks: ${chunks} | "${text}" | ${elapsed}s`
    );
  } catch (error) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const padded = `${modelId} (stream)`.padEnd(20);
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${red('❌')} ${padded} | Error: ${truncate(msg, 60)} | ${elapsed}s`);
  }
}

// ===== Main =====
async function main() {
  console.log(bold('\n[验证 LLM 连接]\n'));

  // 解析 --model 参数
  const args = process.argv.slice(2);
  const modelFlagIdx = args.indexOf('--model');
  const targetModel = modelFlagIdx >= 0 ? args[modelFlagIdx + 1] : null;

  const allModelIds = Object.keys(MODEL_REGISTRY) as ModelId[];

  // 过滤要测试的模型
  let modelsToTest: ModelId[];
  if (targetModel) {
    if (!allModelIds.includes(targetModel as ModelId)) {
      console.log(red(`未知模型: ${targetModel}`));
      console.log(dim(`可用模型: ${allModelIds.join(', ')}`));
      process.exit(1);
    }
    modelsToTest = [targetModel as ModelId];
  } else {
    modelsToTest = allModelIds.filter(hasApiKey);
  }

  if (modelsToTest.length === 0) {
    console.log(red('没有找到可用的 API Key。请在 .env 中配置:'));
    console.log(dim('  QWEN_API_KEY=...'));
    console.log(dim('  KIMI_API_KEY=...'));
    console.log(dim('  SILICONFLOW_API_KEY=...'));
    process.exit(1);
  }

  // 显示跳过的模型
  const skipped = allModelIds.filter((id) => !modelsToTest.includes(id));
  if (skipped.length > 0 && !targetModel) {
    console.log(dim(`跳过 (无 API Key): ${skipped.join(', ')}\n`));
  }

  // generateText 测试
  console.log(bold('非流式测试 (generateText):'));
  for (const modelId of modelsToTest) {
    await testGenerateText(modelId);
  }

  console.log('');

  // streamText 测试
  console.log(bold('流式测试 (streamText):'));
  for (const modelId of modelsToTest) {
    await testStreamText(modelId);
  }

  console.log('');
}

main().catch((err) => {
  console.error(red('Fatal error:'), err);
  process.exit(1);
});
