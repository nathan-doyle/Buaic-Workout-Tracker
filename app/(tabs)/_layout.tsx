/**
 * Tab shell (Phase 5): native tabs — Workout · History · Progress · Exercises —
 * with the app's icon set (Material Community Icons through `VectorIcon`). Each
 * tab screen is wrapped in `TabScreen` (BUAIC header on top; workout and rest bars
 * right above the tab bar). See V2_PROGRESS.md → Decisions (native tabs).
 */
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

import { useSettings } from '../../features/settings/settingsStore';
import WorkoutSummarySheet from '../../features/share/WorkoutSummarySheet';
import { ICONS } from '../../features/ui/Icon';
import { useWorkout } from '../../features/workout/WorkoutProvider';
import { colors, typography } from '../../theme';

const TABS = [
  { name: 'index', label: 'Workout', icon: ICONS.workout },
  { name: 'history', label: 'History', icon: ICONS.history },
  { name: 'progress', label: 'Progress', icon: ICONS.progress },
  { name: 'exercises', label: 'Exercises', icon: ICONS.exercises },
] as const;

export default function TabsLayout() {
  const { unit, summaryData, summaryAt, showSummaryModal, closeSummary } = useWorkout();
  const { onboardingStatus } = useSettings();
  const router = useRouter();

  // A fresh install starts with the short onboarding (once; skipping marks it done).
  useEffect(() => {
    if (onboardingStatus === 'pending') router.push('/onboarding');
    // Only on first mount: finishing onboarding comes back here with the status 'done'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <NativeTabs
        // V1 had no tab history: Android back leaves the app from any tab.
        backBehavior="none"
        backgroundColor={colors.surface1}
        tintColor={colors.accent}
        // Android draws a gold pill behind the selected icon (indicatorColor), so the icon is dark on it.
        // iOS tab bars have no pill: the selected icon is tinted gold like its label.
        iconColor={{ default: colors.textSecondary, selected: Platform.OS === 'ios' ? colors.accent : colors.onAccent }}
        indicatorColor={colors.accent}
        rippleColor={colors.surface3}
        labelStyle={{
          default: { ...typography.label, fontSize: 11, color: colors.textSecondary },
          selected: { ...typography.label, fontSize: 11, color: colors.accent },
        }}
        labelVisibilityMode="labeled"
        shadowColor={colors.border}
      >
        {TABS.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name} contentStyle={{ backgroundColor: colors.background }}>
            <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={MaterialCommunityIcons} name={tab.icon} />} />
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>

      {/* Post-workout summary and share card v2 */}
      <WorkoutSummarySheet visible={showSummaryModal} summary={summaryData} unit={unit} finishedAt={summaryAt} onClose={closeSummary} />
    </>
  );
}
