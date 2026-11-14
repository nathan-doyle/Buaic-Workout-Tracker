/**
 * Exercise library: search and filter, create (V1's anatomical picker), archive and
 * restore. Archiving hides an exercise from pickers and routines and keeps its
 * history; a hard delete is only offered for exercises that were never logged.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import AddExerciseModal from './AddExerciseModal';
import { getDb } from '../../db/database';
import { deleteExerciseIfUnused, type LibraryExercise, listExercises, setExerciseArchived } from '../../db/routines';
import { filterExercises } from '../../lib/exerciseSearch';
import { colors, radii, spacing, typography } from '../../theme';
import { Icon } from '../ui/Icon';
import ActionSheet, { type SheetAction } from '../ui/ActionSheet';

export default function LibraryScreen() {
  const router = useRouter();
  const [all, setAll] = useState<LibraryExercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [menuFor, setMenuFor] = useState<LibraryExercise | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(() => {
    try {
      setAll(listExercises(getDb(), true));
    } catch (error) {
      console.error('Loading library failed:', error);
    }
  }, []);
  useFocusEffect(reload);

  const visible = useMemo(
    () => filterExercises(all.filter((e) => (showArchived ? e.archivedAt !== null : e.archivedAt === null)), { query, muscle, equipment: null }),
    [all, query, muscle, showArchived]
  );
  const muscles = useMemo(() => [...new Set(all.map((e) => e.muscle))].sort(), [all]);
  const archivedCount = all.filter((e) => e.archivedAt !== null).length;

  const actionsFor = (e: LibraryExercise): SheetAction[] => {
    const now = new Date().toISOString();
    const act = (fn: () => void) => () => {
      try {
        fn();
      } catch (error) {
        console.error('Library action failed:', error);
        Alert.alert('Something went wrong');
      }
      reload();
    };
    const list: SheetAction[] = [];
    if (e.archivedAt) list.push({ label: 'Restore', onPress: act(() => setExerciseArchived(getDb(), e.id, false, now)) });
    else
      list.push({
        label: 'Archive',
        onPress: act(() => setExerciseArchived(getDb(), e.id, true, now)),
      });
    if (e.setCount === 0) {
      list.push({
        label: 'Delete permanently',
        destructive: true,
        onPress: () =>
          Alert.alert(`Delete ${e.name}?`, 'It has never been logged. It is also removed from your routines. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: act(() => {
                if (!deleteExerciseIfUnused(getDb(), e.id)) Alert.alert('Cannot delete', 'It is used in a workout. Archive it instead.');
              }),
            },
          ]),
      });
    }
    return list;
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search exercises"
        placeholderTextColor={colors.textDisabled}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        accessibilityLabel="Search exercises"
      />
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={styles.chips} showsHorizontalScrollIndicator={false}>
        <Chip label="All" active={!muscle} onPress={() => setMuscle(null)} />
        {muscles.map((m) => (
          <Chip key={m} label={m} active={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
        ))}
      </ScrollView>
      <FlatList
        data={visible}
        keyExtractor={(e) => String(e.id)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Pressable onPress={() => setShowCreate(true)} style={styles.headerBtn} accessibilityRole="button">
              <Text style={styles.link}>+ New exercise</Text>
            </Pressable>
            {archivedCount > 0 && (
              <Pressable onPress={() => setShowArchived((s) => !s)} style={styles.headerBtn} accessibilityRole="button">
                <Text style={styles.link}>{showArchived ? 'Show active' : `Archived (${archivedCount})`}</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(item.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} ${item.variation}, ${item.muscle}, ${item.setCount} sets logged. Open progress.`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.name}
                {item.variation ? <Text style={styles.variation}>{`  ${item.variation}`}</Text> : null}
              </Text>
              <Text style={styles.sub}>
                {[item.muscle, item.equipment !== item.variation ? item.equipment : null, item.isCustom ? 'Custom' : null, item.setCount > 0 ? `${item.setCount} sets logged` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Pressable
              onPress={() => setMenuFor(item)}
              style={styles.menuBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Options for ${item.name}`}
            >
              <Icon name="more" size={22} />
            </Pressable>
          </Pressable>
        )}
      />
      <ActionSheet visible={menuFor !== null} title={menuFor ? [menuFor.name, menuFor.variation].filter(Boolean).join(" · ") : undefined} actions={menuFor ? actionsFor(menuFor) : []} onClose={() => setMenuFor(null)} />
      <AddExerciseModal visible={showCreate} onClose={() => setShowCreate(false)} onExerciseAdded={reload} />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && { color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: { margin: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface2, color: colors.textPrimary, borderRadius: radii.md, paddingHorizontal: spacing.md, minHeight: 44, ...typography.body },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface2 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { minHeight: 44, justifyContent: 'center' },
  link: { ...typography.bodyStrong, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  variation: { ...typography.caption, color: colors.accent },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  menuBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
