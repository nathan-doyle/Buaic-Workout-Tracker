/**
 * Tab shell with V1's four tabs. The shared BUAIC header and V1's segmented tab
 * row are the navigator's custom tab bar (at the top, as in V1); the rest timer,
 * calendar and workout summary sit above every tab, as in V1's `App.js`.
 *
 * Uses expo-router's JS tabs, not native tabs: V1's floating rest timer must stay
 * visible above the tab bar on every tab, and a native tab bar's height can't be
 * measured. See V2_PROGRESS.md → Decisions (Phase 1b).
 */
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import CalendarModal from '../../components/CalendarModal';
import RestTimer from '../../components/RestTimer';
import WorkoutSummaryModal from '../../components/WorkoutSummaryModal';
import ShellTabBar from '../../features/shell/ShellTabBar';
import { useWorkout } from '../../features/workout/WorkoutProvider';
import { colors } from '../../theme';

export default function TabsLayout() {
  const { unit, showRestTimer, closeRestTimer, summaryData, showSummaryModal, closeSummary } =
    useWorkout();
  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <Tabs
        // V1 had no tab history: Android back leaves the app from any tab.
        backBehavior="none"
        tabBar={(props) => (
          <ShellTabBar {...props} onOpenCalendar={() => setShowCalendar(true)} />
        )}
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

      {/* Background Floating Rest Timer */}
      {showRestTimer && <RestTimer initialSeconds={90} onClose={closeRestTimer} />}

      {/* Monthly Activity Calendar Modal */}
      <CalendarModal visible={showCalendar} onClose={() => setShowCalendar(false)} />

      {/* Post-Workout Summary Recap & Share Card */}
      <WorkoutSummaryModal
        visible={showSummaryModal}
        summaryData={summaryData}
        unit={unit}
        onClose={closeSummary}
      />
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
});
