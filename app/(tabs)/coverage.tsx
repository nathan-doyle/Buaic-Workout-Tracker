import React from 'react';
import { useIsFocused } from 'expo-router';

import MuscleBalanceScreen from '../../components/MuscleBalanceScreen';

/**
 * V1 mounted a tab's screen each time the tab was opened, and its data loads on
 * mount. Rendering only while focused keeps that: the coverage is re-read on
 * every visit.
 */
export default function CoverageTab() {
  const isFocused = useIsFocused();
  return isFocused ? <MuscleBalanceScreen /> : null;
}
