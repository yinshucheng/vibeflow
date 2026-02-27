/**
 * ChatToolCallCard Component
 *
 * Displays a tool call confirmation card in the chat.
 * Shows operation description, parameter preview, and confirm/cancel buttons
 * for high-risk operations that require user approval.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import type { PendingToolCall } from '@/types';
import { chatService } from '@/services/chat.service';

// =============================================================================
// TYPES
// =============================================================================

interface ChatToolCallCardProps {
  toolCall: PendingToolCall;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Human-readable labels for tool names */
const TOOL_LABELS: Record<string, string> = {
  flow_delete_task: '删除任务',
  flow_batch_update_tasks: '批量更新任务',
  flow_update_project: '更新项目',
  flow_move_task: '移动任务',
  flow_set_top3: '设定 Top 3',
  flow_set_plan_date: '设定计划日期',
};

// =============================================================================
// HELPERS
// =============================================================================

/** Format parameters into a readable preview */
function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n');
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatToolCallCard({ toolCall }: ChatToolCallCardProps): React.JSX.Element {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const label = TOOL_LABELS[toolCall.toolName] ?? toolCall.toolName;
  const paramPreview = formatParams(toolCall.parameters);

  const handleConfirm = () => {
    chatService.confirmToolCall(toolCall.conversationId, toolCall.toolCallId);
  };

  const handleCancel = () => {
    chatService.cancelToolCall(toolCall.conversationId, toolCall.toolCallId);
  };

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      testID="chat-tool-call-card"
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>确认操作</Text>
        </View>

        <Text style={styles.description}>{toolCall.description || label}</Text>

        {paramPreview.length > 0 && (
          <View style={styles.paramBox}>
            <Text style={styles.paramText}>{paramPreview}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            testID="tool-call-cancel"
          >
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirm}
            testID="tool-call-confirm"
          >
            <Text style={styles.confirmText}>确认</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'flex-start',
  },
  card: {
    maxWidth: '85%',
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0D060',
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 16,
    marginRight: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B6914',
  },
  description: {
    fontSize: 15,
    lineHeight: 20,
    color: '#333333',
    marginBottom: 8,
  },
  paramBox: {
    backgroundColor: '#FFF4CC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  paramText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#555555',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E9E9EB',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  confirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ChatToolCallCard;
