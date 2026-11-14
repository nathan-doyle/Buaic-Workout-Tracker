/**
 * Keeps the screen on while a workout is in progress (Settings → Keep screen awake,
 * on by default). Released as soon as the workout ends or the setting is switched off;
 * the OS drops it by itself whenever the app leaves the foreground.
 */
import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useSettings } from '../settings/settingsStore';
import { useActiveWorkoutState } from './activeWorkout';

const TAG = 'buaic-workout';

export function WorkoutKeepAwake() {
  const { keepAwake } = useSettings();
  const { session } = useActiveWorkoutState();
  const on = keepAwake && session !== null;

  useEffect(() => {
    if (!on) return;
    activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      Promise.resolve(deactivateKeepAwake(TAG)).catch(() => {});
    };
  }, [on]);

  return null;
}
