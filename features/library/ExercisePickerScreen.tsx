/**
 * Exercise picker: search, filter by muscle or equipment, pick one or several.
 * "New exercise" opens V1's anatomical tap-the-muscle modal.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AddExerciseModal from './AddExerciseModal';
import { getDb } from '../../db/database';
import { getExercise, type LibraryExercise, listExercises } from '../../db/routines';
import { filterExercises } from '../../lib/exerciseSearch';
import { colors, radii, spacing, typography } from '../../theme';
import { Icon } from '../ui/Icon';
import { clearPickRequest, currentPickRequest } from './pickExercise';

export default function ExercisePickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [request] = useState(currentPickRequest);
  const [revision, setRevision] = useState(0);
  const exercises = useMemo(() => {
    try {
      return listExercises(getDb());
    } catch (error) {
      console.error('Loading exercises failed:', error);
      return [];
    }
  }, [revision]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const excluded = useMemo(() => new Set(request?.excludeIds ?? []), [request]);
  const muscles = useMemo(() => [...new Set(exercises.map((e) => e.muscle))].sort(), [exercises]);
  const equipments = useMemo(
    () => [...new Set(exercises.map((e) => e.equipment).filter((e): e is string => !!e))].sort(),
    [exercises]
  );
  const shown = useMemo(
    () => filterExercises(exercises, { query, muscle, equipment }),
    [exercises, query, muscle, equipment]
  );

  const finish = (picked: LibraryExercise[]) => {
    const req = request;
    clearPickRequest();
    router.back();
    if (req && picked.length > 0) req.onPick(picked);
  };

  const toggle = (e: LibraryExercise) => {
    if (excluded.has(e.id)) return;
    if (!request?.multiple) return finish([e]);
    setSelected((s) => (s.includes(e.id) ? s.filter((id) => id !== e.id) : [...s, e.id]));
  };

  if (!request) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ title: 'Exercises' }} />
        <Text style={styles.muted}>Nothing to pick for.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: request.title }} />
      <TextInput
        style={styles.search}
        placeholder="Search exercises"
        placeholderTextColor={colors.textDisabled}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel="Search exercises"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
        <Chip label="All" active={!muscle && !equipment} onPress={() => (setMuscle(null), setEquipment(null))} />
        {muscles.map((m) => (
          <Chip key={m} label={m} active={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
        ))}
        {equipments.map((q) => (
          <Chip key={`eq-${q}`} label={q} outline active={equipment === q} onPress={() => setEquipment(equipment === q ? null : q)} />
        ))}
      </ScrollView>
      <FlatList
        data={shown}
        keyExtractor={(e) => String(e.id)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Pressable style={styles.createRow} onPress={() => setShowCreate(true)} accessibilityRole="button">
            <Text style={styles.createText}>+ New exercise</Text>
          </Pressable>
        }
        ListEmptyComponent={<Text style={[styles.muted, { padding: spacing.lg }]}>No exercises match.</Text>}
        renderItem={({ item }) => {
          const isExcluded = excluded.has(item.id);
          const isSelected = selected.includes(item.id);
          return (
            <Pressable
              onPress={() => toggle(item)}
              disabled={isExcluded}
              style={({ pressed }) => [styles.row, pressed && styles.pressed, isSelected && styles.rowSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: isExcluded }}
              accessibilityLabel={`${item.name}${item.variation ? `, ${item.variation}` : ''}, ${item.muscle}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, isExcluded && styles.muted]}>
                  {item.name}
                  {item.variation ? <Text style={styles.variation}>{`  ${item.variation}`}</Text> : null}
                </Text>
                <Text style={styles.sub}>
                  {item.muscle}
                  {item.equipment && item.equipment !== item.variation ? ` · ${item.equipment}` : ''}
                </Text>
              </View>
              {isExcluded ? (
                <Text style={styles.check}>Added</Text>
              ) : (
                <View style={styles.checkBox}>{isSelected && <Icon name="check" size={22} color={colors.accent} />}</View>
              )}
            </Pressable>
          );
        }}
      />
      {request.multiple && (
        <Pressable
          style={[styles.addBtn, selected.length === 0 && styles.addBtnDisabled]}
          disabled={selected.length === 0}
          onPress={() => finish(selected.map((id) => exercises.find((e) => e.id === id)!).filter(Boolean))}
          accessibilityRole="button"
        >
          <Text style={styles.addText}>{selected.length === 0 ? 'Select exercises' : `Add ${selected.length}`}</Text>
        </Pressable>
      )}
      <AddExerciseModal
        visible={showCreate}
        destination={request.destination}
        onClose={() => setShowCreate(false)}
        onExerciseAdded={(id: number) => {
          setRevision((r) => r + 1);
          const created = getExercise(getDb(), id);
          if (!created) return;
          if (request.multiple) setSelected((s) => (s.includes(id) || excluded.has(id) ? s : [...s, id]));
          else finish([created]);
        }}
      />
    </View>
  );
}

function Chip({ label, active, outline, onPress }: { label: string; active: boolean; outline?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, outline && styles.chipOutline, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  search: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    ...typography.body,
  },
  chips: { flexGrow: 0 },
  chipsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
  },
  chipOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.onAccent },
  createRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' },
  createText: { ...typography.bodyStrong, color: colors.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowSelected: { backgroundColor: colors.surface2 },
  pressed: { opacity: 0.6 },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  variation: { ...typography.caption, color: colors.accent },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  muted: { color: colors.textTertiary },
  check: { ...typography.bodyStrong, color: colors.accent, minWidth: 44, textAlign: 'right' },
  checkBox: { minWidth: 44, alignItems: 'flex-end' },
  addBtn: {
    margin: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: colors.surface3 },
  addText: { ...typography.bodyStrong, color: colors.onAccent, letterSpacing: 1 },
});
