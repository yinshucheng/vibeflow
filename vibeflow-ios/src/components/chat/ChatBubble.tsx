/**
 * ChatBubble Component
 *
 * Renders a single chat message bubble.
 * User messages align right (blue), AI messages align left (gray).
 * Proactive AI messages (S4.3) get a distinct visual style with trigger label.
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import type { ChatMessage } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface ChatBubbleProps {
  message: ChatMessage;
}

// =============================================================================
// TRIGGER LABEL MAP
// =============================================================================

const TRIGGER_LABELS: Record<string, string> = {
  on_planning_enter: '📋 每日规划',
  on_rest_enter: '🍅 番茄钟完成',
  on_over_rest_enter: '⏰ 休息提醒',
  over_rest_escalation: '⏰ 休息超时',
  task_stuck: '🔧 任务建议',
};

function getTriggerLabel(triggerId?: string): string | null {
  if (!triggerId) return 'AI 助手';
  // Handle task-specific trigger IDs like "task_stuck:uuid"
  const baseId = triggerId.split(':')[0];
  return TRIGGER_LABELS[baseId] ?? 'AI 助手';
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatBubble({ message }: ChatBubbleProps): React.JSX.Element {
  const isUser = message.role === 'user';
  const isProactive = message.metadata?.isProactive === true;

  if (isProactive) {
    const label = getTriggerLabel(message.metadata?.triggerId as string | undefined);
    return (
      <View
        style={[styles.container, styles.assistantContainer]}
        testID="chat-bubble-proactive"
      >
        {label && (
          <View style={styles.proactiveLabel}>
            <Text style={styles.proactiveLabelText}>{label}</Text>
          </View>
        )}
        <View style={[styles.bubble, styles.proactiveBubble]}>
          <Text selectable style={[styles.text, styles.proactiveText]}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}
      testID={`chat-bubble-${message.role}`}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text selectable style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#E9E9EB',
    borderBottomLeftRadius: 4,
  },
  proactiveBubble: {
    backgroundColor: '#FFF3E0',
    borderBottomLeftRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  proactiveLabel: {
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  proactiveLabelText: {
    fontSize: 11,
    color: '#E65100',
    fontWeight: '600',
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#000000',
  },
  proactiveText: {
    color: '#212121',
  },
});

export default ChatBubble;
