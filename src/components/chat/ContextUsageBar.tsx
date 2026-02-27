'use client';

/**
 * S7.3 Context Usage Bar
 *
 * Shows context window usage at the bottom of the chat panel.
 * Color gradient: green < 70%, yellow 70-80%, orange 80-90%, red > 90%.
 */

interface ContextUsageBarProps {
  /** Context usage as a percentage (0-100+) */
  contextUsagePercent: number;
  /** Current token count */
  currentTokens: number;
  /** Max context window tokens */
  maxTokens: number;
  /** Number of conversation turns (messages) */
  messageCount: number;
  /** Display name of the current model */
  modelName: string;
}

function getUsageColor(percent: number): string {
  if (percent > 90) return 'bg-red-500';
  if (percent > 80) return 'bg-orange-500';
  if (percent > 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getTextColor(percent: number): string {
  if (percent > 90) return 'text-red-600';
  if (percent > 80) return 'text-orange-600';
  if (percent > 70) return 'text-yellow-600';
  return 'text-notion-text-secondary';
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

export function ContextUsageBar({
  contextUsagePercent,
  currentTokens,
  maxTokens,
  messageCount,
  modelName,
}: ContextUsageBarProps) {
  const clampedPercent = Math.min(contextUsagePercent, 100);
  const barColor = getUsageColor(contextUsagePercent);
  const textColor = getTextColor(contextUsagePercent);

  return (
    <div
      className="shrink-0 border-t border-notion-border px-3 py-1.5"
      data-testid="context-usage-bar"
    >
      {/* Progress bar */}
      <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-notion-bg-hover">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${clampedPercent}%` }}
          data-testid="context-usage-fill"
        />
      </div>

      {/* Stats line */}
      <div className={`flex items-center justify-between text-[10px] ${textColor}`}>
        <span data-testid="context-usage-percent">
          {Math.round(contextUsagePercent)}% {formatTokens(currentTokens)}/{formatTokens(maxTokens)}
        </span>
        <span>
          {messageCount} 轮 · {modelName}
        </span>
      </div>

      {/* Warning message */}
      {contextUsagePercent > 90 && (
        <div className="mt-1 text-[10px] text-red-600" data-testid="context-usage-warning">
          对话较长，建议归档后开启新会话
        </div>
      )}
      {contextUsagePercent > 80 && contextUsagePercent <= 90 && (
        <div className="mt-1 text-[10px] text-orange-600" data-testid="context-usage-warning">
          对话较长，已自动压缩历史消息
        </div>
      )}
    </div>
  );
}
