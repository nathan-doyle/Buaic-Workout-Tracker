import React from 'react';
import { useIsFocused } from 'expo-router';

import PRTracker from '../../components/PRTracker';
import { useWorkout } from '../../features/workout/WorkoutProvider';

/** Mounted only while focused, so the data is re-read on every visit (as in V1). */
export default function TopSetsTab() {
  const isFocused = useIsFocused();
  const { unit } = useWorkout();
  return isFocused ? <PRTracker unit={unit} /> : null;
}
