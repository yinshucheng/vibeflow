import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useAppStore } from '@/store/app.store';
import { actionService } from '@/services/action.service';

export const Top3Selector: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const { todayTasks, top3Tasks, optimisticSetTop3, confirmOptimisticUpdate, rollbackOptimisticUpdate } = useAppStore();
  const [selected, setSelected] = useState<string[]>(top3Tasks.map((t) => t.id));

  const availableTasks = todayTasks.filter((t) => t.status !== 'completed');

  const toggleTask = (taskId: string) => {
    setSelected((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : prev.length < 3 ? [...prev, taskId] : prev
    );
  };

  const handleSave = async () => {
    const optimisticId = optimisticSetTop3(selected);
    setVisible(false);

    const result = await actionService.setTop3(selected);
    if (result.success) {
      confirmOptimisticUpdate(optimisticId);
    } else {
      rollbackOptimisticUpdate(optimisticId);
    }
  };

  const openModal = () => {
    setSelected(top3Tasks.map((t) => t.id));
    setVisible(true);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={openModal} style={styles.header}>
        <Text style={styles.title}>⭐ Top 3 ({top3Tasks.length}/3)</Text>
        <Text style={styles.editBtn}>编辑</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>选择 Top 3 任务</Text>
            <FlatList
              data={availableTasks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.taskItem} onPress={() => toggleTask(item.id)}>
                  <Text style={styles.checkbox}>{selected.includes(item.id) ? '☑' : '☐'}</Text>
                  <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.cancelBtn}>
                <Text>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  editBtn: { color: '#007AFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  taskItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  checkbox: { fontSize: 20, marginRight: 12 },
  taskTitle: { flex: 1, fontSize: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  cancelBtn: { padding: 12 },
  saveBtn: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
