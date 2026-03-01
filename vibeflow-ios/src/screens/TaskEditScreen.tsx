import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActionSheetIOS } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/app.store';
import { actionService } from '@/services/action.service';
import { chatService } from '@/services/chat.service';
import { useChatStore } from '@/store/chat.store';
import { useTheme } from '@/theme';

interface Props {
  taskId: string;
  onClose: () => void;
}

const PRIORITIES = ['P1', 'P2', 'P3'] as const;

export function TaskEditScreen({ taskId, onClose }: Props): React.JSX.Element {
  const theme = useTheme();
  const { todayTasks, top3Tasks } = useAppStore();
  const task = [...todayTasks, ...top3Tasks].find((t) => t.id === taskId);

  const [title, setTitle] = useState(task?.title ?? '');
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>(task?.priority ?? 'P2');
  const [saving, setSaving] = useState(false);

  if (!task) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.text }}>任务不存在</Text>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    await actionService.updateTask(taskId, { title: title.trim(), priority });
    setSaving(false);
    onClose();
  };

  const handleAskAI = () => {
    const attachment = { type: 'task' as const, id: taskId, title: task.title };
    const store = useChatStore.getState();
    store.sendMessageWithAttachments(`帮我分析一下这个任务`, [attachment]);
    chatService.sendMessage(`帮我分析一下这个任务`, [attachment]);
    onClose();
  };

  const showPriorityPicker = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['取消', 'P1 - 紧急', 'P2 - 普通', 'P3 - 低'], cancelButtonIndex: 0 },
      (idx) => { if (idx > 0) setPriority(PRIORITIES[idx - 1]); }
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: theme.colors.primary }}>取消</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>编辑任务</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={{ color: saving ? theme.colors.textMuted : theme.colors.primary }}>
            {saving ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>标题</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder="任务标题"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={[styles.label, { color: theme.colors.textMuted }]}>优先级</Text>
        <TouchableOpacity style={[styles.picker, { borderColor: theme.colors.border }]} onPress={showPriorityPicker}>
          <Text style={{ color: theme.colors.text }}>{priority}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.askAIButton, { backgroundColor: theme.colors.primary }]} onPress={handleAskAI}>
          <Text style={styles.askAIText}>问 AI</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  content: { padding: 16 },
  label: { fontSize: 14, marginBottom: 8, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  picker: { borderWidth: 1, borderRadius: 8, padding: 12 },
  askAIButton: { marginTop: 24, borderRadius: 8, padding: 14, alignItems: 'center' },
  askAIText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
