/**
 * A segmented control in V1's tab-row style (gold fill on the selected segment).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  small = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken name of the group. */
  label: string;
  small?: boolean;
}) {
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segment, small && styles.small, active && styles.active]}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.text, active && styles.activeText]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radii.md, padding: 3 },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md - 2, paddingHorizontal: spacing.xs },
  small: { minHeight: 30 },
  active: { backgroundColor: colors.accent },
  text: { ...typography.label, color: colors.textSecondary },
  activeText: { color: colors.onAccent },
});
