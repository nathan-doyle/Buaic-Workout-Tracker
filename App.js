/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: App.js
 * Purpose: Application root and controller. Coordinates cross-platform audio ducking,
 *          system notifications (iOS permissions + Android channels), main tab switching,
 *          routine execution, active set logging, unit toggling, and workout completion.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  Platform,
  Modal,
} from 'react-native';

import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';

import {
  initDatabase,
  getExercisesBySplit,
  saveWorkoutSession,
  getLastExercisePerformance,
  deleteExercise,
} from './db/database';

import RestTimer from './components/RestTimer';
import PRTracker from './components/PRTracker';
import AddExerciseModal from './components/AddExerciseModal';
import CalendarModal from './components/CalendarModal';
import HistoryTracker from './components/HistoryTracker';
import WorkoutSummaryModal from './components/WorkoutSummaryModal';
import MuscleBalanceScreen from './components/MuscleBalanceScreen';

// Supported default routines
const DEFAULT_SPLITS = [
  'Push',
  'Pull',
  'Legs',
  'Anterior',
  'Posterior',
  'Upper',
  'Lower',
  'Full Body',
];

// Configure notifications to present alerts and sounds when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [activeTab, setActiveTab] = useState('workout'); // 'workout' | 'balance' | 'pr' | 'history'
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSplitDropdown, setShowSplitDropdown] = useState(false);

  const [selectedSplit, setSelectedSplit] = useState('Push');
  const [exercisesMap, setExercisesMap] = useState({});
  const [workoutData, setWorkoutData] = useState({});
  const [historyData, setHistoryData] = useState({});
  const [showRestTimer, setShowRestTimer] = useState(false);

  // Post-Workout Summary Recap State
  const [summaryData, setSummaryData] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Global Unit State ('kg' | 'lb')
  const [unit, setUnit] = useState('kg');

  // ==========================================
  // HARDWARE INITIALIZATION (CROSS-PLATFORM)
  // ==========================================
  useEffect(() => {
    const setupAudioAndNotifications = async () => {
      // Configure audio session to prevent ducking background music (Spotify/Apple Music)
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.log('Audio mode initialization error:', e);
      }

      // iOS: Explicit permission prompt (required before scheduling alarms)
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
          finalStatus = status;
        }
      } catch (e) {
        console.log('Notification permission request error:', e);
      }

      // Android: Configure high-priority alarm notification channel with vibration
      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('rest-timer', {
            name: 'Rest Timer Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 250, 500],
            sound: 'default',
            enableVibrate: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: true,
          });
        } catch (e) {
          console.log('Android notification channel setup error:', e);
        }
      }
    };

    initDatabase();
    setupAudioAndNotifications();
    loadSplitData(selectedSplit);
  }, []);

  // ==========================================
  // CONVERSION & ROUNDING HELPERS
  // ==========================================
  const roundToHalf = (num) => Math.round(num * 2) / 2;

  const convertWeight = (val, targetUnit) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    if (targetUnit === 'lb') {
      return String(Math.round(num * 2.20462));
    }
    return String(roundToHalf(num / 2.20462));
  };

  const handleToggleUnit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newUnit = unit === 'kg' ? 'lb' : 'kg';
    setUnit(newUnit);

    // Convert active table inputs instantly
    setWorkoutData((prev) => {
      const updatedWorkoutData = {};
      Object.keys(prev).forEach((splitKey) => {
        const splitData = prev[splitKey];
        const updatedSplitData = {};

        Object.keys(splitData).forEach((exId) => {
          updatedSplitData[exId] = splitData[exId].map((setRow) => ({
            ...setRow,
            weight: convertWeight(setRow.weight, newUnit),
          }));
        });

        updatedWorkoutData[splitKey] = updatedSplitData;
      });
      return updatedWorkoutData;
    });
  };

  // ==========================================
  // ROUTINE & EXERCISE DATA MANAGEMENT
  // ==========================================
  const loadSplitData = (split) => {
    const list = getExercisesBySplit(split);
    setExercisesMap((prev) => ({ ...prev, [split]: list }));

    const historyMap = {};
    list.forEach((ex) => {
      historyMap[ex.id] = getLastExercisePerformance(ex.id);
    });
    setHistoryData((prev) => ({ ...prev, ...historyMap }));

    setWorkoutData((prev) => {
      if (prev[split]) return prev;

      const initialSplitData = {};
      list.forEach((ex) => {
        const bestSet = historyMap[ex.id];
        let defaultWeight = '0';
        if (bestSet) {
          defaultWeight = unit === 'lb'
            ? String(Math.round(bestSet.weight * 2.20462))
            : String(roundToHalf(bestSet.weight));
        }
        const defaultReps = bestSet ? String(bestSet.reps) : '10';

        initialSplitData[ex.id] = [
          { setNumber: 1, weight: defaultWeight, reps: defaultReps, completed: false },
        ];
      });

      return { ...prev, [split]: initialSplitData };
    });
  };

  // ==========================================
  // SET ROW LOGIC (ADD, DELETE, UPDATE, DONE)
  // ==========================================
  const addSet = (exerciseId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWorkoutData((prev) => {
      const currentSplitData = prev[selectedSplit] || {};
      const currentSets = currentSplitData[exerciseId] || [];
      const lastSet = currentSets[currentSets.length - 1];
      const newSetNumber = currentSets.length + 1;

      const updatedSets = [
        ...currentSets,
        {
          setNumber: newSetNumber,
          weight: lastSet ? lastSet.weight : '0',
          reps: lastSet ? lastSet.reps : '10',
          completed: false,
        },
      ];

      return {
        ...prev,
        [selectedSplit]: { ...currentSplitData, [exerciseId]: updatedSets },
      };
    });
  };

  const handleLongPressSet = (exerciseId, index, setNumber) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert('Delete Set?', `Are you sure you want to remove Set ${setNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setWorkoutData((prev) => {
            const currentSplitData = prev[selectedSplit] || {};
            const currentSets = currentSplitData[exerciseId] || [];
            
            const updatedSets = currentSets
              .filter((_, i) => i !== index)
              .map((s, idx) => ({ ...s, setNumber: idx + 1 }));

            return {
              ...prev,
              [selectedSplit]: { ...currentSplitData, [exerciseId]: updatedSets },
            };
          });
        },
      },
    ]);
  };

  const updateSetData = (exerciseId, index, field, value) => {
    setWorkoutData((prev) => {
      const currentSplitData = prev[selectedSplit] || {};
      const updatedSets = [...(currentSplitData[exerciseId] || [])];
      updatedSets[index] = { ...updatedSets[index], [field]: value };

      return {
        ...prev,
        [selectedSplit]: { ...currentSplitData, [exerciseId]: updatedSets },
      };
    });
  };

  const toggleSetComplete = (exerciseId, index) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWorkoutData((prev) => {
      const currentSplitData = prev[selectedSplit] || {};
      const updatedSets = [...(currentSplitData[exerciseId] || [])];
      const isCompleting = !updatedSets[index].completed;

      updatedSets[index] = {
        ...updatedSets[index],
        completed: isCompleting,
      };

      if (isCompleting) {
        setShowRestTimer(true);
      }

      return {
        ...prev,
        [selectedSplit]: { ...currentSplitData, [exerciseId]: updatedSets },
      };
    });
  };

  const handleDeleteExercise = (exerciseId, exerciseName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert('Remove Exercise?', `Are you sure you want to remove ${exerciseName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const success = deleteExercise(exerciseId);
          if (success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Refresh state so it disappears globally
            setExercisesMap({});
            setWorkoutData({});
            loadSplitData(selectedSplit);
          }
        },
      },
    ]);
  };

  // ==========================================
  // FINISH WORKOUT & SUMMARY GENERATION
  // ==========================================
  const handleFinishWorkout = () => {
    const currentSplitData = workoutData[selectedSplit] || {};
    const currentExercises = exercisesMap[selectedSplit] || [];
    const setsToSave = [];
    const highlights = [];
    let calculatedVolume = 0;
    let newPRCount = 0;

    currentExercises.forEach((ex) => {
      const sets = currentSplitData[ex.id] || [];
      const completedSets = sets.filter((s) => s.completed);

      if (completedSets.length > 0) {
        let maxWeight = 0;
        let maxReps = 0;

        completedSets.forEach((s) => {
          let weightInKg = parseFloat(s.weight) || 0;
          if (unit === 'lb' && weightInKg > 0) {
            weightInKg = roundToHalf(weightInKg / 2.20462);
          }

          const repsNum = parseInt(s.reps, 10) || 0;
          calculatedVolume += weightInKg * repsNum;

          if (weightInKg > maxWeight) {
            maxWeight = weightInKg;
            maxReps = repsNum;
          }

          setsToSave.push({
            exerciseId: ex.id,
            setNumber: s.setNumber,
            weight: weightInKg,
            reps: repsNum,
          });
        });

        // PR calculation against all-time past best set
        const pastBest = historyData[ex.id];
        let isPR = false;
        if (!pastBest || maxWeight > pastBest.weight) {
          isPR = true;
          newPRCount += 1;
        }

        highlights.push({
          name: ex.name,
          variation: ex.variation,
          topWeight: maxWeight,
          topReps: maxReps,
          completedSetsCount: completedSets.length,
          isPR,
        });
      }
    });

    if (setsToSave.length === 0) {
      Alert.alert('No completed sets!', 'Complete at least one set before saving your workout.');
      return;
    }

    const success = saveWorkoutSession(selectedSplit, 'Session Logged', setsToSave);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setSummaryData({
        splitName: selectedSplit,
        totalVolume: calculatedVolume,
        totalSets: setsToSave.length,
        exerciseHighlights: highlights,
        newPRCount,
      });

      // Clear completed sets
      setWorkoutData((prev) => {
        const updated = { ...prev };
        delete updated[selectedSplit];
        return updated;
      });

      loadSplitData(selectedSplit);
      setShowSummaryModal(true);
    }
  };

  const currentExercises = exercisesMap[selectedSplit] || [];
  const currentWorkoutData = workoutData[selectedSplit] || {};

  return (
    <SafeAreaView style={styles.container}>
      {/* ==========================================
          HEADER APP BAR
          ========================================== */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>BUAIC</Text>
          <Text style={styles.subHeader}>WORKOUT TRACKER</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            style={styles.calendarBtn}
            onPress={() => setShowCalendar(true)}
          >
            <Text style={{ fontSize: 16 }}>📅</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.unitToggleTrack}
            onPress={handleToggleUnit}
          >
            <View style={[styles.unitThumb, unit === 'lb' && styles.unitThumbRight]} />
            <Text style={[styles.unitText, unit === 'kg' && styles.unitTextActive]}>KG</Text>
            <Text style={[styles.unitText, unit === 'lb' && styles.unitTextActive]}>LB</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ==========================================
          PRIMARY NAVIGATION TABS
          ========================================== */}
      <View style={styles.mainTabRow}>
        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'workout' && styles.activeMainTab]}
          onPress={() => setActiveTab('workout')}
        >
          <Text style={[styles.mainTabText, activeTab === 'workout' && styles.activeMainTabText]}>
            WORKOUT
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'balance' && styles.activeMainTab]}
          onPress={() => setActiveTab('balance')}
        >
          <Text style={[styles.mainTabText, activeTab === 'balance' && styles.activeMainTabText]}>
            COVERAGE
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'pr' && styles.activeMainTab]}
          onPress={() => setActiveTab('pr')}
        >
          <Text style={[styles.mainTabText, activeTab === 'pr' && styles.activeMainTabText]}>
            TOP SETS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTab, activeTab === 'history' && styles.activeMainTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.mainTabText, activeTab === 'history' && styles.activeMainTabText]}>
            HISTORY
          </Text>
        </TouchableOpacity>
      </View>

      {/* ==========================================
          ACTIVE SCREEN CONTENT
          ========================================== */}
      {activeTab === 'balance' ? (
        <MuscleBalanceScreen />
      ) : activeTab === 'pr' ? (
        <PRTracker unit={unit} />
      ) : activeTab === 'history' ? (
        <HistoryTracker unit={unit} />
      ) : (
        <View style={{ flex: 1 }}>
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
          <ScrollView style={styles.scrollList}>
            {currentExercises.map((item) => {
              const bestPastSet = historyData[item.id];
              let targetText = '—';
              if (bestPastSet) {
                const targetWeight = unit === 'lb'
                  ? Math.round(bestPastSet.weight * 2.20462)
                  : roundToHalf(bestPastSet.weight);
                targetText = `${targetWeight}${unit} × ${bestPastSet.reps}`;
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
                      onPress={() => handleDeleteExercise(item.id, item.name)}
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
                        onLongPress={() => handleLongPressSet(item.id, index, setRow.setNumber)}
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
                        value={setRow.weight}
                        onChangeText={(val) => updateSetData(item.id, index, 'weight', val)}
                      />

                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
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

            <TouchableOpacity style={styles.finishBtn} onPress={handleFinishWorkout}>
              <Text style={styles.finishBtnText}>FINISH WORKOUT</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ==========================================
          MODALS & OVERLAYS
          ========================================== */}
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
                  setSelectedSplit(split);
                  loadSplitData(split);
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

      {/* Background Floating Rest Timer */}
      {showRestTimer && (
        <RestTimer initialSeconds={90} onClose={() => setShowRestTimer(false)} />
      )}

      {/* Add Exercise Anatomical Modal */}
      <AddExerciseModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onExerciseAdded={() => loadSplitData(selectedSplit)}
      />

      {/* Monthly Activity Calendar Modal */}
      <CalendarModal visible={showCalendar} onClose={() => setShowCalendar(false)} />

      {/* Post-Workout Summary Recap & Share Card */}
      <WorkoutSummaryModal
        visible={showSummaryModal}
        summaryData={summaryData}
        unit={unit}
        onClose={() => setShowSummaryModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    paddingTop: 50,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitleGroup: {
    flexDirection: 'column',
  },
  headerTitle: {
    color: '#D4AF37',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 3,
  },
  subHeader: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 2,
  },
  calendarBtn: {
    width: 34,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitToggleTrack: {
    width: 74,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    position: 'relative',
  },
  unitThumb: {
    position: 'absolute',
    left: 2,
    width: 34,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#D4AF37',
  },
  unitThumbRight: {
    left: 36,
  },
  unitText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#666666',
    zIndex: 1,
  },
  unitTextActive: {
    color: '#000000',
  },
  mainTabRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 14,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 3,
  },
  mainTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeMainTab: {
    backgroundColor: '#D4AF37',
  },
  mainTabText: {
    color: '#A0A0A0',
    fontWeight: 'bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  activeMainTabText: {
    color: '#000000',
  },
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