/**
 * Coverage v2: weekly working sets per muscle (secondary muscles count 0.5) on
 * front/back body maps, banded 0 · 1–4 · 5–9 · 10–20 · 20+. Rolling 7 days or the
 * calendar week. Tap a muscle (on the map or in the list) for that period's sets
 * and the exercises that train it. A dashed red outline keeps V1's hint: no
 * exercise for this muscle in your routines yet.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSheetBottomInset } from '../ui/sheetInsets';

import { getDb } from '../../db/database';
import { getCoverageSets, getExercisesForMuscle, getRoutineMuscles, type MuscleExercise } from '../../db/progress';
import { ALL_MUSCLE_GROUPS } from '../../db/v1Constants';
import { formatLocalDate, todayLocalDate } from '../../lib/dates';
import { COVERAGE_BANDS, type CoverageLevel, type CoverageMode, coverageLevel, coverageWindow, muscleSetCounts, SECONDARY_SET_WEIGHT } from '../../lib/stats';
import { colors, radii, spacing, typography } from '../../theme';
import { useSettings } from '../settings/settingsStore';
import Segmented from '../ui/Segmented';
import BodyMap from './BodyMap';
import { LEVEL_OPACITY } from './bodyMapRegions';

type Rows = ReturnType<typeof getCoverageSets>;

const fmtSets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function CoverageView() {
  const router = useRouter();
  const bottomInset = useSheetBottomInset();
  const { weekStart } = useSettings();
  const [mode, setMode] = useState<CoverageMode>('rolling');
  const [rows, setRows] = useState<Rows>([]);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [exercises, setExercises] = useState<MuscleExercise[]>([]);
  const today = todayLocalDate();
  const period = coverageWindow(mode, today, weekStart);

  useFocusEffect(
    useCallback(() => {
      try {
        const db = getDb();
        const routineMuscles = getRoutineMuscles(db);
        setMissing(new Set(ALL_MUSCLE_GROUPS.filter((m) => !routineMuscles.has(m))));
        setRows(getCoverageSets(db, period.from, period.to));
      } catch (error) {
        console.error('Loading coverage failed:', error);
      }
    }, [period.from, period.to])
  );

  const counts = useMemo(() => muscleSetCounts(rows), [rows]);
  const levels = useMemo(() => {
    const out: Record<string, CoverageLevel> = {};
    for (const m of ALL_MUSCLE_GROUPS) out[m] = coverageLevel(counts[m] ?? 0);
    return out;
  }, [counts]);

  const select = (muscle: string) => {
    setSelected(muscle);
    try {
      setExercises(getExercisesForMuscle(getDb(), muscle));
    } catch (error) {
      console.error('Loading exercises for muscle failed:', error);
      setExercises([]);
    }
  };

  // The selected muscle's sets in the window, per exercise.
  const detail = useMemo(() => {
    if (!selected) return [];
    const byExercise = new Map<number, { name: string; variation: string; sets: number; primary: boolean }>();
    for (const r of rows) {
      const primary = r.primaryMuscle === selected;
      if (!primary && !r.secondaryMuscles.includes(selected)) continue;
      const e = byExercise.get(r.exerciseId) ?? { name: r.name, variation: r.variation, sets: 0, primary };
      e.sets += 1;
      byExercise.set(r.exerciseId, e);
    }
    return [...byExercise.entries()].map(([id, e]) => ({ id, ...e })).sort((a, b) => Number(b.primary) - Number(a.primary) || b.sets - a.sets);
  }, [selected, rows]);

  const trained = ALL_MUSCLE_GROUPS.filter((m) => (counts[m] ?? 0) > 0).length;
  const range = `${formatLocalDate(period.from, undefined, { day: 'numeric', month: 'short' })} – ${formatLocalDate(period.to, undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <View style={styles.container}>
      <Segmented
        label="Coverage period"
        options={[
          { value: 'rolling', label: 'LAST 7 DAYS' },
          { value: 'week', label: 'THIS WEEK' },
        ]}
        value={mode}
        onChange={setMode}
        small
      />
      <Text style={styles.caption}>{`${range} · ${trained} of ${ALL_MUSCLE_GROUPS.length} muscles trained · working sets, secondary muscles count ½`}</Text>

      <BodyMap levels={levels} missing={missing} selected={selected} onSelect={select} />

      <View style={styles.legend} accessible accessibilityLabel={`Colour shows weekly sets: ${COVERAGE_BANDS.join(', ')}. A dashed red outline means no exercise for that muscle in your routines yet.`}>
        {COVERAGE_BANDS.map((band, i) => (
          <View key={band} style={styles.legendItem}>
            <View style={[styles.swatch, i === 0 ? { backgroundColor: colors.border } : { backgroundColor: colors.accent, opacity: LEVEL_OPACITY[i as CoverageLevel] }]} />
            <Text style={styles.legendText}>{band}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchMissing]} />
          <Text style={styles.legendText}>no exercise yet</Text>
        </View>
      </View>

      <Text style={styles.section}>SETS PER MUSCLE</Text>
      <View style={styles.pills}>
        {ALL_MUSCLE_GROUPS.map((m) => {
          const n = counts[m] ?? 0;
          const isMissing = n === 0 && missing.has(m);
          return (
            <Pressable
              key={m}
              onPress={() => select(m)}
              style={[styles.pill, n > 0 && styles.pillHit, isMissing && styles.pillMissing]}
              accessibilityRole="button"
              accessibilityLabel={`${m}: ${isMissing ? 'no exercise in your routines yet' : `${fmtSets(n)} sets`}. Show details.`}
            >
              <Text style={[styles.pillText, n > 0 && styles.pillTextHit, isMissing && styles.pillTextMissing]}>
                {`${m}: ${isMissing ? 'No exercise yet' : `${fmtSets(n)} sets`}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={styles.scrim} onPress={() => setSelected(null)} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { paddingBottom: bottomInset + spacing.lg }]} onPress={() => {}}>
            {selected && (
              <ScrollView style={{ maxHeight: 520 }} bounces={false}>
                <Text style={styles.sheetTitle}>{selected}</Text>
                <Text style={styles.caption}>{`${fmtSets(counts[selected] ?? 0)} working sets · ${range}`}</Text>
                {missing.has(selected) && (
                  <Text style={styles.hint}>No exercise for this muscle in your routines yet. Add one of the exercises below to a routine.</Text>
                )}
                <Text style={styles.section}>THIS PERIOD</Text>
                {detail.length === 0 ? (
                  <Text style={styles.caption}>No sets in this period.</Text>
                ) : (
                  detail.map((e) => (
                    <View key={e.id} style={styles.sheetRow}>
                      <Text style={styles.sheetName} numberOfLines={1}>{[e.name, e.variation].filter(Boolean).join(' · ')}</Text>
                      <Text style={styles.sheetValue}>
                        {e.primary ? `${e.sets} ${e.sets === 1 ? 'set' : 'sets'}` : `${e.sets} × ½ = ${fmtSets(e.sets * SECONDARY_SET_WEIGHT)}`}
                      </Text>
                    </View>
                  ))
                )}
                <Text style={styles.section}>EXERCISES THAT TRAIN IT</Text>
                {exercises.length === 0 && <Text style={styles.caption}>None in your library.</Text>}
                {exercises.slice(0, 30).map((e) => (
                  <Pressable
                    key={e.id}
                    style={styles.sheetRow}
                    onPress={() => {
                      setSelected(null);
                      router.push({ pathname: '/exercise/[id]', params: { id: String(e.id) } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.name}, ${e.primary ? 'primary' : 'secondary'}${e.inRoutine ? ', in a routine' : ''}. Open exercise.`}
                  >
                    <Text style={styles.sheetName} numberOfLines={1}>{[e.name, e.variation].filter(Boolean).join(' · ')}</Text>
                    <Text style={styles.sheetTag}>{[e.primary ? 'primary' : 'secondary', e.inRoutine ? 'in routine' : null].filter(Boolean).join(' · ')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  caption: { ...typography.caption, color: colors.textTertiary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  swatchMissing: { borderWidth: 1.5, borderColor: colors.danger, borderStyle: 'dashed', backgroundColor: colors.border },
  legendText: { ...typography.caption, color: colors.textSecondary },
  section: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 },
  pillHit: { borderColor: colors.accent },
  pillMissing: { borderColor: colors.danger, borderStyle: 'dashed' },
  pillText: { ...typography.caption, color: colors.textSecondary },
  pillTextHit: { color: colors.accent, fontWeight: '700' },
  pillTextMissing: { color: colors.danger },
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg },
  sheetTitle: { ...typography.title, color: colors.textPrimary },
  hint: { ...typography.body, color: colors.danger, marginTop: spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sheetName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  sheetValue: { ...typography.numericSmall, color: colors.accent },
  sheetTag: { ...typography.caption, color: colors.textTertiary },
});
