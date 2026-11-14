/**
 * Create a custom exercise: name, optional variation, and the target muscle picked
 * on the body map (front and back, all 19 muscles incl. Traps, Obliques and
 * Adductors) or from the list under it.
 *
 * Phase 5: replaces V1's `components/AddExerciseModal.js` (16 tap regions drawn
 * with Views) with the Phase 4 SVG body map; same fields and behaviour: the
 * exercise goes into the library and is handed to `onExerciseAdded(id)`.
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetBottomInset } from '../ui/sheetInsets';

import { ALL_MUSCLE_GROUPS, createExercise } from '../../db/database';
import { colors, maxFontScale, radii, spacing, touchTarget, typography } from '../../theme';
import BodyMap from '../progress/BodyMap';
import { haptics } from '../ui/haptics';
import { IconButton } from '../ui/Icon';

interface Props {
  visible: boolean;
  onClose: () => void;
  onExerciseAdded: (id: number) => void;
  /** Where else it goes ("this workout", a routine name); shown under the picker. */
  destination?: string;
}

const NO_MISSING: ReadonlySet<string> = new Set();

export default function AddExerciseModal({ visible, onClose, onExerciseAdded, destination = '' }: Props) {
  const insets = useSafeAreaInsets();
  const bottomInset = useSheetBottomInset();
  const [name, setName] = useState('');
  const [variation, setVariation] = useState('');
  const [muscle, setMuscle] = useState('Upper Chest');

  const select = (m: string) => {
    haptics.selection();
    setMuscle(m);
  };

  const save = () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Enter the name of the exercise.');
      return;
    }
    const id = createExercise(name.trim(), variation.trim(), muscle);
    if (id === null) {
      Alert.alert('Not added', 'The exercise could not be saved. Is it already in your library?');
      return;
    }
    haptics.success();
    setName('');
    setVariation('');
    onExerciseAdded(id);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={[styles.overlay, { paddingTop: insets.top + spacing.lg }]} behavior="padding">
        <View style={[styles.sheet, { paddingBottom: bottomInset + spacing.md }]}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">New exercise</Text>
            <IconButton icon="close" label="Cancel" onPress={onClose} color={colors.textPrimary} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Barbell Deadlift"
              placeholderTextColor={colors.textDisabled}
              returnKeyType="done"
              value={name}
              onChangeText={setName}
              accessibilityLabel="Exercise name"
            />
            <Text style={styles.label}>VARIATION / EQUIPMENT (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Conventional, Deficit, Trap Bar"
              placeholderTextColor={colors.textDisabled}
              returnKeyType="done"
              value={variation}
              onChangeText={setVariation}
              accessibilityLabel="Variation or equipment, optional"
            />

            <Text style={styles.label}>TARGET MUSCLE · TAP THE BODY OR THE LIST</Text>
            <BodyMap levels={{ [muscle]: 4 }} missing={NO_MISSING} selected={muscle} onSelect={select} />

            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Target muscle">
              {ALL_MUSCLE_GROUPS.map((m) => {
                const on = m === muscle;
                return (
                  <Pressable
                    key={m}
                    onPress={() => select(m)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={maxFontScale.control}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.note}>
              {destination ? `Goes into your library and into ${destination}.` : 'Goes into your library.'}
            </Text>
          </ScrollView>

          <Pressable onPress={save} style={({ pressed }) => [styles.save, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Text style={styles.saveText} maxFontSizeMultiplier={maxFontScale.control}>{`ADD ${muscle.toUpperCase()} EXERCISE`}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '100%',
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.title, color: colors.textPrimary },
  content: { gap: spacing.sm, paddingBottom: spacing.lg },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    ...typography.body,
    minHeight: touchTarget,
    color: colors.textPrimary,
    backgroundColor: colors.surface2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    justifyContent: 'center',
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  chipText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  chipTextOn: { color: colors.onAccent },
  note: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  save: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...typography.label, fontSize: 13, letterSpacing: 1.5, color: colors.onAccent },
});
