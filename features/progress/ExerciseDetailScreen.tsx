/**
 * One exercise: charts of best e1RM, top-set weight and session volume over time
 * (1M / 3M / 1Y / All), the rep-max table and the full set history.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import { getDb } from '../../db/database';
import { prTimeline } from '../../db/history';
import { getExerciseSetRows } from '../../db/progress';
import { getExercise, type LibraryExercise } from '../../db/routines';
import { formatLocalDate, todayLocalDate } from '../../lib/dates';
import { prLabel } from '../../lib/prs';
import { CHART_RANGES, type ChartRange, exerciseSessionPoints, pointsInRange, repMaxTable } from '../../lib/stats';
import { formatLoad, formatVolume, formatWeight, isBodyweightEquipment } from '../../lib/units';
import { colors, radii, spacing, typography } from '../../theme';
import { useSettings } from '../settings/settingsStore';
import Segmented from '../ui/Segmented';
import LineChart, { type ChartPoint } from './LineChart';

type Metric = 'e1rm' | 'top' | 'volume' | 'reps';
type Rows = ReturnType<typeof getExerciseSetRows>;

const SET_TYPE_LETTER: Record<string, string> = { warmup: 'W', working: '', drop: 'D', failure: 'F' };

export default function ExerciseDetailScreen({ exerciseId }: { exerciseId: number }) {
  const router = useRouter();
  const { unit } = useSettings();
  const [exercise, setExercise] = useState<LibraryExercise | null>(null);
  const [rows, setRows] = useState<Rows>([]);
  const [prLabels, setPrLabels] = useState<Map<number, string>>(new Map());
  const [range, setRange] = useState<ChartRange>('3M');
  const [metric, setMetric] = useState<Metric | null>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        const db = getDb();
        setExercise(getExercise(db, exerciseId));
        setRows(getExerciseSetRows(db, exerciseId));
        setPrLabels(new Map(prTimeline(db, exerciseId).map((e) => [e.setId, prLabel(e.prs) ?? 'PR'])));
      } catch (error) {
        console.error('Loading exercise failed:', error);
      }
    }, [exerciseId])
  );

  const bodyweight = isBodyweightEquipment(exercise?.equipment);
  const today = todayLocalDate();
  const sessions = useMemo(() => exerciseSessionPoints(rows), [rows]);
  const repMaxes = useMemo(() => repMaxTable(rows), [rows]);
  const activeMetric: Metric = metric ?? (bodyweight ? 'reps' : 'e1rm');

  const chartPoints: ChartPoint[] = useMemo(() => {
    const inRange = pointsInRange(sessions, range, today);
    if (activeMetric === 'reps') {
      const maxReps = new Map<number, number>();
      for (const r of rows) if (r.setType !== 'warmup') maxReps.set(r.sessionId, Math.max(maxReps.get(r.sessionId) ?? 0, r.reps));
      return inRange.map((p) => ({ localDate: p.localDate, value: maxReps.get(p.sessionId) ?? 0 }));
    }
    const pick = (p: (typeof inRange)[number]) => (activeMetric === 'e1rm' ? p.e1rm : activeMetric === 'top' ? p.topWeight : p.volumeKg);
    return inRange.flatMap((p) => {
      const v = pick(p);
      return v === null || (activeMetric === 'volume' && v <= 0) ? [] : [{ localDate: p.localDate, value: v }];
    });
  }, [sessions, rows, range, today, activeMetric]);

  const formatValue = (v: number) =>
    activeMetric === 'reps' ? `${Math.round(v)} reps` : activeMetric === 'volume' ? `${formatVolume(v, unit)} ${unit}` : `${formatWeight(v, unit)} ${unit}`;

  const bestE1rm = sessions.reduce<number | null>((b, p) => (p.e1rm !== null && (b === null || p.e1rm > b) ? p.e1rm : b), null);
  const heaviest = sessions.reduce<number | null>((b, p) => (p.topWeight !== null && (b === null || p.topWeight > b) ? p.topWeight : b), null);

  // History, newest session first.
  const bySession = useMemo(() => {
    const groups: { sessionId: number; localDate: string; name: string; sets: Rows }[] = [];
    for (const r of rows) {
      const last = groups[groups.length - 1];
      if (last && last.sessionId === r.sessionId) last.sets.push(r);
      else groups.push({ sessionId: r.sessionId, localDate: r.localDate, name: r.sessionName, sets: [r] });
    }
    return groups.reverse();
  }, [rows]);

  const metricOptions = [
    ...(bodyweight ? [{ value: 'reps' as const, label: 'REPS' }] : []),
    { value: 'e1rm' as const, label: 'E1RM' },
    { value: 'top' as const, label: 'TOP SET' },
    { value: 'volume' as const, label: 'VOLUME' },
  ];
  const title = exercise ? [exercise.name, exercise.variation].filter(Boolean).join(' · ') : 'Exercise';
  const longDate = (d: string) => formatLocalDate(d, undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: exercise?.name ?? 'Exercise' }} />
      <View>
        <Text style={styles.title}>{title}</Text>
        {exercise && (
          <Text style={styles.sub}>
            {[exercise.muscle, exercise.equipment !== exercise.variation ? exercise.equipment : null, exercise.archivedAt ? 'Archived' : null].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      <View style={styles.stats}>
        <Stat label="BEST E1RM" value={bestE1rm === null ? '—' : `${formatWeight(bestE1rm, unit)} ${unit}`} />
        <Stat label="HEAVIEST" value={heaviest === null ? (rows.length ? 'BW' : '—') : `${formatWeight(heaviest, unit)} ${unit}`} />
        <Stat label="SESSIONS" value={String(sessions.length)} />
      </View>

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Not logged yet</Text>
          <Text style={styles.sub}>Charts, rep maxes and history appear after your first workout with this exercise.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Segmented label="Chart" options={metricOptions} value={activeMetric} onChange={setMetric} small />
            <View style={{ height: spacing.md }} />
            <LineChart
              title={metricOptions.find((o) => o.value === activeMetric)?.label ?? 'Chart'}
              points={chartPoints}
              formatValue={formatValue}
              emptyText={activeMetric === 'e1rm' ? 'No sets of 1–12 reps with weight in this range.' : undefined}
            />
            <Segmented label="Range" options={CHART_RANGES.map((r) => ({ value: r, label: r === 'ALL' ? 'ALL' : r }))} value={range} onChange={setRange} small />
          </View>

          <Text style={styles.section}>REP MAXES</Text>
          <View style={styles.card}>
            {repMaxes.map((r) => (
              <View key={r.target} style={styles.tableRow}>
                <Text style={styles.tableKey}>{`${r.target} RM`}</Text>
                <Text style={styles.tableValue}>
                  {r.weight === null ? '—' : `${formatWeight(r.weight, unit)} ${unit}${r.reps !== r.target ? ` × ${r.reps}` : ''}`}
                </Text>
                <Text style={styles.tableDate}>{r.localDate ? formatLocalDate(r.localDate, undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : ''}</Text>
              </View>
            ))}
            <Text style={styles.caption}>Heaviest weight lifted for at least that many reps (warm-ups excluded).</Text>
          </View>

          <Text style={styles.section}>HISTORY</Text>
          {bySession.map((g) => (
            <Pressable
              key={g.sessionId}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: String(g.sessionId) } })}
              accessibilityRole="button"
              accessibilityLabel={`${g.name}, ${longDate(g.localDate)}, ${g.sets.length} sets. Open workout.`}
            >
              <View style={styles.sessionHead}>
                <Text style={styles.sessionDate}>{longDate(g.localDate)}</Text>
                <Text style={styles.sessionName} numberOfLines={1}>{g.name}</Text>
              </View>
              {g.sets.map((s) => (
                <View key={s.setId} style={styles.setRow}>
                  <Text style={styles.setNo}>{SET_TYPE_LETTER[s.setType] || String(s.setNumber)}</Text>
                  <Text style={styles.setText}>
                    {`${formatLoad(s.weight, unit, bodyweight)} × ${s.reps}${s.rpe !== null ? `  @${s.rpe}` : ''}`}
                  </Text>
                  {prLabels.has(s.setId) && <Text style={styles.pr}>{`PR · ${prLabels.get(s.setId)}`}</Text>}
                </View>
              ))}
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...typography.title, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  statLabel: { ...typography.label, fontSize: 9, color: colors.textSecondary },
  statValue: { ...typography.numeric, color: colors.accent, marginTop: spacing.xs },
  card: { backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  emptyTitle: { ...typography.heading, color: colors.textPrimary },
  section: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  tableKey: { ...typography.label, color: colors.textSecondary, width: 56 },
  tableValue: { ...typography.numeric, color: colors.textPrimary, flex: 1 },
  tableDate: { ...typography.numericSmall, color: colors.textTertiary },
  caption: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  sessionHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  sessionDate: { ...typography.bodyStrong, color: colors.textPrimary },
  sessionName: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  setNo: { ...typography.numericSmall, color: colors.textTertiary, width: 18, textAlign: 'center' },
  setText: { ...typography.numeric, color: colors.textPrimary, flex: 1 },
  pr: { ...typography.label, fontSize: 10, color: colors.accent },
});
