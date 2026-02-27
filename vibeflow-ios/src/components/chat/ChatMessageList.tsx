/**
 * ChatMessageList Component
 *
 * Renders the scrollable list of chat messages using FlatList.
 * Shows streaming content for the current AI response.
 */

import React, { useRef, useEffect } from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { useChatStore } from '@/store/chat.store';
import { ChatBubble } from './ChatBubble';
import type { ChatMessage } from '@/types';

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatMessageList(): React.JSX.Element {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingContent = useChatStore((state) => state.streamingContent);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length, streamingContent]);

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <ChatBubble message={item} />
  );

  return (
    <View style={styles.container} testID="chat-message-list">
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      {isStreaming && streamingContent.length > 0 && (
        <View style={styles.streamingContainer}>
          <View style={styles.streamingBubble}>
            <Text style={styles.streamingText}>{streamingContent}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  streamingContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'flex-start',
  },
  streamingBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    backgroundColor: '#E9E9EB',
  },
  streamingText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#000000',
  },
});

export default ChatMessageList;
