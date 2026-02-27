/**
 * ChatInput Component
 *
 * Text input with send button for composing chat messages.
 */

import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { chatService } from '@/services/chat.service';
import { useChatStore } from '@/store/chat.store';

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatInput(): React.JSX.Element {
  const [text, setText] = useState('');
  const isStreaming = useChatStore((state) => state.isStreaming);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    chatService.sendMessage(trimmed);
    setText('');
  };

  return (
    <View style={styles.container} testID="chat-input">
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Ask AI..."
        placeholderTextColor="#999"
        multiline
        maxLength={2000}
        returnKeyType="send"
        onSubmitEditing={handleSend}
        editable={!isStreaming}
        testID="chat-text-input"
      />
      <TouchableOpacity
        style={[styles.sendButton, (!text.trim() || isStreaming) && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={!text.trim() || isStreaming}
        accessibilityLabel="Send message"
        accessibilityRole="button"
        testID="chat-send-button"
      >
        <Text style={styles.sendIcon}>↑</Text>
      </TouchableOpacity>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    fontSize: 16,
    color: '#000000',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#C0C0C0',
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default ChatInput;
