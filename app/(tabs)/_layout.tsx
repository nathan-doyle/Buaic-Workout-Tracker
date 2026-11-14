/**
 * Tab shell with V1's four tabs. The shared BUAIC header and V1's segmented tab
 * row are the navigator's custom tab bar (at the top, as in V1). Below the tabs, in
 * the layout flow: a "workout in progress" bar and the rest timer (Phase 3).
 *
 * Uses expo-router's JS tabs, not native tabs; see V2_PROGRESS.md → Decisions.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import CalendarModal from '../../components/CalendarModal';
import WorkoutSummaryModal from '../../components/WorkoutSummaryModal';
import RestBar from '../../features/rest/RestBar';
import ShellTabBar from '../../features/shell/ShellTabBar';
import { useActiveWorkoutState } from '../../features/workout/activeWorkout';
import { useWorkout } from '../../features/workout/WorkoutProvider';
import { colors, radii, spacing, typography } from '../../theme';

export default function TabsLayout() {
  const { unit, summaryData, showSummaryModal, closeSummary } = useWorkout();
  const { session } = useActiveWorkoutState();
  const router = useRouter();
  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <Tabs
        // V1 had no tab history: Android back leaves the app from any tab.
        backBehavior="none"
        tabBar={(props) => <ShellTabBar {...props} onOpenCalendar={() => setShowCalendar(true)} />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: 'top',
          animation: 'none',
          sceneStyle: styles.scene,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'WORKOUT' }} />
        <Tabs.Screen name="coverage" options={{ title: 'COVERAGE' }} />
        <Tabs.Screen name="top-sets" options={{ title: 'TOP SETS' }} />
        <Tabs.Screen name="history" options={{ title: 'HISTORY' }} />
      </Tabs>

      {session && (
        <Pressable
          style={styles.workoutBar}
          onPress={() => router.push('/workout')}
          accessibilityRole="button"
          accessibilityLabel={`Open workout in progress, ${session.name}`}
        >
          <Text style={styles.workoutBarLabel}>WORKOUT IN PROGRESS</Text>
          <Text style={styles.workoutBarName} numberOfLines={1}>{session.name}</Text>
          <Text style={styles.workoutBarOpen}>Open ⌃</Text>
        </Pressable>
      )}
      <RestBar onPress={session ? () => router.push('/workout') : undefined} />

      {/* Monthly Activity Calendar Modal */}
      <CalendarModal visible={showCalendar} onClose={() => setShowCalendar(false)} />

      {/* Post-Workout Summary Recap & Share Card */}
      <WorkoutSummaryModal visible={showSummaryModal} summaryData={summaryData} unit={unit} onClose={closeSummary} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    // System bar and notch insets come from SafeAreaView (react-native-safe-area-context)
    paddingTop: 10,
  },
  scene: {
    backgroundColor: colors.background,
  },
  workoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface2,
    borderTopWidth: 1,
    borderColor: colors.accent,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
  },
  workoutBarLabel: { ...typography.label, fontSize: 9, color: colors.accent },
  workoutBarName: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  workoutBarOpen: { ...typography.bodyStrong, color: colors.accent },
});
