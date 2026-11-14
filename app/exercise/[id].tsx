import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import ExerciseDetailScreen from '../../features/progress/ExerciseDetailScreen';

export default function ExerciseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseDetailScreen exerciseId={Number(id)} />;
}
