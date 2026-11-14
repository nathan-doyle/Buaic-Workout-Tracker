/**
 * V1's BUAIC header (wordmark, calendar, settings, kg/lb toggle) on top of every
 * tab screen. Phase 1b moved it from V1's App.js; Phase 5 put it on the icon set
 * and tokens, and moved the tabs themselves to native tabs (V1's top tab row is gone).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { colors, maxFontScale, radii, spacing, typography } from '../../theme';
import { IconButton } from '../ui/Icon';
import { useWorkout } from '../workout/WorkoutProvider';

export function ShellHeader({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const { unit, toggleUnit } = useWorkout();
  return (
    <View style={styles.headerContainer}>
      <View accessible accessibilityRole="header" accessibilityLabel="Buaic workout tracker">
        <Text style={styles.headerTitle} maxFontSizeMultiplier={maxFontScale.control}>BUAIC</Text>
        <Text style={styles.subHeader} maxFontSizeMultiplier={maxFontScale.control}>WORKOUT TRACKER</Text>
      </View>

      <View style={styles.actions}>
        <IconButton icon="calendar" label="Calendar" onPress={onOpenCalendar} variant="filled" size={18} />
        <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} variant="filled" size={18} />
        <Pressable
          style={styles.unitToggleTrack}
          onPress={toggleUnit}
          hitSlop={6}
          accessibilityRole="switch"
          accessibilityLabel="Weight unit"
          accessibilityValue={{ text: unit === 'kg' ? 'kilograms' : 'pounds' }}
          accessibilityState={{ checked: unit === 'lb' }}
          accessibilityHint="Switches between kilograms and pounds"
        >
          <View style={[styles.unitThumb, unit === 'lb' && styles.unitThumbRight]} />
          <Text style={[styles.unitText, unit === 'kg' && styles.unitTextActive]} maxFontSizeMultiplier={1.2}>KG</Text>
          <Text style={[styles.unitText, unit === 'lb' && styles.unitTextActive]} maxFontSizeMultiplier={1.2}>LB</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerTitle: { ...typography.wordmark, color: colors.accent },
  subHeader: { ...typography.overline, color: colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unitToggleTrack: {
    width: 74,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  unitThumb: {
    position: 'absolute',
    left: 2,
    width: 34,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  unitThumbRight: { left: 36 },
  unitText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: colors.textTertiary,
    zIndex: 1,
  },
  unitTextActive: { color: colors.onAccent },
});
