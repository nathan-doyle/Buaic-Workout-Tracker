/**
 * Frame for each tab screen under native tabs (Phase 5): the BUAIC header on top,
 * the screen, then — in the layout flow, right above the system tab bar — the
 * "workout in progress" bar and the rest timer. Only the focused tab draws the
 * bars (one ticking rest bar).
 *
 * Bottom inset: on Android, native tabs wrap the content in a SafeAreaView that
 * applies the bar's inset. On iOS they don't (only the first ScrollView gets
 * automatic content insets), so the content would run under the tab bar and hide
 * the bars; expo-router wraps each iOS tab in its own SafeAreaProvider, whose
 * bottom inset is the tab bar, so padding by it ends everything right above the
 * bar (0 if the content already ends there).
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, maxFontScale, radii, spacing, typography } from '../../theme';
import RestBar from '../rest/RestBar';
import { Icon } from '../ui/Icon';
import { useActiveWorkoutState } from '../workout/activeWorkout';
import { ShellHeader } from './ShellHeader';

export default function TabScreen({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm, paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }]}>
      <ShellHeader onOpenCalendar={() => router.push('/calendar')} />
      <View style={styles.body}>{children}</View>
      {focused && <WorkoutBars />}
    </View>
  );
}

function WorkoutBars() {
  const router = useRouter();
  const { session } = useActiveWorkoutState();
  return (
    <>
      {session && (
        <Pressable
          style={({ pressed }) => [styles.workoutBar, pressed && { opacity: 0.8 }]}
          onPress={() => router.push('/workout')}
          accessibilityRole="button"
          accessibilityLabel={`Open workout in progress, ${session.name}`}
        >
          <Text style={styles.workoutBarLabel} maxFontSizeMultiplier={maxFontScale.dense}>WORKOUT IN PROGRESS</Text>
          <Text style={styles.workoutBarName} numberOfLines={1} maxFontSizeMultiplier={maxFontScale.dense}>{session.name}</Text>
          <Text style={styles.workoutBarOpen} maxFontSizeMultiplier={maxFontScale.dense}>Open</Text>
          <Icon name="open" color={colors.accent} />
        </Pressable>
      )}
      <RestBar onPress={session ? () => router.push('/workout') : undefined} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  workoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
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
