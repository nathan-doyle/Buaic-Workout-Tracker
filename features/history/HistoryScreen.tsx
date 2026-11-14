/**
 * History tab: completed workouts, newest first, with date, duration, sets,
 * volume and exercises; filter by routine or exercise. Tap opens the workout
 * (view, edit, delete); long-press deletes as in V1, with confirmation.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getDb } from '../../db/database';
import {
  deleteCompletedSession,
  exercisesWithSets,
  type HistoryFilter,
  listSessions,
  routinesWithSessions,
  type SessionListItem,
  sessionDurationSeconds,
} from '../../db/history';
import { formatLocalDate } from '../../lib/dates';
import { formatDuration } from '../../lib/stats';
import { formatVolume } from '../../lib/units';
import { colors, radii, spacing, typography } from '../../theme';
import { useSettings } from '../settings/settingsStore';
import ActionSheet, { type SheetAction } from '../ui/ActionSheet';
import { activeWorkout } from '../workout/activeWorkout';

type Filter = { kind: 'all' } | { kind: 'routine'; id: number; name: string } | { kind: 'exercise'; id: number; name: string };

export default function HistoryScreen() {
  const router = useRouter();
  const { unit } = useSettings();
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [routines, setRoutines] = useState<{ id: number; name: string }[]>([]);
  const [exercises, setExercises] = useState<{ id: number; name: string; variation: string }[]>([]);
  const [picker, setPicker] = useState<'routine' | 'exercise' | null>(null);

  const load = useCallback(() => {
    try {
      const db = getDb();
      const f: HistoryFilter =
        filter.kind === 'routine' ? { routineId: filter.id } : filter.kind === 'exercise' ? { exerciseId: filter.id } : {};
      setSessions(listSessions(db, f));
      setRoutines(routinesWithSessions(db));
      setExercises(exercisesWithSets(db));
    } catch (error) {
      console.error('Loading history failed:', error);
    }
  }, [filter]);
  useFocusEffect(load);

  const confirmDelete = (s: SessionListItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Alert.alert('Delete workout?', `${s.name} on ${dateText(s)} and all its sets will be deleted. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            if (deleteCompletedSession(getDb(), s.id)) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              activeWorkout.reloadHistory();
            }
          } catch (error) {
            console.error('Deleting workout failed:', error);
          }
          load();
        },
      },
    ]);
  };

  const pickerActions: SheetAction[] = useMemo(() => {
    if (picker === 'routine') return routines.map((r) => ({ label: r.name, onPress: () => setFilter({ kind: 'routine', id: r.id, name: r.name }) }));
    if (picker === 'exercise')
      return exercises.map((e) => {
        const name = [e.name, e.variation].filter(Boolean).join(' · ');
        return { label: name, onPress: () => setFilter({ kind: 'exercise', id: e.id, name: e.name }) };
      });
    return [];
  }, [picker, routines, exercises]);

  const header = (
    <View style={styles.headerWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" active={filter.kind === 'all'} onPress={() => setFilter({ kind: 'all' })} />
        <Chip
          label={filter.kind === 'routine' ? `Routine: ${filter.name}` : 'Routine ▾'}
          active={filter.kind === 'routine'}
          onPress={() => setPicker('routine')}
          disabled={routines.length === 0}
        />
        <Chip
          label={filter.kind === 'exercise' ? `Exercise: ${filter.name}` : 'Exercise ▾'}
          active={filter.kind === 'exercise'}
          onPress={() => setPicker('exercise')}
          disabled={exercises.length === 0}
        />
      </ScrollView>
      {filter.kind !== 'all' && sessions.length > 0 && (
        <Text style={styles.count}>{`${sessions.length} ${sessions.length === 1 ? 'workout' : 'workouts'}`}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(s) => String(s.id)}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{filter.kind === 'all' ? 'No workouts yet' : 'No workouts match'}</Text>
            <Text style={styles.sub}>
              {filter.kind === 'all'
                ? 'Finish your first workout and it shows up here, with its sets, volume and duration.'
                : 'Try another filter, or tap All.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const duration = sessionDurationSeconds(item.startedAt, item.endedAt);
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: String(item.id) } })}
              onLongPress={() => confirmDelete(item)}
              delayLongPress={400}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${dateText(item)}, ${item.setCount} sets. Open workout.`}
              accessibilityHint="Long press to delete"
            >
              <View style={styles.cardHead}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.date}>{dateText(item)}</Text>
              </View>
              <Text style={styles.sub} numberOfLines={2}>{item.exerciseNames || 'No sets'}</Text>
              <View style={styles.stats}>
                <Stat label="DURATION" value={duration === null ? '—' : formatDuration(duration)} />
                <Stat label="SETS" value={String(item.setCount)} />
                <Stat label="VOLUME" value={`${formatVolume(item.volumeKg, unit)} ${unit}`} />
              </View>
            </Pressable>
          );
        }}
      />
      <ActionSheet
        visible={picker !== null}
        title={picker === 'routine' ? 'Show workouts of routine' : 'Show workouts with exercise'}
        actions={pickerActions}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function dateText(s: SessionListItem): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  return s.localDate ? formatLocalDate(s.localDate, undefined, options) : new Date(s.dateCompleted).toLocaleDateString(undefined, options);
}

function Chip({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, active && styles.chipActive, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerWrap: { gap: spacing.xs },
  chips: { gap: spacing.sm, paddingBottom: spacing.xs },
  chip: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, justifyContent: 'center', maxWidth: 240 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.onAccent },
  count: { ...typography.caption, color: colors.textTertiary },
  card: { backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  name: { ...typography.heading, color: colors.textPrimary, flexShrink: 1 },
  date: { ...typography.caption, color: colors.textSecondary },
  sub: { ...typography.caption, color: colors.textSecondary },
  stats: { flexDirection: 'row', marginTop: spacing.xs },
  statLabel: { ...typography.label, fontSize: 9, color: colors.textTertiary },
  statValue: { ...typography.numeric, color: colors.accent, marginTop: 2 },
  empty: { backgroundColor: colors.surface1, borderRadius: radii.md, padding: spacing.xl, alignItems: 'center', gap: spacing.xs },
  emptyTitle: { ...typography.heading, color: colors.textPrimary },
});
