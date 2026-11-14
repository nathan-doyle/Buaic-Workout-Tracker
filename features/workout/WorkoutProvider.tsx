/**
 * Active-workout state shared by the tab shell (header unit toggle, rest timer,
 * summary) and the Workout tab.
 *
 * V2 Phase 1b: V1's `App.js` controller logic moved out of the root component.
 * Phase 2: the unit is a persisted setting, weights are converted exactly
 * (lib/units) and stored in kg at full precision, splits are routines and removing
 * an exercise keeps its history. The workout itself is still in memory, as in V1;
 * Phase 3 makes it crash-safe. See V2_PROGRESS.md.
 */
import React, { createContext, use, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { setAudioModeAsync } from 'expo-audio';

import {
  getExercisesBySplit,
  saveWorkoutSession,
  getLastExercisePerformance,
  deleteExercise,
  type ExerciseRow,
  type PastSet,
  type SetLogInput,
} from '../../db/database';
import { V1_SPLITS } from '../../db/v1Constants';
import {
  convertEntry,
  entryFromKg,
  entryToKg,
  type WeightEntry,
  type WeightUnit,
} from '../../lib/units';
import { useDataRevision } from '../backup/dataRevision';
import { settingsStore, useSettings } from '../settings/settingsStore';

// Supported default routines
export const DEFAULT_SPLITS: readonly string[] = V1_SPLITS;

/** A set row being edited on the Workout tab (inputs are kept as typed text). */
export interface SetRow {
  setNumber: number;
  /** The weight text as shown, in the current unit. */
  weight: string;
  /** Exact kg behind `weight` while it still reads `exactText` (see `WeightEntry`). */
  exactKg?: number;
  exactText?: string;
  reps: string;
  completed: boolean;
}

const entryOf = (row: SetRow): WeightEntry => ({ text: row.weight, exactKg: row.exactKg, exactText: row.exactText });
const withEntry = (row: SetRow, entry: WeightEntry): SetRow => ({
  ...row,
  weight: entry.text,
  exactKg: entry.exactKg,
  exactText: entry.exactText,
});

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

  // Global unit ('kg' | 'lb'), persisted in settings
  const { unit } = useSettings();

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

    // The database was opened and migrated by <DatabaseGate> before this mounted.
    setupAudioAndNotifications();
    loadSplitData(selectedSplit);
    // Mount-only, exactly as V1.
  }, []);

  // After a backup import replaced all data, drop the in-memory workout and reload.
  const dataRevision = useDataRevision();
  const [loadedRevision, setLoadedRevision] = useState(dataRevision);
  useEffect(() => {
    if (dataRevision === loadedRevision) return;
    setLoadedRevision(dataRevision);
    setExercisesMap({});
    setWorkoutData({});
    setHistoryData({});
    setShowRestTimer(false);
    unitRef.current = unit; // reloaded in the (possibly imported) current unit
    loadSplitData(selectedSplit, true);
  }, [dataRevision]);

  // When the unit changes (header toggle or Settings), re-express typed weights in it.
  // Declared after the reload effect so an import that also changed the unit isn't converted twice.
  const unitRef = useRef(unit);
  useEffect(() => {
    const from = unitRef.current;
    if (from === unit) return;
    unitRef.current = unit;
    setWorkoutData((prev) => {
      const updatedWorkoutData: Record<string, SplitWorkout> = {};
      Object.keys(prev).forEach((splitKey) => {
        const splitData = prev[splitKey];
        const updatedSplitData: SplitWorkout = {};
        Object.keys(splitData).forEach((key) => {
          const exId = Number(key);
          updatedSplitData[exId] = splitData[exId].map((setRow) =>
            withEntry(setRow, convertEntry(entryOf(setRow), from, unit))
          );
        });
        updatedWorkoutData[splitKey] = updatedSplitData;
      });
      return updatedWorkoutData;
    });
  }, [unit]);

  // ==========================================
  // UNIT TOGGLE (persisted; stored data never changes)
  // ==========================================
  const toggleUnit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newUnit: WeightUnit = unit === 'kg' ? 'lb' : 'kg';
    try {
      settingsStore.set('unit', newUnit);
    } catch (e) {
      console.error('Error saving unit:', e);
      return;
    }
    // Typed inputs are converted by the unit effect above (also when changed in Settings).
  };

  // ==========================================
  // ROUTINE & EXERCISE DATA MANAGEMENT
  // ==========================================
  const loadSplitData = (split: string, reset = false) => {
    const list = getExercisesBySplit(split);
    setExercisesMap((prev) => ({ ...prev, [split]: list }));

    const historyMap: Record<number, PastSet | null> = {};
    list.forEach((ex) => {
      historyMap[ex.id] = getLastExercisePerformance(ex.id);
    });
    setHistoryData((prev) => ({ ...prev, ...historyMap }));

    setWorkoutData((prev) => {
      if (prev[split] && !reset) return prev;

      const initialSplitData: SplitWorkout = {};
      list.forEach((ex) => {
        const bestSet = historyMap[ex.id];
        const defaultWeight: WeightEntry = bestSet ? entryFromKg(bestSet.weight, unit) : { text: '0' };
        const defaultReps = bestSet ? String(bestSet.reps) : '10';

        initialSplitData[ex.id] = [
          withEntry({ setNumber: 1, weight: '0', reps: defaultReps, completed: false }, defaultWeight),
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
        withEntry(
          { setNumber: newSetNumber, weight: '0', reps: lastSet ? lastSet.reps : '10', completed: false },
          lastSet ? entryOf(lastSet) : { text: '0' }
        ),
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

    Alert.alert('Remove Exercise?', `Are you sure you want to remove ${exerciseName}? Sets you already logged stay in your history.`, [
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
          // Exact kg (lb × 0.45359237), never rounded for storage.
          const weightInKg = entryToKg(entryOf(s), unit);

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
