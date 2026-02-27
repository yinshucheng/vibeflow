/**
 * ChatBubble Component
 *
 * Renders a single chat message bubble.
 * User messages align right (blue), AI messages align left (gray).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ChatMessage } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface ChatBubbleProps {
  message: ChatMessage;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatBubble({ message }: ChatBubbleProps): React.JSX.Element {
  const isUser = message.role === 'user';

  return (
    <View
      style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}
      testID={`chat-bubble-${message.role}`}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
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
});

export default ChatBubble;
