/**
 * Routine editor: name, exercises (target sets, rep range, rest), order, add and
 * remove. Every change is saved straight away.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '../../db/database';
import { getRoutine, getRoutineExercises, renameRoutine, type RoutineExercise, setRoutineExercises } from '../../db/routines';
import { REST_PRESETS } from '../../db/settings';
import { formatClock } from '../../lib/restTimer';
import { moveItem } from '../../lib/workoutDraft';
import { colors, radii, spacing, typography } from '../../theme';
import { Icon, type IconKey } from '../ui/Icon';
import { openExercisePicker } from '../library/pickExercise';
import { useSettings } from '../settings/settingsStore';
import ActionSheet from '../ui/ActionSheet';
import { activeWorkout, routineTemplates, useActiveWorkoutState } from '../workout/activeWorkout';

type Item = Pick<RoutineExercise, 'exerciseId' | 'name' | 'variation' | 'muscle' | 'targetSets' | 'repMin' | 'repMax' | 'restSeconds' | 'notes'>;

const parseOptionalInt = (text: string): number | null => {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : null;
};

export default function RoutineEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routineId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { defaultRestSeconds } = useSettings();
  const { session } = useActiveWorkoutState();

  const [name, setName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [restFor, setRestFor] = useState<number | null>(null);
  const skipSave = useRef(true);

  useEffect(() => {
    try {
      const routine = getRoutine(getDb(), routineId);
      if (!routine) return;
      setName(routine.name);
      setItems(getRoutineExercises(getDb(), routineId));
      setLoaded(true);
    } catch (error) {
      console.error('Loading routine failed:', error);
    }
  }, [routineId]);

  // Save the exercise list whenever it changes (not on the initial load).
  useEffect(() => {
    if (!loaded) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    try {
      setRoutineExercises(getDb(), routineId, items);
    } catch (error) {
      console.error('Saving routine failed:', error);
      Alert.alert('Could not save the routine');
    }
  }, [items, loaded, routineId]);

  const update = (index: number, patch: Partial<Item>) =>
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const saveName = () => {
    try {
      renameRoutine(getDb(), routineId, name);
    } catch (error) {
      console.error('Renaming routine failed:', error);
    }
  };

  const addExercises = () =>
    openExercisePicker(router, {
      title: 'Add to routine',
      multiple: true,
      excludeIds: items.map((i) => i.exerciseId),
      destination: `"${name}"`,
      onPick: (picked) =>
        setItems((list) => [
          ...list,
          ...picked
            .filter((p) => !list.some((i) => i.exerciseId === p.id))
            .map((p) => ({
              exerciseId: p.id,
              name: p.name,
              variation: p.variation,
              muscle: p.muscle,
              targetSets: 3,
              repMin: 8,
              repMax: 12,
              restSeconds: null,
              notes: null,
            })),
        ]),
    });

  const start = () => {
    if (session) {
      Alert.alert('Workout in progress', `Finish or discard "${session.name}" first.`);
      return;
    }
    saveName();
    if (activeWorkout.start(name.trim() || 'Workout', routineId, routineTemplates(routineId))) {
      router.dismissAll();
      router.push('/workout');
    }
  };

  if (!loaded) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.sub}>Routine not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen options={{ title: name || 'Routine' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>NAME</Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          onEndEditing={saveName}
          onBlur={saveName}
          placeholder="Routine name"
          placeholderTextColor={colors.textDisabled}
          maxLength={40}
          accessibilityLabel="Routine name"
        />

        {items.map((item, i) => (
          <View key={item.exerciseId} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exName}>
                  {item.name}
                  {item.variation ? <Text style={styles.variation}>{`  ${item.variation}`}</Text> : null}
                </Text>
                <Text style={styles.sub}>{item.muscle}</Text>
              </View>
              <Small icon="moveUp" a11y="Move up" disabled={i === 0} onPress={() => setItems((l) => moveItem(l, i, i - 1))} />
              <Small icon="moveDown" a11y="Move down" disabled={i === items.length - 1} onPress={() => setItems((l) => moveItem(l, i, i + 1))} />
              <Small icon="close" a11y={`Remove ${item.name}`} onPress={() => setItems((l) => l.filter((_, j) => j !== i))} />
            </View>
            <View style={styles.fields}>
              <Field label="SETS">
                <View style={styles.stepper}>
                  <Small icon="minus" a11y="Fewer sets" disabled={item.targetSets <= 1} onPress={() => update(i, { targetSets: item.targetSets - 1 })} />
                  <Text style={styles.value}>{item.targetSets}</Text>
                  <Small icon="plus" a11y="More sets" disabled={item.targetSets >= 20} onPress={() => update(i, { targetSets: item.targetSets + 1 })} />
                </View>
              </Field>
              <Field label="REPS">
                <View style={styles.stepper}>
                  <NumberInput value={item.repMin} onCommit={(v) => update(i, { repMin: v })} a11y="Minimum reps" />
                  <Text style={styles.sub}>–</Text>
                  <NumberInput value={item.repMax} onCommit={(v) => update(i, { repMax: v })} a11y="Maximum reps" />
                </View>
              </Field>
              <Field label="REST">
                <Pressable style={styles.rest} onPress={() => setRestFor(i)} accessibilityRole="button" accessibilityLabel="Rest time">
                  <Text style={styles.value}>{item.restSeconds ? formatClock(item.restSeconds) : `${formatClock(defaultRestSeconds)}*`}</Text>
                </Pressable>
              </Field>
            </View>
          </View>
        ))}

        <Pressable style={styles.add} onPress={addExercises} accessibilityRole="button">
          <Text style={styles.addText}>+ ADD EXERCISES</Text>
        </Pressable>
        <Text style={styles.footnote}>* Default rest from Settings.</Text>
        <Pressable style={[styles.start, items.length === 0 && styles.startDisabled]} disabled={items.length === 0} onPress={start} accessibilityRole="button">
          <Text style={styles.startText}>START THIS ROUTINE</Text>
        </Pressable>
      </ScrollView>

      <ActionSheet
        visible={restFor !== null}
        title="REST TIME"
        onClose={() => setRestFor(null)}
        actions={[
          { label: `Default (${formatClock(defaultRestSeconds)})`, onPress: () => restFor !== null && update(restFor, { restSeconds: null }) },
          ...REST_PRESETS.map((s) => ({ label: formatClock(s), onPress: () => restFor !== null && update(restFor, { restSeconds: s }) })),
        ]}
      />
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Small({ icon, a11y, onPress, disabled }: { icon: IconKey; a11y: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.small} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !!disabled }} hitSlop={4}>
      <Icon name={icon} size={20} color={disabled ? colors.textDisabled : colors.textPrimary} />
    </Pressable>
  );
}

function NumberInput({ value, onCommit, a11y }: { value: number | null; onCommit: (v: number | null) => void; a11y: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  return (
    <TextInput
      style={styles.numberInput}
      value={text}
      onChangeText={(t) => setText(t.replace(/[^0-9]/g, ''))}
      onEndEditing={() => onCommit(parseOptionalInt(text))}
      onBlur={() => onCommit(parseOptionalInt(text))}
      keyboardType="number-pad"
      selectTextOnFocus
      placeholder="–"
      placeholderTextColor={colors.textDisabled}
      maxLength={3}
      accessibilityLabel={a11y}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md },
  label: { ...typography.label, color: colors.textSecondary },
  nameInput: { ...typography.title, color: colors.textPrimary, backgroundColor: colors.surface2, borderRadius: radii.md, paddingHorizontal: spacing.md, minHeight: 48 },
  card: { backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  exName: { ...typography.heading, color: colors.textPrimary },
  variation: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  sub: { ...typography.caption, color: colors.textSecondary },
  fields: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { ...typography.numeric, color: colors.textPrimary, minWidth: 24, textAlign: 'center' },
  small: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  numberInput: { ...typography.numeric, color: colors.textPrimary, backgroundColor: colors.surface3, borderRadius: radii.sm, width: 44, height: 40, textAlign: 'center', paddingVertical: 0 },
  rest: { backgroundColor: colors.surface3, borderRadius: radii.sm, height: 40, paddingHorizontal: spacing.md, justifyContent: 'center' },
  add: { minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addText: { ...typography.label, fontSize: 13, color: colors.accent },
  footnote: { ...typography.caption, color: colors.textTertiary },
  start: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  startDisabled: { backgroundColor: colors.surface3 },
  startText: { ...typography.bodyStrong, color: colors.onAccent, letterSpacing: 2 },
});
