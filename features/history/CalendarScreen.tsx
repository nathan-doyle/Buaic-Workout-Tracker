/**
 * Calendar: workout days by local date, a PR mark for any exercise (Big 3 PRs
 * highlighted, as V1's "!"), monthly totals, and tap a day to open its workout.
 * Weeks start on the day chosen in Settings.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getDb } from '../../db/database';
import { type CalendarDayInfo, getCalendarDays, getSessionTotals } from '../../db/progress';
import { addMonths, dayOfWeek, formatLocalDate, todayLocalDate } from '../../lib/dates';
import { monthTotals, type SessionTotal } from '../../lib/stats';
import { formatVolume } from '../../lib/units';
import { colors, maxFontScale, radii, spacing, typography } from '../../theme';
import { Icon } from '../ui/Icon';
import { useSettings } from '../settings/settingsStore';

export default function CalendarScreen() {
  const router = useRouter();
  const { unit, weekStart } = useSettings();
  const today = todayLocalDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<Record<string, CalendarDayInfo>>({});
  const [totals, setTotals] = useState<SessionTotal[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        const db = getDb();
        setDays(getCalendarDays(db));
        setTotals(getSessionTotals(db));
      } catch (error) {
        console.error('Loading calendar failed:', error);
      }
    }, [])
  );

  const first = `${month}-01`;
  const daysInMonth = lastDayOf(month);
  const lead = (dayOfWeek(first) - (weekStart === 'monday' ? 1 : 0) + 7) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weekLabels = weekStart === 'monday' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const sums = useMemo(() => monthTotals(totals, month), [totals, month]);
  const prDays = Object.entries(days).filter(([d, info]) => d.startsWith(month) && info.hasPr).length;

  const changeMonth = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelected(null);
    setMonth(addMonths(first, delta).slice(0, 7));
  };

  const openDay = (date: string) => {
    const info = days[date];
    if (!info) return;
    if (info.sessions.length === 1) router.push({ pathname: '/session/[id]', params: { id: String(info.sessions[0].id) } });
    else setSelected(date);
  };

  const monthName = formatLocalDate(first, undefined, { month: 'long', year: 'numeric' }).toUpperCase();
  const selectedInfo = selected ? days[selected] : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => changeMonth(-1)} style={styles.nav} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8}>
          <Icon name="back" size={28} color={colors.accent} />
        </Pressable>
        <Text style={styles.month} accessibilityRole="header">{monthName}</Text>
        <Pressable
          onPress={() => changeMonth(1)}
          style={[styles.nav, month >= today.slice(0, 7) && { opacity: 0.3 }]}
          disabled={month >= today.slice(0, 7)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
        >
          <Icon name="forward" size={28} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.totals} accessible accessibilityLabel={`${sums.workouts} workouts, ${sums.sets} sets, ${formatVolume(sums.volumeKg, unit)} ${unit} volume, ${prDays} PR days this month`}>
        <Total label="WORKOUTS" value={String(sums.workouts)} />
        <Total label="SETS" value={String(sums.sets)} />
        <Total label="VOLUME" value={`${formatVolume(sums.volumeKg, unit)} ${unit}`} />
        <Total label="PR DAYS" value={String(prDays)} />
      </View>

      <View style={styles.weekRow}>
        {weekLabels.map((d, i) => (
          <Text key={i} style={styles.weekDay} maxFontSizeMultiplier={maxFontScale.dense}>{d}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={i} style={styles.cell} />;
          const info = days[date];
          const isToday = date === today;
          const label = `${formatLocalDate(date, undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${info ? `, ${info.sessions.length} ${info.sessions.length === 1 ? 'workout' : 'workouts'}` : ''}${info?.hasBig3Pr ? ', Big 3 PR' : info?.hasPr ? ', PR' : ''}`;
          return (
            <Pressable
              key={i}
              style={styles.cell}
              onPress={() => openDay(date)}
              disabled={!info}
              accessibilityRole={info ? 'button' : undefined}
              accessibilityLabel={label}
            >
              <View style={[styles.day, info ? styles.dayWorkout : styles.dayEmpty, isToday && styles.dayToday, selected === date && styles.daySelected]}>
                <Text style={[styles.dayText, info && styles.dayTextWorkout]} maxFontSizeMultiplier={maxFontScale.dense}>{Number(date.slice(8))}</Text>
                {info?.hasBig3Pr ? <Text style={styles.big3} maxFontSizeMultiplier={maxFontScale.dense}>!</Text> : info?.hasPr ? <View style={styles.prDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={[styles.legendSwatch, styles.dayWorkout]} />
        <Text style={styles.legendText}>Workout</Text>
        <View style={[styles.prDot, styles.legendDot]} />
        <Text style={styles.legendText}>PR</Text>
        <Text style={[styles.big3, styles.legendBig3]}>!</Text>
        <Text style={styles.legendText}>Big 3 PR (bench, squat, deadlift)</Text>
      </View>

      {selectedInfo && selected && (
        <View style={styles.dayList}>
          <Text style={styles.dayListTitle}>{formatLocalDate(selected, undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          {selectedInfo.sessions.map((s) => (
            <Pressable
              key={s.id}
              style={({ pressed }) => [styles.sessionRow, pressed && { opacity: 0.7 }]}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: String(s.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, ${s.setCount} sets. Open workout.`}
            >
              <Text style={styles.sessionName}>{s.name}</Text>
              <Text style={styles.sessionSub}>{`${s.setCount} sets · ${formatVolume(s.volumeKg, unit)} ${unit}`}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function lastDayOf(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(0);
  d.setUTCFullYear(y, m, 0);
  return d.getUTCDate();
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.totalLabel} maxFontSizeMultiplier={maxFontScale.dense}>{label}</Text>
      <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={maxFontScale.control}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { ...typography.heading, color: colors.accent },
  month: { ...typography.label, fontSize: 14, color: colors.textPrimary, letterSpacing: 2 },
  totals: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  totalLabel: { ...typography.label, fontSize: 9, color: colors.textSecondary },
  totalValue: { ...typography.numeric, color: colors.accent, marginTop: 2 },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', ...typography.label, color: colors.textTertiary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  dayEmpty: { backgroundColor: colors.surface1 },
  dayWorkout: { backgroundColor: colors.accent },
  dayToday: { borderWidth: 2, borderColor: colors.textPrimary },
  daySelected: { borderWidth: 2, borderColor: colors.textSecondary },
  dayText: { ...typography.numericSmall, color: colors.textSecondary },
  dayTextWorkout: { color: colors.onAccent, fontWeight: '900' },
  prDot: { position: 'absolute', bottom: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.onAccent },
  big3: { position: 'absolute', top: 1, right: 5, fontSize: 12, fontWeight: '900', color: colors.onAccent },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendDot: { position: 'relative', bottom: 0, backgroundColor: colors.accent },
  legendBig3: { position: 'relative', top: 0, right: 0, color: colors.accent },
  legendText: { ...typography.caption, color: colors.textSecondary, marginRight: spacing.sm },
  dayList: { gap: spacing.sm },
  dayListTitle: { ...typography.label, color: colors.textSecondary },
  sessionRow: { backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 48 },
  sessionName: { ...typography.heading, color: colors.textPrimary },
  sessionSub: { ...typography.caption, color: colors.textSecondary },
});
