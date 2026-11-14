/**
 * After a finish: the share card v2 preview (replaces V1's WorkoutSummaryModal).
 * Story (9:16) or square, optional "hide weights", Share via the system sheet.
 * Format and hide-weights are remembered (Settings keys).
 */
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildShareCard, describeShareCard, SHARE_SIZES, type ShareFormat } from '../../lib/shareCard';
import type { WeightUnit } from '../../lib/units';
import { colors, maxFontScale, radii, spacing, touchTarget, typography } from '../../theme';
import { settingsStore, useSettings } from '../settings/settingsStore';
import Segmented from '../ui/Segmented';
import { haptics } from '../ui/haptics';
import { Icon, IconButton } from '../ui/Icon';
import type { WorkoutSummary } from '../workout/activeWorkoutStore';
import ShareCard, { CARD_WIDTH, cardHeight } from './ShareCard';

interface Props {
  visible: boolean;
  summary: WorkoutSummary | null;
  unit: WeightUnit;
  /** When the summary was shown (the card's date). */
  finishedAt: Date | null;
  onClose: () => void;
}

export default function WorkoutSummarySheet({ visible, summary, unit, finishedAt, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { shareFormat: format, shareHideWeights: hideWeights } = useSettings();
  const cardRef = useRef<React.ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);

  const card = useMemo(
    () => (summary ? buildShareCard(summary, { unit, hideWeights, format, now: finishedAt ?? new Date() }) : null),
    [summary, unit, hideWeights, format, finishedAt]
  );
  if (!summary || !card) return null;

  // Fit the fixed-size card into the space between the header and the controls.
  const boxW = width - spacing.lg * 2;
  const boxH = Math.max(200, height - insets.top - insets.bottom - 300);
  const scale = Math.min(boxW / CARD_WIDTH, boxH / cardHeight(format), 1.2);

  const setFormat = (f: ShareFormat) => {
    haptics.selection();
    settingsStore.set('shareFormat', f);
  };

  const share = async () => {
    haptics.setDone();
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device can’t share images.');
        return;
      }
      const size = SHARE_SIZES[format];
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: size.width, height: size.height });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share workout' });
    } catch (error) {
      console.error('Sharing the workout card failed:', error);
      Alert.alert('Share failed', 'The card could not be created or shared.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>WORKOUT COMPLETE</Text>
            <Text style={styles.headline} numberOfLines={1} accessibilityRole="header">
              {summary.newPRCount > 0 ? `${summary.newPRCount} new ${summary.newPRCount === 1 ? 'PR' : 'PRs'}` : 'Saved'}
            </Text>
          </View>
          <IconButton icon="close" label="Close summary" onPress={onClose} color={colors.textPrimary} />
        </View>

        <View style={styles.previewBox} accessible accessibilityRole="image" accessibilityLabel={`Share card: ${describeShareCard(card)}`}>
          <View style={{ width: CARD_WIDTH * scale, height: cardHeight(format) * scale }}>
            <View
              style={[
                styles.scaled,
                {
                  left: (CARD_WIDTH * scale - CARD_WIDTH) / 2,
                  top: (cardHeight(format) * scale - cardHeight(format)) / 2,
                  transform: [{ scale }],
                },
              ]}
            >
              <View style={styles.cardFrame}>
                {/* Captured without the preview frame, so the image has square corners. */}
                <View ref={cardRef} collapsable={false}>
                  {/* Remount per format: a fresh layout for each size. */}
                  <ShareCard key={format} card={card} format={format} />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.controls}>
          <Segmented
            label="Card format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'story', label: 'STORY 9:16' },
              { value: 'square', label: 'SQUARE' },
            ]}
          />
          <Pressable
            onPress={() => {
              haptics.selection();
              settingsStore.set('shareHideWeights', !hideWeights);
            }}
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
            accessibilityRole="switch"
            accessibilityState={{ checked: hideWeights }}
            accessibilityLabel="Hide weights on the card"
          >
            <Icon name={hideWeights ? 'hide' : 'show'} color={hideWeights ? colors.accent : colors.textSecondary} />
            <Text style={[styles.toggleText, hideWeights && { color: colors.accent }]} maxFontSizeMultiplier={maxFontScale.control}>
              {hideWeights ? 'Weights hidden' : 'Hide weights'}
            </Text>
          </Pressable>
          <Pressable
            onPress={share}
            disabled={sharing}
            style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Share card"
          >
            {sharing ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Icon name="share" color={colors.onAccent} />
                <Text style={styles.shareText} maxFontSizeMultiplier={maxFontScale.control}>SHARE CARD</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center' },
  overline: { ...typography.label, color: colors.accent },
  headline: { ...typography.title, color: colors.textPrimary },
  previewBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scaled: { position: 'absolute', width: CARD_WIDTH },
  cardFrame: { borderRadius: radii.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  controls: { gap: spacing.md },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  toggleText: { ...typography.bodyStrong, color: colors.textSecondary },
  shareBtn: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { ...typography.label, fontSize: 15, letterSpacing: 2, color: colors.onAccent },
  pressed: { opacity: 0.75 },
});
