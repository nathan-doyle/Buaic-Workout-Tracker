/**
 * A bottom action list (Android alerts allow only three buttons).
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSheetBottomInset } from './sheetInsets';

import { colors, radii, spacing, typography } from '../../theme';

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export default function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const bottomInset = useSheetBottomInset();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={[styles.sheet, { paddingBottom: bottomInset + spacing.sm }]} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 480 }} bounces={false}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              disabled={a.disabled}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!a.disabled }}
            >
              <Text style={[styles.itemText, a.destructive && styles.destructive, a.disabled && styles.disabled]}>{a.label}</Text>
            </Pressable>
          ))}
          </ScrollView>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.item, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={[styles.itemText, styles.cancel]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface2,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
  },
  title: { ...typography.label, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md },
  item: { minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.xl },
  pressed: { backgroundColor: colors.surface3 },
  itemText: { ...typography.body, color: colors.textPrimary },
  destructive: { color: colors.danger },
  disabled: { color: colors.textDisabled },
  cancel: { color: colors.textSecondary, fontWeight: '700' },
});
