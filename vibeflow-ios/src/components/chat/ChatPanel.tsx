/**
 * ChatPanel Component
 *
 * Bottom sheet container for the AI chat interface.
 * Supports half-screen and full-screen modes.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useChatStore } from '@/store/chat.store';
import { chatService } from '@/services/chat.service';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

// =============================================================================
// CONSTANTS
// =============================================================================

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HALF_HEIGHT = SCREEN_HEIGHT * 0.5;
const FULL_HEIGHT = SCREEN_HEIGHT * 0.92;

// =============================================================================
// COMPONENT
// =============================================================================

export function ChatPanel(): React.JSX.Element {
  const isPanelOpen = useChatStore((state) => state.isPanelOpen);
  const panelHeight = useChatStore((state) => state.panelHeight);
  const closePanel = useChatStore((state) => state.closePanel);
  const togglePanelHeight = useChatStore((state) => state.togglePanelHeight);
  const hasMessages = useChatStore((state) => state.messages.length > 0);
  const prevOpenRef = useRef(false);

  // Request history sync when panel opens (ensures messages are up-to-date)
  useEffect(() => {
    if (isPanelOpen && !prevOpenRef.current) {
      // Panel just opened — request fresh history if store is empty
      if (!hasMessages) {
        chatService.requestHistorySync();
      }
    }
    prevOpenRef.current = isPanelOpen;
  }, [isPanelOpen, hasMessages]);

  if (!isPanelOpen) {
    return <></>;
  }

  const height = panelHeight === 'full' ? FULL_HEIGHT : HALF_HEIGHT;

  return (
    <Modal
      visible={isPanelOpen}
      transparent
      animationType="slide"
      onRequestClose={closePanel}
      testID="chat-panel-modal"
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backdrop} onPress={closePanel} activeOpacity={1} />
        <View style={[styles.panel, { height }]} testID="chat-panel">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>AI 助手</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={togglePanelHeight}
                style={styles.headerButton}
                accessibilityLabel={panelHeight === 'half' ? 'Expand to full screen' : 'Collapse to half screen'}
                testID="chat-toggle-height"
              >
                <Text style={styles.headerButtonText}>
                  {panelHeight === 'half' ? '↕' : '↕'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={closePanel}
                style={styles.headerButton}
                accessibilityLabel="Close chat"
                testID="chat-close-button"
              >
                <Text style={styles.headerButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Message list */}
          <ChatMessageList />

          {/* Input + safe area bottom padding */}
          <ChatInput />
          <View style={styles.safeBottom} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    fontSize: 18,
    color: '#666666',
  },
  safeBottom: {
    height: 34, // iPhone home indicator area
  },
});

export default ChatPanel;
