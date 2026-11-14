/**
 * Active-workout state shared by the tab shell (header unit toggle, rest timer,
 * summary) and the Workout tab.
 *
 * V2 Phase 1b: this is V1's `App.js` controller logic moved out of the root
 * component unchanged — including V1's 2.20462 conversion, 0.5 kg rounding and
 * in-memory workout state. Phase 2/3 replace it (exact units, crash-safe
 * in-progress sessions); see V2_PROGRESS.md.
 */
import React, { createContext, use, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';

import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { setAudioModeAsync } from 'expo-audio';

import {
  initDatabase,
  getExercisesBySplit,
  saveWorkoutSession,
  getLastExercisePerformance,
  deleteExercise,
  type ExerciseRow,
  type PastSet,
  type SetLogInput,
} from '../../db/database';
import type { WeightUnit } from '../../lib/units';

// Supported default routines
export const DEFAULT_SPLITS = [
  'Push',
  'Pull',
  'Legs',
  'Anterior',
  'Posterior',
  'Upper',
  'Lower',
  'Full Body',
];

/** A set row being edited on the Workout tab (inputs are kept as typed text). */
export interface SetRow {
  setNumber: number;
  weight: string;
  reps: string;
  completed: boolean;
}

/** Set rows per exercise id for one split. */
export type SplitWorkout = Record<number, SetRow[]>;

export interface ExerciseHighlight {
  name: string;
  variation: string | null;
  topWeight: number;
  topReps: number;
  completedSetsCount: number;
  isPR: boolean;
}

export interface WorkoutSummary {
  splitName: string;
  totalVolume: number;
  totalSets: number;
  exerciseHighlights: ExerciseHighlight[];
  newPRCount: number;
}

interface WorkoutContextValue {
  unit: WeightUnit;
  toggleUnit: () => void;

  selectedSplit: string;
  selectSplit: (split: string) => void;
  /** Re-reads the selected split's exercises (after one is added). */
  reloadSelectedSplit: () => void;
  currentExercises: ExerciseRow[];
  currentWorkoutData: SplitWorkout;
  historyData: Record<number, PastSet | null>;

  addSet: (exerciseId: number) => void;
  confirmDeleteSet: (exerciseId: number, index: number, setNumber: number) => void;
  updateSetData: (exerciseId: number, index: number, field: 'weight' | 'reps', value: string) => void;
  toggleSetComplete: (exerciseId: number, index: number) => void;
  confirmDeleteExercise: (exerciseId: number, exerciseName: string) => void;
  finishWorkout: () => void;

  showRestTimer: boolean;
  closeRestTimer: () => void;

  summaryData: WorkoutSummary | null;
  showSummaryModal: boolean;
  closeSummary: () => void;
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null);

export function useWorkout(): WorkoutContextValue {
  const value = use(WorkoutContext);
  if (!value) throw new Error('useWorkout must be used inside <WorkoutProvider>');
  return value;
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [selectedSplit, setSelectedSplit] = useState('Push');
  const [exercisesMap, setExercisesMap] = useState<Record<string, ExerciseRow[]>>({});
  const [workoutData, setWorkoutData] = useState<Record<string, SplitWorkout>>({});
  const [historyData, setHistoryData] = useState<Record<number, PastSet | null>>({});
  const [showRestTimer, setShowRestTimer] = useState(false);

  // Post-Workout Summary Recap State
  const [summaryData, setSummaryData] = useState<WorkoutSummary | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Global Unit State ('kg' | 'lb')
  const [unit, setUnit] = useState<WeightUnit>('kg');

  // ==========================================
  // HARDWARE INITIALIZATION (CROSS-PLATFORM)
  // ==========================================
  useEffect(() => {
    const setupAudioAndNotifications = async () => {
      // Configure audio session to prevent ducking background music (Spotify/Apple Music)
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
          allowsRecording: false,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
        });
      } catch (e) {
        console.log('Audio mode initialization error:', e);
      }

      // iOS & Android 13+: Explicit runtime permission prompt (required before scheduling alarms)
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();

        if (existingStatus !== 'granted') {
          await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
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
            // `sound` omitted = system default sound ('default' is now read as a custom file name)
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
    // Mount-only, exactly as V1.
  }, []);

  // ==========================================
  // CONVERSION & ROUNDING HELPERS (V1 behaviour, replaced in Phase 2)
  // ==========================================
  const roundToHalf = (num: number) => Math.round(num * 2) / 2;

  const convertWeight = (val: string, targetUnit: WeightUnit): string => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    if (targetUnit === 'lb') {
      return String(Math.round(num * 2.20462));
    }
    return String(roundToHalf(num / 2.20462));
  };

  const toggleUnit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newUnit: WeightUnit = unit === 'kg' ? 'lb' : 'kg';
    setUnit(newUnit);

    // Convert active table inputs instantly
    setWorkoutData((prev) => {
      const updatedWorkoutData: Record<string, SplitWorkout> = {};
      Object.keys(prev).forEach((splitKey) => {
        const splitData = prev[splitKey];
        const updatedSplitData: SplitWorkout = {};

        Object.keys(splitData).forEach((key) => {
          const exId = Number(key);
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
  const loadSplitData = (split: string) => {
    const list = getExercisesBySplit(split);
    setExercisesMap((prev) => ({ ...prev, [split]: list }));

    const historyMap: Record<number, PastSet | null> = {};
    list.forEach((ex) => {
      historyMap[ex.id] = getLastExercisePerformance(ex.id);
    });
    setHistoryData((prev) => ({ ...prev, ...historyMap }));

    setWorkoutData((prev) => {
      if (prev[split]) return prev;

      const initialSplitData: SplitWorkout = {};
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

  const selectSplit = (split: string) => {
    setSelectedSplit(split);
    loadSplitData(split);
  };

  // ==========================================
  // SET ROW LOGIC (ADD, DELETE, UPDATE, DONE)
  // ==========================================
  const addSet = (exerciseId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWorkoutData((prev) => {
      const currentSplitData = prev[selectedSplit] || {};
      const currentSets = currentSplitData[exerciseId] || [];
      const lastSet = currentSets[currentSets.length - 1];
      const newSetNumber = currentSets.length + 1;

      const updatedSets: SetRow[] = [
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

  const confirmDeleteSet = (exerciseId: number, index: number, setNumber: number) => {
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

  const updateSetData = (
    exerciseId: number,
    index: number,
    field: 'weight' | 'reps',
    value: string
  ) => {
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

  const toggleSetComplete = (exerciseId: number, index: number) => {
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

  const confirmDeleteExercise = (exerciseId: number, exerciseName: string) => {
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
  const finishWorkout = () => {
    const currentSplitData = workoutData[selectedSplit] || {};
    const currentExercises = exercisesMap[selectedSplit] || [];
    const setsToSave: SetLogInput[] = [];
    const highlights: ExerciseHighlight[] = [];
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

  const value: WorkoutContextValue = {
    unit,
    toggleUnit,
    selectedSplit,
    selectSplit,
    reloadSelectedSplit: () => loadSplitData(selectedSplit),
    currentExercises: exercisesMap[selectedSplit] || [],
    currentWorkoutData: workoutData[selectedSplit] || {},
    historyData,
    addSet,
    confirmDeleteSet,
    updateSetData,
    toggleSetComplete,
    confirmDeleteExercise,
    finishWorkout,
    showRestTimer,
    closeRestTimer: () => setShowRestTimer(false),
    summaryData,
    showSummaryModal,
    closeSummary: () => setShowSummaryModal(false),
  };

  return <WorkoutContext value={value}>{children}</WorkoutContext>;
}
