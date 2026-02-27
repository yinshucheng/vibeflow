/**
 * ChatFAB Component
 *
 * Floating action button (bottom-right) that opens the Chat panel.
 * Visible on all screens.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useChatStore } from '@/store/chat.store';

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatFAB(): React.JSX.Element {
  const isPanelOpen = useChatStore((state) => state.isPanelOpen);
  const openPanel = useChatStore((state) => state.openPanel);

  if (isPanelOpen) {
    return <></>;
  }

  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={openPanel}
      accessibilityLabel="Open AI chat"
      accessibilityRole="button"
      testID="chat-fab"
    >
      <Text style={styles.fabIcon}>AI</Text>
    </TouchableOpacity>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ChatFAB;
