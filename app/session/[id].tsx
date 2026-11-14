import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import SessionScreen from '../../features/history/SessionScreen';

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionScreen sessionId={Number(id)} />;
}
