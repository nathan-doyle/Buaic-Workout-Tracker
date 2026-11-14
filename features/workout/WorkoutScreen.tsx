/**
 * Workout tab: split picker, exercise set tables, add exercise, finish.
 *
 * V2 Phase 1b: V1's workout view moved out of `App.js` unchanged (markup and
 * styles, including V1's raw colours; Phase 3 replaces this screen).
 */
import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';

import AddExerciseModal from '../../components/AddExerciseModal';
import { formatWeight } from '../../lib/units';
import { DEFAULT_SPLITS, useWorkout } from './WorkoutProvider';

export default function WorkoutScreen() {
  const {
    unit,
    selectedSplit,
    selectSplit,
    reloadSelectedSplit,
    currentExercises,
    currentWorkoutData,
    historyData,
    addSet,
    confirmDeleteSet,
    updateSetData,
    toggleSetComplete,
    confirmDeleteExercise,
    finishWorkout,
  } = useWorkout();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showSplitDropdown, setShowSplitDropdown] = useState(false);

  // KeyboardAvoidingView computes the keyboard overlap from its layout frame, which is
  // relative to its parent. In V1 the parent started at the top of the screen; inside the
  // tab scene it starts below the header and tab row. Adding the scene's window offset
  // keeps V1's iOS keyboard padding (V1's own offset was 10). Android doesn't use it.
  const sceneRef = useRef<React.ComponentRef<typeof View>>(null);
  const [sceneTop, setSceneTop] = useState(0);
  const measureSceneTop = () => {
    if (Platform.OS !== 'ios') return;
    sceneRef.current?.measureInWindow((_x, y) => setSceneTop(y));
  };

  return (
    <>
      <View ref={sceneRef} style={{ flex: 1 }} onLayout={measureSceneTop}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 + sceneTop : 0}
        >
          {/* Split Dropdown Trigger */}
          <View style={styles.splitSelectorContainer}>
            <TouchableOpacity
              style={styles.splitDropdownBtn}
              onPress={() => setShowSplitDropdown(true)}
            >
              <Text style={styles.splitDropdownLabel}>ACTIVE SPLIT:</Text>
              <Text style={styles.splitDropdownValue}>{selectedSplit.toUpperCase()} ▼</Text>
            </TouchableOpacity>
          </View>

          {/* Exercise Table Cards */}
          <ScrollView
            style={styles.scrollList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {currentExercises.map((item) => {
              const bestPastSet = historyData[item.id];
              let targetText = '—';
              if (bestPastSet) {
                targetText = `${formatWeight(bestPastSet.weight, unit)}${unit} × ${bestPastSet.reps}`;
              }

              return (
                <View key={item.id} style={styles.exerciseCard}>
                  <View style={styles.exerciseHeader}>
                    <View style={styles.titleGroup}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.exerciseName}>{item.name}</Text>
                        {item.variation ? (
                          <Text style={styles.variationBadge}>{item.variation}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.targetMuscle}>{item.target_muscle}</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.removeExerciseBtn}
                      onPress={() => confirmDeleteExercise(item.id, item.name)}
                    >
                      <Text style={styles.removeExerciseText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Table Column Headers */}
                  <View style={styles.tableHeader}>
                    <Text style={[styles.thText, { width: 35 }]}>SET</Text>
                    <Text style={[styles.thText, { width: 85 }]}>TARGET</Text>
                    <Text style={[styles.thText, { flex: 1 }]}>{unit.toUpperCase()}</Text>
                    <Text style={[styles.thText, { flex: 1 }]}>REPS</Text>
                    <Text style={[styles.thText, { width: 48, textAlign: 'center' }]}>DONE</Text>
                  </View>

                  {/* Individual Set Rows */}
                  {(currentWorkoutData[item.id] || []).map((setRow, index) => (
                    <View
                      key={index}
                      style={[
                        styles.setRow,
                        setRow.completed && styles.completedRow,
                      ]}
                    >
                      <TouchableOpacity
                        onLongPress={() => confirmDeleteSet(item.id, index, setRow.setNumber)}
                        delayLongPress={400}
                        style={styles.setNumberBadge}
                      >
                        <Text style={styles.setNumberText}>{setRow.setNumber}</Text>
                      </TouchableOpacity>

                      <View style={styles.targetBadge}>
                        <Text style={styles.targetText}>{targetText}</Text>
                      </View>

                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        returnKeyType="done"
                        value={setRow.weight}
                        onChangeText={(val) => updateSetData(item.id, index, 'weight', val)}
                      />

                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        returnKeyType="done"
                        value={setRow.reps}
                        onChangeText={(val) => updateSetData(item.id, index, 'reps', val)}
                      />

                      <TouchableOpacity
                        style={[styles.checkBtn, setRow.completed && styles.checkBtnActive]}
                        onPress={() => toggleSetComplete(item.id, index)}
                      >
                        <Text style={styles.checkBtnText}>{setRow.completed ? '✓' : ''}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(item.id)}>
                    <Text style={styles.addSetText}>+ ADD SET</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity style={styles.addExerciseTrigger} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addExerciseTriggerText}>+ ADD EXERCISE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.finishBtn} onPress={finishWorkout}>
              <Text style={styles.finishBtnText}>FINISH WORKOUT</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Workout Split Selector Modal */}
      <Modal visible={showSplitDropdown} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSplitDropdown(false)}
        >
          <View style={styles.dropdownCard}>
            <Text style={styles.dropdownTitle}>SELECT WORKOUT SPLIT</Text>
            {DEFAULT_SPLITS.map((split) => (
              <TouchableOpacity
                key={split}
                style={[
                  styles.dropdownOption,
                  selectedSplit === split && styles.dropdownOptionActive,
                ]}
                onPress={() => {
                  selectSplit(split);
                  setShowSplitDropdown(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    selectedSplit === split && styles.dropdownOptionTextActive,
                  ]}
                >
                  {split}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Exercise Anatomical Modal */}
      <AddExerciseModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onExerciseAdded={reloadSelectedSplit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  splitSelectorContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  splitDropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#181818',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  splitDropdownLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  splitDropdownValue: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dropdownCard: {
    width: '100%',
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  dropdownTitle: {
    color: '#A0A0A0',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: '#222',
  },
  dropdownOptionActive: {
    backgroundColor: '#D4AF37',
  },
  dropdownOptionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dropdownOptionTextActive: {
    color: '#000',
  },
  scrollList: {
    paddingHorizontal: 16,
  },
  exerciseCard: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleGroup: {
    flexDirection: 'column',
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  variationBadge: {
    backgroundColor: '#262626',
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#383838',
  },
  targetMuscle: {
    color: '#A0A0A0',
    fontSize: 12,
    marginTop: 2,
  },
  removeExerciseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#410000',
    borderWidth: 1,
    borderColor: '#4b0000',
  },
  removeExerciseText: {
    color: '#980000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  thText: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  completedRow: {
    opacity: 0.6,
  },
  setNumberBadge: {
    width: 28,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNumberText: {
    color: '#D4AF37',
    fontWeight: 'bold',
    fontSize: 14,
  },
  targetBadge: {
    width: 80,
    backgroundColor: '#222222',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  targetText: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    backgroundColor: '#242424',
    color: '#FFF',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    textAlign: 'center',
    fontWeight: 'bold',
    borderWidth: 1,
    borderColor: '#333',
  },
  checkBtn: {
    width: 44,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  checkBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addSetBtn: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
  },
  addSetText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addExerciseTrigger: {
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 12,
  },
  addExerciseTriggerText: {
    color: '#D4AF37',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  finishBtn: {
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 40,
  },
  finishBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
