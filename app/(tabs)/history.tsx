import React from 'react';
import { useIsFocused } from 'expo-router';

import HistoryTracker from '../../components/HistoryTracker';
import { useWorkout } from '../../features/workout/WorkoutProvider';

/** Mounted only while focused, so the data is re-read on every visit (as in V1). */
export default function HistoryTab() {
  const isFocused = useIsFocused();
  const { unit } = useWorkout();
  return isFocused ? <HistoryTracker unit={unit} /> : null;
}
