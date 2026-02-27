import { vi } from 'vitest';

/**
 * LLM Mock tools for Chat service tests
 *
 * All Chat integration tests use these helpers instead of calling real LLM APIs.
 * Mocks target Vercel AI SDK's `streamText` and `generateText` from the 'ai' package.
 *
 * Usage:
 *   vi.mock('ai', () => ({ streamText: vi.fn(), generateText: vi.fn() }));
 *   import { streamText, generateText } from 'ai';
 *   // Then use helpers below to configure mock behaviour
 */

interface MockStreamChunk {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish';
  textDelta?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

interface MockTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Configure a mocked `streamText` to return a preset text response.
 * The returned object mimics the Vercel AI SDK StreamTextResult shape.
 */
export function mockStreamText(
  streamTextFn: ReturnType<typeof vi.fn>,
  response: string,
  usage?: Partial<MockTokenUsage>
) {
  const chunks = response.split('').map((char) => ({
    type: 'text-delta' as const,
    textDelta: char,
  }));

  const finalUsage: MockTokenUsage = {
    inputTokens: usage?.inputTokens ?? 10,
    outputTokens: usage?.outputTokens ?? response.length,
    totalTokens: usage?.totalTokens ?? (10 + response.length),
  };

  streamTextFn.mockImplementation((opts: Record<string, unknown>) => {
    // Trigger onFinish if provided
    if (typeof opts.onFinish === 'function') {
      (opts.onFinish as (result: { text: string; usage: MockTokenUsage }) => void)({
        text: response,
        usage: finalUsage,
      });
    }

    return createMockStreamResult(chunks, response, finalUsage);
  });
}

/**
 * Configure a mocked `streamText` to return a response with tool calls.
 * Simulates the LLM requesting tool execution, then returning final text.
 */
export function mockStreamTextWithToolUse(
  streamTextFn: ReturnType<typeof vi.fn>,
  toolCalls: Array<{
    toolCallId?: string;
    toolName: string;
    args: Record<string, unknown>;
  }>,
  finalText: string = 'Done.',
  usage?: Partial<MockTokenUsage>
) {
  const finalUsage: MockTokenUsage = {
    inputTokens: usage?.inputTokens ?? 50,
    outputTokens: usage?.outputTokens ?? 30,
    totalTokens: usage?.totalTokens ?? 80,
  };

  const chunks: MockStreamChunk[] = [];

  // Add tool call chunks
  for (const tc of toolCalls) {
    chunks.push({
      type: 'tool-call',
      toolCallId: tc.toolCallId ?? `call_${Math.random().toString(36).slice(2, 10)}`,
      toolName: tc.toolName,
      args: tc.args,
    });
  }

  // Add final text chunks
  for (const char of finalText) {
    chunks.push({ type: 'text-delta', textDelta: char });
  }

  streamTextFn.mockImplementation((opts: Record<string, unknown>) => {
    if (typeof opts.onFinish === 'function') {
      (opts.onFinish as (result: { text: string; usage: MockTokenUsage }) => void)({
        text: finalText,
        usage: finalUsage,
      });
    }

    return createMockStreamResult(chunks, finalText, finalUsage);
  });
}

/**
 * Configure a mocked `generateText` to return a preset response.
 */
export function mockGenerateText(
  generateTextFn: ReturnType<typeof vi.fn>,
  response: string,
  usage?: Partial<MockTokenUsage>
) {
  const finalUsage: MockTokenUsage = {
    inputTokens: usage?.inputTokens ?? 20,
    outputTokens: usage?.outputTokens ?? response.length,
    totalTokens: usage?.totalTokens ?? (20 + response.length),
  };

  generateTextFn.mockResolvedValue({
    text: response,
    usage: finalUsage,
    toolCalls: [],
    toolResults: [],
    finishReason: 'stop',
    warnings: [],
  });
}

/**
 * Create a mock StreamTextResult that mimics the Vercel AI SDK shape.
 */
function createMockStreamResult(
  chunks: MockStreamChunk[],
  fullText: string,
  usage: MockTokenUsage
) {
  // Create an async iterable for textStream
  async function* textStreamGenerator() {
    for (const chunk of chunks) {
      if (chunk.type === 'text-delta' && chunk.textDelta) {
        yield chunk.textDelta;
      }
    }
  }

  // Create an async iterable for fullStream
  async function* fullStreamGenerator() {
    for (const chunk of chunks) {
      yield chunk;
    }
    yield { type: 'finish' as const, usage };
  }

  return {
    textStream: textStreamGenerator(),
    fullStream: fullStreamGenerator(),
    text: Promise.resolve(fullText),
    usage: Promise.resolve(usage),
    toolCalls: Promise.resolve(
      chunks
        .filter((c) => c.type === 'tool-call')
        .map((c) => ({
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          args: c.args,
        }))
    ),
    toolResults: Promise.resolve([]),
    finishReason: Promise.resolve('stop' as const),
    warnings: Promise.resolve([]),
  };
}

export type { MockStreamChunk, MockTokenUsage };
