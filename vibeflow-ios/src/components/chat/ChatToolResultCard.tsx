/**
 * ChatToolResultCard Component
 *
 * Displays the result of a tool execution in the chat.
 * Success results show in green, failure in red.
 */

import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { ChatToolResultPayload } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface ChatToolResultCardProps {
  result: ChatToolResultPayload;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatToolResultCard({ result }: ChatToolResultCardProps): React.JSX.Element {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const isSuccess = result.success;

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      testID="chat-tool-result-card"
    >
      <View
        style={[
          styles.card,
          isSuccess ? styles.successCard : styles.failureCard,
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.icon}>{isSuccess ? '✅' : '❌'}</Text>
          <Text
            style={[
              styles.title,
              isSuccess ? styles.successTitle : styles.failureTitle,
            ]}
          >
            {isSuccess ? '操作成功' : '操作失败'}
          </Text>
        </View>
        <Text style={styles.summary}>{result.summary}</Text>
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
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  successCard: {
    backgroundColor: '#F0FFF0',
    borderColor: '#90EE90',
  },
  failureCard: {
    backgroundColor: '#FFF0F0',
    borderColor: '#FFB0B0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  icon: {
    fontSize: 14,
    marginRight: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  successTitle: {
    color: '#2D8B2D',
  },
  failureTitle: {
    color: '#CC3333',
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333333',
  },
});

export default ChatToolResultCard;
