/**
 * S7.5 Tests: Tool Result Compression
 *
 * - Short result (< 500 tokens) → returned as-is
 * - Long result (> 500 tokens) → truncated to 500 tokens + ellipsis
 */
import { describe, it, expect } from 'vitest';
import { chatSummaryService, SUMMARY_CONFIG } from '@/services/chat-summary.service';

describe('compressToolResult (S7.2)', () => {
  const maxChars = SUMMARY_CONFIG.toolResultMaxTokens * SUMMARY_CONFIG.charsPerToken;

  it('returns short result as-is', () => {
    const shortResult = '{"success": true, "data": {"task": "买咖啡"}}';
    const compressed = chatSummaryService.compressToolResult(shortResult);
    expect(compressed).toBe(shortResult);
  });

  it('returns result at exactly maxChars as-is', () => {
    const exactResult = 'a'.repeat(maxChars);
    const compressed = chatSummaryService.compressToolResult(exactResult);
    expect(compressed).toBe(exactResult);
  });

  it('truncates result exceeding maxChars', () => {
    const longResult = 'a'.repeat(maxChars + 100);
    const compressed = chatSummaryService.compressToolResult(longResult);
    expect(compressed.length).toBeLessThan(longResult.length);
    expect(compressed).toContain('... [truncated]');
    // The actual content before truncation marker should be exactly maxChars
    const contentPart = compressed.replace('\n... [truncated]', '');
    expect(contentPart.length).toBe(maxChars);
  });

  it('respects custom maxTokens parameter', () => {
    const customMax = 100;
    const customMaxChars = customMax * SUMMARY_CONFIG.charsPerToken;
    const longResult = 'a'.repeat(customMaxChars + 50);

    const compressed = chatSummaryService.compressToolResult(longResult, customMax);
    const contentPart = compressed.replace('\n... [truncated]', '');
    expect(contentPart.length).toBe(customMaxChars);
  });

  it('handles empty string', () => {
    const compressed = chatSummaryService.compressToolResult('');
    expect(compressed).toBe('');
  });

  it('handles JSON tool result with many items', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i} with a really long name to pad the content`,
      status: 'TODO',
    }));
    const longJson = JSON.stringify(items);

    const compressed = chatSummaryService.compressToolResult(longJson);
    expect(compressed.length).toBeLessThanOrEqual(maxChars + 20); // +20 for truncation marker
    expect(compressed).toContain('... [truncated]');
  });

  it('preserves valid JSON structure for short results', () => {
    const validJson = JSON.stringify({ tasks: [{ id: '1', title: 'Test' }] });
    const compressed = chatSummaryService.compressToolResult(validJson);
    expect(() => JSON.parse(compressed)).not.toThrow();
  });
});
