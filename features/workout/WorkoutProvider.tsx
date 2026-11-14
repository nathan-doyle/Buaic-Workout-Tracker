/**
 * App-wide workout context: the weight unit (header toggle), the post-workout
 * summary, and startup wiring (audio mode, the Android rest channel, resuming an
 * unfinished workout).
 *
 * Phase 3: the workout itself lives in SQLite through `activeWorkout` (crash-safe),
 * the rest timer in `features/rest`. Notification permission is no longer asked at
 * launch; the rest timer asks the first time it starts.
 */
import React, { createContext, use, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import * as Notifications from 'expo-notifications';
import { setAudioModeAsync } from 'expo-audio';

import type { WeightUnit } from '../../lib/units';
import { useDataRevision } from '../backup/dataRevision';
import { restTimer } from '../rest/restTimer';
import { maybeRequestReview } from '../review/reviewPrompt';
import { haptics } from '../ui/haptics';
import { settingsStore, useSettings } from '../settings/settingsStore';
import { activeWorkout } from './activeWorkout';
import type { WorkoutSummary } from './activeWorkoutStore';

interface WorkoutContextValue {
  unit: WeightUnit;
  toggleUnit: () => void;
  summaryData: WorkoutSummary | null;
  /** When the summary was shown (the share card's date). */
  summaryAt: Date | null;
  showSummaryModal: boolean;
  showSummary: (summary: WorkoutSummary) => void;
  closeSummary: () => void;
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null);

export function useWorkout(): WorkoutContextValue {
  const value = use(WorkoutContext);
  if (!value) throw new Error('useWorkout must be used inside <WorkoutProvider>');
  return value;
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [summaryData, setSummaryData] = useState<WorkoutSummary | null>(null);
  const [summaryAt, setSummaryAt] = useState<Date | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const { unit } = useSettings();

  useEffect(() => {
    // Mix with music instead of ducking or stopping it.
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch((e) => console.log('Audio mode initialization error:', e));

    // Android: the rest alarm channel (creating it never prompts).
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('rest-timer', {
        name: 'Rest Timer Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        // `sound` omitted = system default sound ('default' is now read as a custom file name)
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      }).catch((e) => console.log('Android notification channel setup error:', e));
    }

    // The database was opened and migrated by <DatabaseGate> before this mounted.
    activeWorkout.resume();
  }, []);

  // After a backup import replaced all data, reload the workout from the new data.
  const dataRevision = useDataRevision();
  const loadedRevision = useRef(dataRevision);
  useEffect(() => {
    if (dataRevision === loadedRevision.current) return;
    loadedRevision.current = dataRevision;
    activeWorkout.reset();
    restTimer.skip();
    activeWorkout.resume();
  }, [dataRevision]);

  // Header toggle or Settings changed the unit: re-express typed weights in it.
  useEffect(() => {
    activeWorkout.setUnit(unit);
  }, [unit]);

  const toggleUnit = () => {
    haptics.selection();
    try {
      settingsStore.set('unit', unit === 'kg' ? 'lb' : 'kg');
    } catch (e) {
      console.error('Error saving unit:', e);
    }
  };

  const value: WorkoutContextValue = {
    unit,
    toggleUnit,
    summaryData,
    summaryAt,
    showSummaryModal,
    showSummary: (summary) => {
      setSummaryData(summary);
      setSummaryAt(new Date());
      setShowSummaryModal(true);
    },
    closeSummary: () => {
      setShowSummaryModal(false);
      // Right after a successful finish: maybe ask for a store review (5+ workouts, once per version).
      setTimeout(() => void maybeRequestReview(), 600);
    },
  };

  return <WorkoutContext value={value}>{children}</WorkoutContext>;
}
