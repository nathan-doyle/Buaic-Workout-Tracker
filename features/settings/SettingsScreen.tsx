/**
 * Settings (Phase 5, full): units and calendar, rest timer, workout, bar and
 * plates, data (backup export/import, CSV export of sets (Phase 6) and restore
 * points), about (rate, version,
 * privacy). Every change is saved at once.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { BAR_OPTIONS, INCREMENT_OPTIONS, PLATE_OPTIONS, REST_PRESETS, type Settings, togglePlate } from '../../db/settings';
import { formatClock } from '../../lib/restTimer';
import { formatFileSize, type RestorePoint } from '../../lib/restorePoints';
import { colors, maxFontScale, radii, spacing, touchTarget, typography } from '../../theme';
import {
  applyBackup,
  deleteRestorePoint,
  describeBackup,
  exportBackup,
  exportSetsCsv,
  listRestorePoints,
  pickBackup,
  readRestorePoint,
} from '../backup/backupActions';
import { appVersion, canRateApp, rateApp } from '../review/reviewPrompt';
import { haptics } from '../ui/haptics';
import { Icon, type IconKey } from '../ui/Icon';
import { settingsStore, useSettings } from './settingsStore';

function save<K extends keyof Settings>(key: K, value: Settings[K]) {
  try {
    settingsStore.set(key, value);
    haptics.selection();
  } catch (error) {
    Alert.alert('Not saved', error instanceof Error ? error.message : String(error));
  }
}

const restLabel = (seconds: number) => (seconds < 60 ? `${seconds}s` : formatClock(seconds));

export default function SettingsScreen() {
  const settings = useSettings();
  const [busy, setBusy] = useState<'export' | 'csv' | 'import' | null>(null);
  const [points, setPoints] = useState<RestorePoint[]>([]);
  const unit = settings.unit;

  const reloadPoints = useCallback(() => {
    try {
      setPoints(listRestorePoints());
    } catch (error) {
      console.log('Listing restore points failed:', error);
      setPoints([]);
    }
  }, []);
  useFocusEffect(reloadPoints);

  const confirmReplace = (title: string, message: string, onReplace: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: onReplace },
    ]);

  const runImport = (apply: () => void, done: string) => {
    try {
      apply();
      haptics.success();
      Alert.alert('Done', done);
    } catch (error) {
      Alert.alert('Import failed', `Nothing was changed. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      reloadPoints();
    }
  };

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

  const onExportCsv = async () => {
    setBusy('csv');
    try {
      const result = await exportSetsCsv(unit);
      if (result.status === 'empty') {
        haptics.warning();
        Alert.alert('Nothing to export yet', 'The CSV has one row per set of each finished workout. Finish a workout first.');
      }
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
      confirmReplace('Replace all data?', describeBackup(picked.summary), () =>
        runImport(() => applyBackup(picked.backup), 'Your data was replaced with the backup.')
      );
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const pointLabel = (p: RestorePoint) =>
    p.createdAt.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const onRestorePoint = (p: RestorePoint) => {
    const picked = readRestorePoint(p);
    if (picked.status !== 'valid') {
      Alert.alert('Can’t restore this copy', picked.status === 'invalid' ? picked.error : 'Unknown file.');
      return;
    }
    Alert.alert(`Saved ${pointLabel(p)}`, 'Your data from just before an import.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete copy',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this copy?', 'The file is removed from this phone. This cannot be undone.', [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                try {
                  deleteRestorePoint(p);
                } catch (error) {
                  Alert.alert('Not deleted', error instanceof Error ? error.message : String(error));
                }
                reloadPoints();
              },
            },
          ]),
      },
      {
        text: 'Restore…',
        onPress: () =>
          confirmReplace('Restore this copy?', describeBackup(picked.summary).replace('This backup (exported', 'This copy (saved'), () =>
            runImport(() => applyBackup(picked.backup), 'Your data was restored from the copy.')
          ),
      },
    ]);
  };

  const plates = unit === 'kg' ? settings.platesKg : settings.platesLb;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="UNITS & CALENDAR">
        <Choice
          label="Weight unit"
          value={unit}
          onChange={(v) => save('unit', v)}
          options={[
            { value: 'kg', label: 'KG', a11y: 'Kilograms' },
            { value: 'lb', label: 'LB', a11y: 'Pounds' },
          ]}
        />
        <Choice
          label="Week starts on"
          value={settings.weekStart}
          onChange={(v) => save('weekStart', v)}
          options={[
            { value: 'monday', label: 'MONDAY' },
            { value: 'sunday', label: 'SUNDAY' },
          ]}
        />
      </Section>

      <Section title="REST TIMER">
        <Choice
          label="Default rest"
          value={settings.defaultRestSeconds}
          onChange={(v) => save('defaultRestSeconds', v)}
          options={REST_PRESETS.map((s) => ({ value: s, label: restLabel(s), a11y: `${s} seconds` }))}
        />
        <Toggle label="Start when a set is ticked" value={settings.autoStartRest} onChange={(v) => save('autoStartRest', v)} />
        <Toggle label="Sound when rest is over" value={settings.restSound} onChange={(v) => save('restSound', v)} />
        <Toggle label="Vibrate when rest is over" value={settings.restVibrate} onChange={(v) => save('restVibrate', v)} />
      </Section>

      <Section title="WORKOUT">
        <Toggle
          label="Keep screen awake"
          detail="While a workout is in progress"
          value={settings.keepAwake}
          onChange={(v) => save('keepAwake', v)}
        />
        <Toggle label="Progression hints" detail="Suggests the next weight or reps" value={settings.progressionHints} onChange={(v) => save('progressionHints', v)} />
        <Toggle label="RPE column" value={settings.showRpe} onChange={(v) => save('showRpe', v)} />
        <Choice
          label={`Weight step (${unit})`}
          value={unit === 'kg' ? settings.incrementKg : settings.incrementLb}
          onChange={(v) => save(unit === 'kg' ? 'incrementKg' : 'incrementLb', v)}
          // Values are already in the shown unit (not kg): label them as they are.
          options={INCREMENT_OPTIONS[unit].map((v) => ({ value: v, label: String(v), a11y: `${v} ${unit}` }))}
        />
      </Section>

      <Section title={`BAR & PLATES (${unit.toUpperCase()})`}>
        <Choice
          label="Bar"
          value={unit === 'kg' ? settings.barKg : settings.barLb}
          onChange={(v) => save(unit === 'kg' ? 'barKg' : 'barLb', v)}
          options={BAR_OPTIONS[unit].map((v) => ({ value: v, label: String(v), a11y: `${v} ${unit} bar` }))}
        />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Plates you have (per side)</Text>
          <View style={styles.chips}>
            {PLATE_OPTIONS[unit].map((p) => {
              const on = plates.includes(p);
              return (
                <Pressable
                  key={p}
                  onPress={() => save(unit === 'kg' ? 'platesKg' : 'platesLb', togglePlate(plates, p))}
                  style={[styles.plate, on && styles.plateOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${p} ${unit} plates`}
                >
                  <Text style={[styles.plateText, on && styles.plateTextOn]} maxFontSizeMultiplier={maxFontScale.control}>{String(p)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.note}>The plate calculator only uses the plates switched on. At least one stays on.</Text>
        </View>
      </Section>

      <Section title="DATA">
        <Row icon="share" label="Export backup (JSON)" onPress={onExport} busy={busy === 'export'} disabled={busy !== null} a11y="Export all data as a backup file" />
        <Row
          icon="spreadsheet"
          label="Export sets (CSV)"
          onPress={onExportCsv}
          busy={busy === 'csv'}
          disabled={busy !== null}
          a11y="Export every logged set as a spreadsheet file"
          hint="One row per set of each finished workout, for Excel, Numbers or Google Sheets"
        />
        <Row
          icon="restore"
          label="Import backup…"
          onPress={onImport}
          busy={busy === 'import'}
          disabled={busy !== null}
          a11y="Import a backup file"
          hint="Shows what the file contains before anything is replaced"
        />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Copies saved before an import</Text>
          {points.length === 0 ? (
            <Text style={styles.note}>None. Each import saves your current data here first.</Text>
          ) : (
            points.map((p) => (
              <Pressable
                key={p.name}
                onPress={() => onRestorePoint(p)}
                style={({ pressed }) => [styles.point, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Copy saved ${pointLabel(p)}, ${formatFileSize(p.size)}`}
                accessibilityHint="Restore or delete"
              >
                <Icon name="history" size={20} />
                <Text style={styles.pointText} maxFontSizeMultiplier={maxFontScale.control}>{pointLabel(p)}</Text>
                <Text style={styles.pointSize}>{formatFileSize(p.size)}</Text>
                <Icon name="forward" size={20} color={colors.textTertiary} />
              </Pressable>
            ))
          )}
        </View>
      </Section>

      <Section title="ABOUT">
        {canRateApp() && <Row icon="star" label="Rate Buaic" onPress={() => void rateApp().catch(() => {})} a11y="Rate Buaic in the app store" />}
        <View style={styles.privacy} accessible>
          <Icon name="privacy" color={colors.accent} />
          <Text style={styles.privacyText}>
            Buaic never sends your data anywhere: no account, no ads, no tracking. Your workouts are stored on this phone, and a backup is a
            file you share or save yourself.
          </Text>
        </View>
        <Text style={styles.version}>{`Buaic ${appVersion() ?? ''}`}</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; a11y?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              style={[styles.segment, selected && styles.segmentOn]}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.a11y ?? o.label}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextOn]} maxFontSizeMultiplier={maxFontScale.control}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      style={styles.toggle}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {detail && <Text style={styles.note}>{detail}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surface3, true: colors.accent }}
        thumbColor={value ? colors.textPrimary : colors.textSecondary}
        ios_backgroundColor={colors.surface3}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

function Row({
  icon,
  label,
  onPress,
  a11y,
  hint,
  busy,
  disabled,
}: {
  icon: IconKey;
  label: string;
  onPress: () => void;
  a11y: string;
  hint?: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={hint}
    >
      <Icon name={icon} color={colors.accent} />
      <Text style={styles.rowText}>{label}</Text>
      {busy ? <ActivityIndicator color={colors.accent} /> : <Icon name="forward" size={20} color={colors.textTertiary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.accent },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  field: { paddingVertical: spacing.md, gap: spacing.sm },
  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: {
    minHeight: touchTarget,
    minWidth: 56,
    flexGrow: 1,
    flexBasis: '28%', // at most three per row: six rest presets make two even rows
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { borderColor: colors.accent, backgroundColor: colors.surface3 },
  segmentText: { ...typography.numeric, fontSize: 13, color: colors.textSecondary },
  segmentTextOn: { color: colors.accent },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  toggleLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  plate: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  plateText: { ...typography.numeric, fontSize: 13, color: colors.textSecondary },
  plateTextOn: { color: colors.onAccent },
  note: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  rowText: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  point: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  pointText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  pointSize: { ...typography.numericSmall, color: colors.textTertiary },
  privacy: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  privacyText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, flex: 1 },
  version: { ...typography.numericSmall, color: colors.textTertiary, textAlign: 'center', paddingBottom: spacing.md },
  pressed: { opacity: 0.7 },
});
