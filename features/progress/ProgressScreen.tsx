/**
 * Progress tab: Overview (start next workout, this week vs last week, weekly
 * streak, recent PRs), Coverage (body maps) and Top sets (V1's tab).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getDb } from '../../db/database';
import { getNextRoutineInputs, getRecentPrs, getSessionTotals, type RecentPr } from '../../db/progress';
import { getTopSets, type TopSetRow } from '../../db/queries';
import { listRoutines, type RoutineSummary } from '../../db/routines';
import { addDays, formatLocalDate, startOfWeek, todayLocalDate } from '../../lib/dates';
import { epleyE1rm } from '../../lib/e1rm';
import { isBig3, nextRoutineId, percentChange, type SessionTotal, weekComparison, weeklyStreak } from '../../lib/stats';
import { formatVolume, formatWeight } from '../../lib/units';
import { colors, radii, spacing, typography } from '../../theme';
import { useSettings } from '../settings/settingsStore';
import Segmented from '../ui/Segmented';
import { activeWorkout, routineTemplates, useActiveWorkoutState } from '../workout/activeWorkout';
import CoverageView from './CoverageView';

type Section = 'overview' | 'coverage' | 'top';
const STREAK_WEEKS_SHOWN = 8;

export default function ProgressScreen() {
  const [section, setSection] = useState<Section>('overview');
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Segmented
        label="Progress section"
        options={[
          { value: 'overview', label: 'OVERVIEW' },
          { value: 'coverage', label: 'COVERAGE' },
          { value: 'top', label: 'TOP SETS' },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === 'overview' ? <Overview /> : section === 'coverage' ? <CoverageView /> : <TopSets />}
    </ScrollView>
  );
}

function Overview() {
  const router = useRouter();
  const { unit, weekStart } = useSettings();
  const { session } = useActiveWorkoutState();
  const [totals, setTotals] = useState<SessionTotal[]>([]);
  const [prs, setPrs] = useState<RecentPr[]>([]);
  const [next, setNext] = useState<RoutineSummary | null>(null);
  const today = todayLocalDate();

  useFocusEffect(
    useCallback(() => {
      try {
        const db = getDb();
        setTotals(getSessionTotals(db));
        setPrs(getRecentPrs(db, 5));
        const { routineIds, lastRoutineId } = getNextRoutineInputs(db);
        const id = nextRoutineId(routineIds, lastRoutineId);
        setNext(id === null ? null : (listRoutines(db).find((r) => r.id === id) ?? null));
      } catch (error) {
        console.error('Loading progress failed:', error);
      }
    }, [])
  );

  const week = useMemo(() => weekComparison(totals, today, weekStart), [totals, today, weekStart]);
  const dates = useMemo(() => totals.map((t) => t.localDate), [totals]);
  const streak = weeklyStreak(dates, today, weekStart);
  const recentWeeks = useMemo(() => {
    const weeks = new Set(dates.map((d) => startOfWeek(d, weekStart)));
    const current = startOfWeek(today, weekStart);
    return Array.from({ length: STREAK_WEEKS_SHOWN }, (_, i) => {
      const start = addDays(current, -7 * (STREAK_WEEKS_SHOWN - 1 - i));
      return { start, trained: weeks.has(start), current: start === current };
    });
  }, [dates, today, weekStart]);

  const startNext = () => {
    if (session) {
      router.push('/workout');
      return;
    }
    if (!next) {
      router.push('/routines');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (activeWorkout.start(next.name, next.id, routineTemplates(next.id))) router.push('/workout');
    else Alert.alert('Could not start the workout', 'Please try again.');
  };

  return (
    <View style={styles.section}>
      <Pressable
        style={({ pressed }) => [styles.nextCard, pressed && { opacity: 0.8 }]}
        onPress={startNext}
        accessibilityRole="button"
        accessibilityLabel={session ? `Resume workout ${session.name}` : next ? `Start next workout, ${next.name}` : 'Create a routine'}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.nextLabel}>{session ? 'WORKOUT IN PROGRESS' : 'NEXT WORKOUT'}</Text>
          <Text style={styles.nextName} numberOfLines={1}>{session ? session.name : next ? next.name : 'No routines yet'}</Text>
          {!session && next && next.exerciseCount > 0 && <Text style={styles.small} numberOfLines={1}>{next.exerciseNames}</Text>}
        </View>
        <View style={styles.nextBtn}>
          <Text style={styles.nextBtnText}>{session ? 'RESUME' : next ? 'START' : 'CREATE'}</Text>
        </View>
      </Pressable>

      <Text style={styles.heading}>THIS WEEK</Text>
      <View style={styles.card}>
        <View style={styles.compareRow}>
          <Compare label="WORKOUTS" now={week.thisWeek.workouts} before={week.lastWeek.workouts} format={String} />
          <Compare label="SETS" now={week.thisWeek.sets} before={week.lastWeek.sets} format={String} />
          <Compare label={`VOLUME (${unit})`} now={week.thisWeek.volumeKg} before={week.lastWeek.volumeKg} format={(v) => formatVolume(v, unit)} />
        </View>
        <Text style={styles.small}>{`So far this week (from ${formatLocalDate(week.thisWeekStart, undefined, { weekday: 'short', day: 'numeric', month: 'short' })}) vs all of last week.`}</Text>
      </View>

      <Text style={styles.heading}>WEEKLY STREAK</Text>
      <View style={[styles.card, styles.streakCard]} accessible accessibilityLabel={`${streak} ${streak === 1 ? 'week' : 'weeks'} in a row with at least one workout.`}>
        <View>
          <Text style={styles.streakNumber}>{streak}</Text>
          <Text style={styles.small}>{streak === 1 ? 'week in a row' : 'weeks in a row'}</Text>
        </View>
        <View style={styles.weeks}>
          {recentWeeks.map((w) => (
            <View key={w.start} style={[styles.weekBox, w.trained && styles.weekTrained, w.current && styles.weekCurrent]} />
          ))}
        </View>
      </View>
      <Text style={styles.small}>A week counts when it has at least one workout. This week doesn't break the streak until it's over.</Text>

      <Text style={styles.heading}>RECENT PRS</Text>
      {prs.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.small}>No PRs yet. Beat a heaviest set, a best e1RM or a rep max and it shows up here (the first time you log an exercise sets the baseline).</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {prs.map((p) => (
            <Pressable
              key={p.setId}
              style={styles.prRow}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(p.exerciseId) } })}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${p.label}, ${formatWeight(p.weight, unit)} ${unit} times ${p.reps}. Open exercise.`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.prName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.small}>{`${p.label}${p.localDate ? ` · ${formatLocalDate(p.localDate, undefined, { day: 'numeric', month: 'short' })}` : ''}`}</Text>
              </View>
              <Text style={styles.prValue}>{`${formatWeight(p.weight, unit)} ${unit} × ${p.reps}`}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Compare({ label, now, before, format }: { label: string; now: number; before: number; format: (v: number) => string }) {
  const change = percentChange(now, before);
  const up = now >= before;
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${format(now)} this week, ${format(before)} last week`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{format(now)}</Text>
      <Text style={[styles.small, change !== null && { color: up ? colors.success : colors.textSecondary }]}>
        {`last wk ${format(before)}${change !== null ? ` · ${change > 0 ? '+' : ''}${change}%` : ''}`}
      </Text>
    </View>
  );
}

function TopSets() {
  const router = useRouter();
  const { unit } = useSettings();
  const [rows, setRows] = useState<TopSetRow[]>([]);
  useFocusEffect(
    useCallback(() => {
      try {
        setRows(getTopSets(getDb()));
      } catch (error) {
        console.error('Loading top sets failed:', error);
      }
    }, [])
  );
  // V1 order: Big 3 pinned first, then by name.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(isBig3(b.name, b.variation)) - Number(isBig3(a.name, a.variation)) || a.name.localeCompare(b.name)),
    [rows]
  );
  if (sorted.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.prName}>No logged sets yet.</Text>
        <Text style={styles.small}>Finish a workout to see your heaviest set for every exercise.</Text>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      {sorted.map((r) => {
        const e1rm = epleyE1rm(r.weight, r.reps);
        return (
          <Pressable
            key={r.exercise_id}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(r.exercise_id) } })}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}, top set ${formatWeight(r.weight, unit)} ${unit} times ${r.reps}. Open exercise.`}
          >
            <View style={styles.topHead}>
              <Text style={styles.prName} numberOfLines={1}>{r.name}</Text>
              {r.variation ? <Text style={styles.badge}>{r.variation}</Text> : null}
              {isBig3(r.name, r.variation) && <Text style={[styles.badge, styles.big3]}>BIG 3</Text>}
            </View>
            <Text style={styles.small}>{`${r.target_muscle}${r.date ? ` · ${formatLocalDate(r.date, undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`}</Text>
            <View style={styles.compareRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>TOP SET</Text>
                <Text style={styles.statValue}>{`${formatWeight(r.weight, unit)} ${unit} × ${r.reps}`}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statLabel}>EST. 1RM</Text>
                <Text style={[styles.statValue, { color: colors.accent }]}>{e1rm === null ? '—' : `${formatWeight(e1rm, unit)} ${unit}`}</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  section: { gap: spacing.md },
  heading: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  small: { ...typography.caption, color: colors.textSecondary },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface2, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.accent, padding: spacing.lg },
  nextLabel: { ...typography.label, color: colors.accent },
  nextName: { ...typography.title, color: colors.textPrimary },
  nextBtn: { backgroundColor: colors.accent, borderRadius: radii.md, minHeight: 44, minWidth: 80, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  nextBtnText: { ...typography.label, fontSize: 13, color: colors.onAccent },
  compareRow: { flexDirection: 'row', gap: spacing.sm },
  statLabel: { ...typography.label, fontSize: 9, color: colors.textSecondary },
  statValue: { ...typography.numeric, color: colors.textPrimary, marginTop: 2 },
  streakCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakNumber: { ...typography.numericLarge, color: colors.accent },
  weeks: { flexDirection: 'row', gap: 6 },
  weekBox: { width: 18, height: 18, borderRadius: 4, backgroundColor: colors.surface3 },
  weekTrained: { backgroundColor: colors.accent },
  weekCurrent: { borderWidth: 2, borderColor: colors.textPrimary },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  prName: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
  prValue: { ...typography.numeric, color: colors.accent },
  topHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { ...typography.label, fontSize: 9, color: colors.textSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: 4, paddingVertical: 1 },
  big3: { color: colors.accent, borderColor: colors.accent },
});
