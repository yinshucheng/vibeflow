/**
 * ChatMessageList Component
 *
 * Renders the scrollable list of chat messages using FlatList.
 * Shows streaming content as the last item in the list (not overlaid).
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { useChatStore } from '@/store/chat.store';
import { ChatBubble } from './ChatBubble';
import type { ChatMessage } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

// Union type for list items: either a real message or the streaming placeholder
type ListItem = ChatMessage | { id: '__streaming__'; role: 'streaming'; content: string };

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatMessageList(): React.JSX.Element {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingContent = useChatStore((state) => state.streamingContent);
  const flatListRef = useRef<FlatList<ListItem>>(null);

  // Combine messages + streaming placeholder into a single list
  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [...messages];
    if (isStreaming && streamingContent.length > 0) {
      items.push({ id: '__streaming__', role: 'streaming', content: streamingContent });
    }
    return items;
  }, [messages, isStreaming, streamingContent]);

  // Auto-scroll to bottom when list data changes
  useEffect(() => {
    if (flatListRef.current && listData.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [listData.length, streamingContent]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.role === 'streaming') {
      return (
        <View style={styles.streamingContainer}>
          <View style={styles.streamingBubble}>
            <Text style={styles.streamingText}>{item.content}</Text>
          </View>
        </View>
      );
    }
    return <ChatBubble message={item as ChatMessage} />;
  };

  return (
    <View style={styles.container} testID="chat-message-list">
      <FlatList
        ref={flatListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
