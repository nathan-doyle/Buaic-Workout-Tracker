/**
 * Manage routines: create, add from a template, reorder (up/down), duplicate,
 * archive and restore. Tapping a routine opens its editor.
 */
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { getDb } from '../../db/database';
import { addTemplate, TEMPLATES } from '../../db/library';
import { createRoutine, duplicateRoutine, listRoutines, reorderRoutines, type RoutineSummary, setRoutineArchived } from '../../db/routines';
import { colors, radii, spacing, typography } from '../../theme';
import ActionSheet from '../ui/ActionSheet';

export default function RoutinesScreen() {
  const router = useRouter();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [menuFor, setMenuFor] = useState<RoutineSummary | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const reload = useCallback(() => {
    try {
      setRoutines(listRoutines(getDb(), true));
    } catch (error) {
      console.error('Loading routines failed:', error);
    }
  }, []);
  useFocusEffect(reload);

  const run = (what: string, fn: () => void) => {
    try {
      fn();
    } catch (error) {
      console.error(`${what} failed:`, error);
      Alert.alert(`Could not ${what.toLowerCase()}`);
    }
    reload();
  };

  const active = routines.filter((r) => r.archivedAt === null);
  const archived = routines.filter((r) => r.archivedAt !== null);
  const now = () => new Date().toISOString();

  const move = (index: number, to: number) =>
    run('Reorder', () => {
      const ids = active.map((r) => r.id);
      const [id] = ids.splice(index, 1);
      ids.splice(to, 0, id);
      reorderRoutines(getDb(), ids);
    });

  const open = (id: number) => router.push({ pathname: '/routine/[id]', params: { id: String(id) } });

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.primary]}
            onPress={() => {
              let id = 0;
              run('Create routine', () => {
                id = createRoutine(getDb(), 'New routine', now());
              });
              if (id) open(id);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>+ New routine</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={() => setShowTemplates(true)} accessibilityRole="button">
            <Text style={styles.secondaryText}>Add from template</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/library')} style={styles.libraryLink} accessibilityRole="button">
          <Text style={styles.link}>Exercise library →</Text>
        </Pressable>

        {active.map((r, i) => (
          <View key={r.id} style={styles.row}>
            <Pressable style={{ flex: 1 }} onPress={() => open(r.id)} accessibilityRole="button" accessibilityLabel={`Edit ${r.name}`}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {r.exerciseCount === 0 ? 'No exercises' : `${r.exerciseCount} ${r.exerciseCount === 1 ? 'exercise' : 'exercises'} · ${r.exerciseNames}`}
              </Text>
            </Pressable>
            <IconBtn label="▲" a11y={`Move ${r.name} up`} disabled={i === 0} onPress={() => move(i, i - 1)} />
            <IconBtn label="▼" a11y={`Move ${r.name} down`} disabled={i === active.length - 1} onPress={() => move(i, i + 1)} />
            <IconBtn label="⋯" a11y={`Options for ${r.name}`} onPress={() => setMenuFor(r)} />
          </View>
        ))}

        {archived.length > 0 && <Text style={styles.section}>ARCHIVED</Text>}
        {archived.map((r) => (
          <View key={r.id} style={[styles.row, styles.archived]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, styles.muted]}>{r.name}</Text>
              <Text style={styles.sub}>{`${r.exerciseCount} exercises`}</Text>
            </View>
            <Pressable onPress={() => run('Restore', () => setRoutineArchived(getDb(), r.id, false, now()))} style={styles.restore} accessibilityRole="button">
              <Text style={styles.link}>Restore</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.name}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                { label: 'Edit', onPress: () => open(menuFor.id) },
                { label: 'Duplicate', onPress: () => run('Duplicate', () => duplicateRoutine(getDb(), menuFor.id, now())) },
                {
                  label: 'Archive',
                  destructive: true,
                  onPress: () => run('Archive', () => setRoutineArchived(getDb(), menuFor.id, true, now())),
                },
              ]
            : []
        }
      />
      <ActionSheet
        visible={showTemplates}
        title="ADD FROM TEMPLATE"
        onClose={() => setShowTemplates(false)}
        actions={TEMPLATES.map((t) => ({
          label: t.routines.length > 1 ? `${t.name} (${t.routines.length} routines)` : t.name,
          onPress: () => run('Add template', () => addTemplate(getDb(), t.id)),
        }))}
      />
    </>
  );
}

function IconBtn({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.icon} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !!disabled }}>
      <Text style={[styles.iconText, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  actions: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1, minHeight: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.accent },
  primaryText: { ...typography.bodyStrong, color: colors.onAccent },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  secondaryText: { ...typography.bodyStrong, color: colors.textPrimary },
  libraryLink: { minHeight: 44, justifyContent: 'center' },
  link: { ...typography.bodyStrong, color: colors.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.lg,
    paddingVertical: spacing.sm,
  },
  archived: { opacity: 0.8 },
  name: { ...typography.heading, color: colors.textPrimary },
  muted: { color: colors.textSecondary },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  section: { ...typography.label, color: colors.textSecondary, marginTop: spacing.lg },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18, color: colors.textSecondary, fontWeight: '900' },
  disabled: { color: colors.textDisabled },
  restore: { paddingHorizontal: spacing.lg, minHeight: 44, justifyContent: 'center' },
});
