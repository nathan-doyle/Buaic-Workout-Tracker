/**
 * Plate calculator sheet, opened from any weight field. Uses the bar and plate set
 * for the current unit from Settings.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describePlates, platesPerSide } from '../../lib/plates';
import type { WeightUnit } from '../../lib/units';
import { colors, radii, spacing, typography } from '../../theme';
import { useSettings } from '../settings/settingsStore';

const trim = (n: number) => String(Math.round(n * 100) / 100);

export default function PlateSheet({ visible, target, unit, onClose }: { visible: boolean; target: number; unit: WeightUnit; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const bar = unit === 'kg' ? settings.barKg : settings.barLb;
  const plates = unit === 'kg' ? settings.platesKg : settings.platesLb;
  const result = platesPerSide(target, bar, plates);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close plate calculator">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
          <Text style={styles.label}>PLATES PER SIDE</Text>
          <Text style={styles.target}>{`${trim(target)} ${unit}`}</Text>
          <Text style={styles.sub}>{`Bar ${trim(bar)} ${unit}`}</Text>
          {result.belowBar ? (
            <Text style={styles.body}>Lighter than the empty bar.</Text>
          ) : result.perSide.length === 0 ? (
            <Text style={styles.body}>Just the bar.</Text>
          ) : (
            <View style={styles.plates} accessible accessibilityLabel={`Each side: ${describePlates(result.perSide)} ${unit}`}>
              {result.perSide.map((p, i) => (
                <View key={i} style={[styles.plate, { height: 36 + Math.min(80, (p / plates.reduce((a, b) => Math.max(a, b), p)) * 80) }]}>
                  <Text style={styles.plateText}>{trim(p)}</Text>
                </View>
              ))}
            </View>
          )}
          {!result.belowBar && result.perSide.length > 0 && <Text style={styles.body}>{describePlates(result.perSide)}</Text>}
          {result.remainder > 0 && !result.belowBar && (
            <Text style={styles.warn}>{`Closest with your plates: ${trim(result.achieved)} ${unit} (${trim(result.remainder)} ${unit} short).`}</Text>
          )}
          <Text style={styles.hint}>Change the bar and plates in Settings.</Text>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.xl, gap: spacing.sm },
  label: { ...typography.label, color: colors.textSecondary },
  target: { ...typography.numericLarge, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary },
  plates: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: spacing.md, minHeight: 120 },
  plate: { width: 34, borderRadius: radii.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  plateText: { ...typography.numericSmall, color: colors.onAccent, fontSize: 11 },
  body: { ...typography.body, color: colors.textPrimary },
  warn: { ...typography.caption, color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  close: { marginTop: spacing.md, minHeight: 48, borderRadius: radii.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  closeText: { ...typography.bodyStrong, color: colors.onAccent },
});
