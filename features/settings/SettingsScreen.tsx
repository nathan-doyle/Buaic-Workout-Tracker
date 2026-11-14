/**
 * Minimal Settings (Phase 2): unit, week start, default rest, and the JSON backup.
 * The full settings screen arrives in Phase 5.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';

import { REST_PRESETS, type Settings } from '../../db/settings';
import { colors, radii, spacing, touchTarget, typography } from '../../theme';
import { applyBackup, describeBackup, exportBackup, pickBackup } from '../backup/backupActions';
import { settingsStore, useSettings } from './settingsStore';

interface Option<T> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              style={[styles.segment, selected && styles.segmentSelected]}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function save<K extends keyof Settings>(key: K, value: Settings[K]) {
  try {
    settingsStore.set(key, value);
    Haptics.selectionAsync();
  } catch (error) {
    Alert.alert('Not saved', error instanceof Error ? error.message : String(error));
  }
}

export default function SettingsScreen() {
  const settings = useSettings();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const onExport = async () => {
    setBusy('export');
    try {
      await exportBackup();
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    setBusy('import');
    try {
      const picked = await pickBackup();
      if (picked.status === 'canceled') return;
      if (picked.status === 'invalid') {
        Alert.alert('Can’t import this file', picked.error);
        return;
      }
      Alert.alert('Replace all data?', describeBackup(picked.summary), [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            try {
              applyBackup(picked.backup);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Backup imported', 'Your data was replaced with the backup.');
            } catch (error) {
              Alert.alert(
                'Import failed',
                `Nothing was changed. ${error instanceof Error ? error.message : String(error)}`
              );
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Segmented
        label="WEIGHT UNIT"
        value={settings.unit}
        onChange={(unit) => save('unit', unit)}
        options={[
          { value: 'kg', label: 'KG', accessibilityLabel: 'Kilograms' },
          { value: 'lb', label: 'LB', accessibilityLabel: 'Pounds' },
        ]}
      />
      <Segmented
        label="WEEK STARTS ON"
        value={settings.weekStart}
        onChange={(weekStart) => save('weekStart', weekStart)}
        options={[
          { value: 'monday', label: 'MONDAY' },
          { value: 'sunday', label: 'SUNDAY' },
        ]}
      />
      <Segmented
        label="DEFAULT REST"
        value={settings.defaultRestSeconds}
        onChange={(seconds) => save('defaultRestSeconds', seconds)}
        options={REST_PRESETS.map((seconds) => ({
          value: seconds,
          label: seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
          accessibilityLabel: `${seconds} seconds`,
        }))}
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>BACKUP</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={onExport}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Export all data as a backup file"
        >
          {busy === 'export' ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.buttonText}>EXPORT BACKUP (JSON)</Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={onImport}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Import a backup file"
          accessibilityHint="Shows what the file contains before anything is replaced"
        >
          {busy === 'import' ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.buttonText}>IMPORT BACKUP…</Text>
          )}
        </Pressable>
        <Text style={styles.note}>
          Buaic never sends your data anywhere. A backup is a file you share or save yourself; importing one replaces
          the data on this phone after you confirm.
        </Text>
      </View>

      <Text style={styles.version}>Buaic {Constants.expoConfig?.version ?? ''}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionLabel: { ...typography.label, color: colors.textSecondary },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segment: {
    minHeight: touchTarget,
    minWidth: 64,
    flexGrow: 1,
    flexBasis: '28%', // at most three per row, so six rest presets make two even rows
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { borderColor: colors.accent, backgroundColor: colors.surface3 },
  segmentText: { ...typography.label, color: colors.textSecondary },
  segmentTextSelected: { color: colors.accent },
  button: {
    minHeight: touchTarget,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...typography.label, color: colors.textPrimary },
  pressed: { opacity: 0.7 },
  note: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  version: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
});
