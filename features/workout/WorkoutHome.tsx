/**
 * Workout tab: resume an unfinished workout, or start one from a routine, from the
 * last workout, or empty. Routines are managed from here (Phase 3 replaces V1's
 * split picker; the V1 splits are routines).
 */
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getDb } from '../../db/database';
import { listRoutines, type RoutineSummary } from '../../db/routines';
import { getLastCompletedWorkout } from '../../db/workouts';
import { formatLocalDate } from '../../lib/dates';
import { formatClock } from '../../lib/restTimer';
import { colors, radii, spacing, typography } from '../../theme';
import { restTimer } from '../rest/restTimer';
import { activeWorkout, routineTemplates, sessionTemplates, useActiveWorkoutState } from './activeWorkout';

export default function WorkoutHome() {
  const router = useRouter();
  const { session, draft } = useActiveWorkoutState();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [last, setLast] = useState<ReturnType<typeof getLastCompletedWorkout>>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        setRoutines(listRoutines(getDb()));
        setLast(getLastCompletedWorkout(getDb()));
      } catch (error) {
        console.error('Loading routines failed:', error);
      }
    }, [])
  );

  const start = (name: string, routineId: number | null, templates: ReturnType<typeof routineTemplates>) => {
    if (session) {
      Alert.alert('Workout in progress', `Finish or discard "${session.name}" first.`, [
        { text: 'OK', style: 'cancel' },
        { text: 'Open it', onPress: () => router.push('/workout') },
      ]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (activeWorkout.start(name, routineId, templates)) router.push('/workout');
    else if (activeWorkout.getSnapshot().session) router.push('/workout');
    else Alert.alert('Could not start the workout', 'Please try again.');
  };

  const confirmDiscard = () =>
    Alert.alert('Discard workout?', 'The sets you logged in this workout will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          if (activeWorkout.discard()) restTimer.stopAll();
        },
      },
    ]);

  const ticked = draft?.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) ?? 0;
  const elapsed = session ? Math.max(0, (Date.now() - Date.parse(session.startedAt)) / 1000) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {session ? (
        <View style={styles.resume} accessibilityRole="summary">
          <Text style={styles.resumeLabel}>WORKOUT IN PROGRESS</Text>
          <Text style={styles.resumeTitle}>{session.name}</Text>
          <Text style={styles.resumeSub}>
            {`Started ${elapsed < 3600 ? `${Math.max(1, Math.round(elapsed / 60))} min` : formatClock(elapsed)} ago · ${ticked} ${ticked === 1 ? 'set' : 'sets'} done`}
          </Text>
          <View style={styles.resumeRow}>
            <Pressable style={[styles.button, styles.primary, { flex: 1 }]} onPress={() => router.push('/workout')} accessibilityRole="button">
              <Text style={styles.primaryText}>RESUME</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondary]} onPress={confirmDiscard} accessibilityRole="button" accessibilityLabel="Discard workout">
              <Text style={styles.dangerText}>Discard</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.quickRow}>
          <Pressable style={[styles.button, styles.secondary, { flex: 1 }]} onPress={() => start('Workout', null, [])} accessibilityRole="button">
            <Text style={styles.secondaryText}>Empty workout</Text>
          </Pressable>
          {last && (
            <Pressable
              style={[styles.button, styles.secondary, { flex: 1 }]}
              onPress={() => start(last.name, last.routineId, sessionTemplates(last.id, last.routineId))}
              accessibilityRole="button"
              accessibilityLabel={`Repeat last workout, ${last.name}`}
            >
              <Text style={styles.secondaryText} numberOfLines={1}>{`Repeat ${last.name}`}</Text>
              {last.localDate && <Text style={styles.small}>{formatLocalDate(last.localDate, undefined, { day: 'numeric', month: 'short' })}</Text>}
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.section}>ROUTINES</Text>
        <Pressable onPress={() => router.push('/routines')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Manage routines">
          <Text style={styles.link}>Manage</Text>
        </Pressable>
      </View>
      {routines.length === 0 && <Text style={styles.small}>No routines yet. Tap Manage to create one.</Text>}
      {routines.map((r) => (
        <Pressable
          key={r.id}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
          onPress={() => router.push({ pathname: '/routine/[id]', params: { id: String(r.id) } })}
          accessibilityRole="button"
          accessibilityLabel={`Edit routine ${r.name}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{r.name}</Text>
            <Text style={styles.small} numberOfLines={2}>
              {r.exerciseCount === 0 ? 'No exercises' : r.exerciseNames}
            </Text>
          </View>
          <Pressable
            style={[styles.startBtn, !!session && styles.startBtnDisabled]}
            onPress={() => start(r.name, r.id, routineTemplates(r.id))}
            accessibilityRole="button"
            accessibilityLabel={`Start ${r.name}`}
            hitSlop={6}
          >
            <Text style={[styles.startText, !!session && { color: colors.textDisabled }]}>START</Text>
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  resume: {
    backgroundColor: colors.surface2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  resumeLabel: { ...typography.label, color: colors.accent },
  resumeTitle: { ...typography.title, color: colors.textPrimary },
  resumeSub: { ...typography.caption, color: colors.textSecondary },
  resumeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  button: { minHeight: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  primary: { backgroundColor: colors.accent },
  primaryText: { ...typography.bodyStrong, color: colors.onAccent, letterSpacing: 2 },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  secondaryText: { ...typography.bodyStrong, color: colors.textPrimary },
  dangerText: { ...typography.bodyStrong, color: colors.danger },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  section: { ...typography.label, color: colors.textSecondary },
  link: { ...typography.bodyStrong, color: colors.accent },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: 2 },
  small: { ...typography.caption, color: colors.textSecondary },
  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    minHeight: 44,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: { backgroundColor: colors.surface3 },
  startText: { ...typography.label, color: colors.onAccent, fontSize: 13 },
});
