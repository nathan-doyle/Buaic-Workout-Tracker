/**
 * One past workout: its sets (with PR marks), duration and notes; edit (sets,
 * weights, reps, set types, RPE, date, name, notes) or delete it.
 *
 * Only completed workouts open here (`getSessionDetail`); a workout in progress
 * is edited on the workout screen. Saving and deleting go through
 * `db/history.ts`, then the open workout (if any) re-reads its bests.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '../../db/database';
import { deleteCompletedSession, getSessionDetail, prTimeline, saveSessionEdit, type SessionDetail, sessionDurationSeconds } from '../../db/history';
import { addDays, formatLocalDate, todayLocalDate } from '../../lib/dates';
import { prLabel } from '../../lib/prs';
import { formatDuration } from '../../lib/stats';
import { addSetTo, draftFromDetail, editFromDraft, type EditExerciseDraft, type EditSetDraft, type SessionEditDraft } from '../../lib/sessionEdit';
import { formatLoad, formatVolume, isBodyweightEquipment } from '../../lib/units';
import { SET_TYPES } from '../../lib/workoutDraft';
import { colors, radii, spacing, touchTarget, typography } from '../../theme';
import { Icon, type IconKey } from '../ui/Icon';
import { useSettings } from '../settings/settingsStore';
import { activeWorkout } from '../workout/activeWorkout';
import { requestWidgetUpdate } from '../widgets/widgetSync';

const TYPE_LETTER: Record<string, string> = { warmup: 'W', working: '', drop: 'D', failure: 'F' };
const TYPE_NAME: Record<string, string> = { warmup: 'Warm-up', working: 'Working', drop: 'Drop', failure: 'Failure' };

export default function SessionScreen({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unit, showRpe } = useSettings();
  const [detail, setDetail] = useState<SessionDetail | null | undefined>(undefined);
  const [prs, setPrs] = useState<Map<number, string>>(new Map());
  const [draft, setDraft] = useState<SessionEditDraft | null>(null);

  const load = useCallback(() => {
    try {
      const db = getDb();
      setDetail(getSessionDetail(db, sessionId));
      setPrs(new Map(prTimeline(db).filter((e) => e.sessionId === sessionId).map((e) => [e.setId, prLabel(e.prs) ?? 'PR'])));
    } catch (error) {
      console.error('Loading workout failed:', error);
      setDetail(null);
    }
  }, [sessionId]);
  const editing = draft !== null;
  useFocusEffect(useCallback(() => (editing ? undefined : load()), [load, editing]));

  const cancelEdit = useCallback(() => {
    if (!draft) return;
    Alert.alert('Discard changes?', 'Your edits to this workout will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setDraft(null) },
    ]);
  }, [draft]);

  // Android back while editing asks first instead of leaving.
  useEffect(() => {
    if (!draft) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelEdit();
      return true;
    });
    return () => sub.remove();
  }, [draft, cancelEdit]);

  const afterChange = () => {
    requestWidgetUpdate();
    try {
      activeWorkout.reloadHistory();
    } catch (error) {
      console.error('Refreshing the open workout failed:', error);
    }
  };

  const save = () => {
    if (!draft) return;
    const result = editFromDraft(draft, unit, todayLocalDate());
    if (!result.ok) {
      Alert.alert("Can't save yet", result.error);
      return;
    }
    try {
      saveSessionEdit(getDb(), sessionId, result.edit);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      afterChange();
      setDraft(null);
      load();
    } catch (error) {
      console.error('Saving workout failed:', error);
      Alert.alert("Couldn't save", error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const confirmDelete = () => {
    if (!detail) return;
    Alert.alert('Delete workout?', `${detail.name} on ${longDate(detail.localDate)} and all its sets will be deleted. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            if (deleteCompletedSession(getDb(), sessionId)) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              afterChange();
              router.back();
            }
          } catch (error) {
            console.error('Deleting workout failed:', error);
            Alert.alert("Couldn't delete", 'Please try again.');
          }
        },
      },
    ]);
  };

  const totals = useMemo(() => {
    if (!detail) return { sets: 0, volume: 0 };
    const sets = detail.exercises.flatMap((e) => e.sets);
    return { sets: sets.length, volume: sets.reduce((v, s) => v + s.weight * s.reps, 0) };
  }, [detail]);

  if (detail === undefined) return <View style={styles.container} />;
  if (detail === null) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <TopBar title="Workout" onBack={() => router.back()} />
        <Text style={[styles.sub, { padding: spacing.lg }]}>This workout no longer exists.</Text>
      </SafeAreaView>
    );
  }

  const duration = sessionDurationSeconds(detail.startedAt, detail.endedAt);
  const updateExercise = (index: number, next: EditExerciseDraft) =>
    setDraft((d) => (d ? { ...d, exercises: d.exercises.map((e, i) => (i === index ? next : e)) } : d));
  const updateSet = (exIndex: number, setIndex: number, patch: Partial<EditSetDraft>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            exercises: d.exercises.map((e, i) =>
              i === exIndex ? { ...e, sets: e.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) } : e
            ),
          }
        : d
    );
  const rpeColumn = showRpe || detail.exercises.some((e) => e.sets.some((s) => s.rpe !== null));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !draft }} />
      <TopBar
        title={draft ? 'Edit workout' : detail.name}
        onBack={draft ? cancelEdit : () => router.back()}
        backLabel={draft ? 'Cancel' : 'Back'}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {draft ? (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput style={styles.input} value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} accessibilityLabel="Workout name" />
              <Text style={styles.fieldLabel}>DATE</Text>
              <View style={styles.dateRow}>
                <SmallButton icon="back" a11y="One day earlier" onPress={() => setDraft({ ...draft, localDate: shiftDate(draft.localDate, -1) })} />
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  value={draft.localDate}
                  onChangeText={(localDate) => setDraft({ ...draft, localDate })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel="Date, year month day"
                />
                <SmallButton icon="forward" a11y="One day later" onPress={() => setDraft({ ...draft, localDate: shiftDate(draft.localDate, 1) })} />
              </View>
              <Text style={styles.caption}>{longDate(draft.localDate)}</Text>
              <Text style={styles.fieldLabel}>NOTES</Text>
              <TextInput style={[styles.input, styles.multiline]} value={draft.notes} onChangeText={(notes) => setDraft({ ...draft, notes })} multiline placeholder="How did it go?" placeholderTextColor={colors.textDisabled} accessibilityLabel="Workout notes" />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.title}>{detail.name}</Text>
              <Text style={styles.sub}>{longDate(detail.localDate)}</Text>
              <View style={styles.statsRow}>
                <Stat label="DURATION" value={duration === null ? '—' : formatDuration(duration)} />
                <Stat label="SETS" value={String(totals.sets)} />
                <Stat label="VOLUME" value={`${formatVolume(totals.volume, unit)} ${unit}`} />
                <Stat label="PRS" value={String(prs.size)} />
              </View>
              {detail.notes ? <Text style={styles.notes}>{detail.notes}</Text> : null}
            </View>
          )}

          {(draft ? draft.exercises : detail.exercises).map((ex, exIndex) => {
            const bw = isBodyweightEquipment(ex.equipment);
            if (draft) {
              const e = ex as EditExerciseDraft;
              return (
                <View key={e.exerciseId} style={styles.card}>
                  <Text style={styles.exName}>{[e.name, e.variation].filter(Boolean).join(' · ')}</Text>
                  {e.sets.length === 0 && <Text style={styles.caption}>No sets: this exercise will be removed from the workout.</Text>}
                  {e.sets.map((s, setIndex) => (
                    <View key={s.key} style={styles.editRow}>
                      <Pressable
                        style={styles.typeChip}
                        onPress={() => updateSet(exIndex, setIndex, { setType: SET_TYPES[(SET_TYPES.indexOf(s.setType) + 1) % SET_TYPES.length] })}
                        accessibilityRole="button"
                        accessibilityLabel={`Set ${setIndex + 1}, ${TYPE_NAME[s.setType]}. Change set type`}
                      >
                        <Text style={styles.typeText}>{TYPE_LETTER[s.setType] || String(setIndex + 1)}</Text>
                      </Pressable>
                      <TextInput
                        style={[styles.input, styles.numInput]}
                        value={s.weight.text}
                        onChangeText={(text) => updateSet(exIndex, setIndex, { weight: { ...s.weight, text } })}
                        placeholder="BW"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        accessibilityLabel={`Set ${setIndex + 1} weight in ${unit}`}
                      />
                      <Text style={styles.times}>{`${unit} ×`}</Text>
                      <TextInput
                        style={[styles.input, styles.numInput]}
                        value={s.reps}
                        onChangeText={(reps) => updateSet(exIndex, setIndex, { reps })}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        accessibilityLabel={`Set ${setIndex + 1} reps`}
                      />
                      {rpeColumn && (
                        <TextInput
                          style={[styles.input, styles.rpeInput]}
                          value={s.rpe}
                          onChangeText={(rpe) => updateSet(exIndex, setIndex, { rpe })}
                          placeholder="RPE"
                          placeholderTextColor={colors.textDisabled}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          accessibilityLabel={`Set ${setIndex + 1} RPE`}
                        />
                      )}
                      <Pressable
                        style={styles.removeBtn}
                        onPress={() => updateExercise(exIndex, { ...e, sets: e.sets.filter((_, j) => j !== setIndex) })}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete set ${setIndex + 1}`}
                        hitSlop={4}
                      >
                        <Icon name="close" size={20} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={styles.addSet} onPress={() => updateExercise(exIndex, addSetTo(e))} accessibilityRole="button" accessibilityLabel={`Add a set to ${e.name}`}>
                    <Text style={styles.link}>+ Add set</Text>
                  </Pressable>
                  <TextInput
                    style={[styles.input, styles.exNotes]}
                    value={e.notes}
                    onChangeText={(notes) => updateExercise(exIndex, { ...e, notes })}
                    placeholder="Exercise notes"
                    placeholderTextColor={colors.textDisabled}
                    accessibilityLabel={`${e.name} notes`}
                  />
                </View>
              );
            }
            const e = ex as SessionDetail['exercises'][number];
            return (
              <View key={e.exerciseId} style={styles.card}>
                <Pressable
                  onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(e.exerciseId) } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.name}, open exercise progress`}
                  style={styles.exHead}
                >
                  <Text style={styles.exName}>{[e.name, e.variation].filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
                <Text style={styles.caption}>{e.muscle}</Text>
                {e.sets.map((s) => (
                  <View key={s.id} style={styles.setRow}>
                    <Text style={styles.setNo}>{TYPE_LETTER[s.setType] || String(s.setNumber)}</Text>
                    <Text style={styles.setText}>{`${formatLoad(s.weight, unit, bw)} × ${s.reps}${s.rpe !== null ? `  @${s.rpe}` : ''}`}</Text>
                    {prs.has(s.id) && <Text style={styles.pr}>{`PR · ${prs.get(s.id)}`}</Text>}
                  </View>
                ))}
                {e.notes ? <Text style={styles.notes}>{e.notes}</Text> : null}
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {draft ? (
            <>
              <Pressable style={[styles.button, styles.secondary]} onPress={cancelEdit} accessibilityRole="button">
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.primary, { flex: 1 }]} onPress={save} accessibilityRole="button" accessibilityLabel="Save changes">
                <Text style={styles.primaryText}>SAVE</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={[styles.button, styles.secondary]} onPress={confirmDelete} accessibilityRole="button" accessibilityLabel="Delete workout">
                <Text style={styles.dangerText}>Delete</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.primary, { flex: 1 }]} onPress={() => setDraft(draftFromDetail(detail, unit))} accessibilityRole="button" accessibilityLabel="Edit workout">
                <Text style={styles.primaryText}>EDIT</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function shiftDate(localDate: string, days: number): string {
  try {
    const next = addDays(localDate, days);
    return next > todayLocalDate() ? localDate : next;
  } catch {
    return localDate;
  }
}

function longDate(localDate: string | null): string {
  if (!localDate) return '';
  try {
    return formatLocalDate(localDate, undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export function TopBar({ title, onBack, backLabel = 'Back' }: { title: string; onBack: () => void; backLabel?: string }) {
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel={backLabel} hitSlop={8}>
        <Text style={styles.backText}>{backLabel === 'Back' ? '‹ Back' : backLabel}</Text>
      </Pressable>
      <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.back} />
    </View>
  );
}

function SmallButton({ icon, a11y, onPress }: { icon: IconKey; a11y: string; onPress: () => void }) {
  return (
    <Pressable style={styles.smallBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y}>
      <Icon name={icon} size={24} color={colors.accent} />
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: spacing.sm },
  back: { minWidth: 72, minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm },
  backText: { ...typography.bodyStrong, color: colors.accent },
  topTitle: { ...typography.heading, color: colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  title: { ...typography.title, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  statLabel: { ...typography.label, fontSize: 9, color: colors.textSecondary },
  statValue: { ...typography.numeric, color: colors.accent, marginTop: 2 },
  notes: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, fontStyle: 'italic' },
  exHead: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  exName: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  chev: { ...typography.heading, color: colors.textTertiary },
  caption: { ...typography.caption, color: colors.textTertiary },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 26 },
  setNo: { ...typography.numericSmall, color: colors.textTertiary, width: 18, textAlign: 'center' },
  setText: { ...typography.numeric, color: colors.textPrimary, flex: 1 },
  pr: { ...typography.label, fontSize: 10, color: colors.accent },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget,
  },
  multiline: { minHeight: 72, paddingTop: spacing.sm, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateInput: { flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] },
  smallBtn: { minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.surface2 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  typeChip: { width: 36, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.surface2 },
  typeText: { ...typography.numeric, color: colors.accent },
  numInput: { flex: 1, textAlign: 'center', paddingHorizontal: spacing.xs, fontVariant: ['tabular-nums'] },
  rpeInput: { width: 56, textAlign: 'center', paddingHorizontal: spacing.xs },
  times: { ...typography.caption, color: colors.textSecondary },
  removeBtn: { width: 36, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  addSet: { minHeight: touchTarget, justifyContent: 'center' },
  exNotes: { marginTop: spacing.xs },
  link: { ...typography.bodyStrong, color: colors.accent },
  bottomBar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface1, borderTopWidth: 1, borderColor: colors.border },
  button: { minHeight: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  primary: { backgroundColor: colors.accent },
  primaryText: { ...typography.bodyStrong, color: colors.onAccent, letterSpacing: 2 },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  secondaryText: { ...typography.bodyStrong, color: colors.textPrimary },
  dangerText: { ...typography.bodyStrong, color: colors.danger },
});
