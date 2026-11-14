/**
 * Share card v2, drawn at a fixed logical size (360 wide; 9:16 or square) and
 * captured at 1080 px wide. Name, date, duration, volume, sets, PRs, exercises,
 * and a small BUAIC mark. Everything comes from `lib/shareCard`.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ShareCardData, ShareFormat } from '../../lib/shareCard';
import { colors, radii, spacing, typography } from '../../theme';
import { Icon } from '../ui/Icon';

export const CARD_WIDTH = 360;
export const cardHeight = (format: ShareFormat) => (format === 'story' ? 640 : 360);

export default function ShareCard({ card, format }: { card: ShareCardData; format: ShareFormat }) {
  const story = format === 'story';
  const stats: { label: string; value: string }[] = [
    ...(card.duration ? [{ label: 'TIME', value: card.duration }] : []),
    ...(card.volume ? [{ label: 'VOLUME', value: card.volume }] : []),
    { label: 'SETS', value: String(card.sets) },
    { label: 'PRS', value: String(card.prCount) },
  ];
  const prs = card.prs.slice(0, story ? 4 : 2);

  return (
    <View style={[styles.card, { height: cardHeight(format) }, story ? styles.storyPad : styles.squarePad]}>
      <View style={styles.topRule} />
      <View>
        <Text style={styles.date}>{card.dateLabel.toUpperCase()}</Text>
        <Text style={[styles.title, !story && styles.titleSquare]} numberOfLines={2} maxFontSizeMultiplier={1}>
          {card.title}
        </Text>
      </View>

      <View style={[styles.stats, story && styles.statsStory]}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.stat, story && styles.statStory]}>
            <Text style={styles.statLabel} maxFontSizeMultiplier={1}>{s.label}</Text>
            <Text style={[styles.statValue, s.label === 'PRS' && card.prCount > 0 && styles.gold]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1}>
              {s.value}
            </Text>
          </View>
        ))}
      </View>

      {prs.length > 0 && (
        <View style={styles.block}>
          {prs.map((p, i) => (
            <View key={`${p.exercise}-${i}`} style={styles.prRow}>
              <Icon name="trophy" size={14} color={colors.accent} />
              <Text style={styles.prText} numberOfLines={1} maxFontSizeMultiplier={1}>
                <Text style={styles.prName}>{p.exercise}</Text>
                {`  ${p.label} · ${p.detail}`}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.block, { flex: 1 }, !story && styles.blockSquare]}>
        {card.exercises.map((e, i) =>
          story ? (
            <View key={`${e.name}-${i}`} style={styles.exRow}>
              <Text style={styles.exName} numberOfLines={1} maxFontSizeMultiplier={1}>{e.name}</Text>
              <Text style={styles.exDetail} maxFontSizeMultiplier={1}>{`${e.sets} · ${e.top}`}</Text>
            </View>
          ) : (
            // Square: one compact line per exercise.
            <Text key={`${e.name}-${i}`} style={styles.exLine} numberOfLines={1} maxFontSizeMultiplier={1}>
              <Text style={styles.exLineName}>{e.name}</Text>
              {`  ${e.sets} · ${e.top}`}
            </Text>
          )
        )}
        {card.moreExercises > 0 && (
          <Text style={styles.more} maxFontSizeMultiplier={1}>{`+ ${card.moreExercises} more`}</Text>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.mark} maxFontSizeMultiplier={1}>BUAIC</Text>
        <Text style={styles.markSub} maxFontSizeMultiplier={1}>WORKOUT TRACKER</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, backgroundColor: colors.background, overflow: 'hidden', gap: spacing.lg },
  storyPad: { paddingHorizontal: spacing.xl, paddingTop: 44, paddingBottom: spacing.xl },
  squarePad: { paddingHorizontal: spacing.xl, paddingTop: 30, paddingBottom: spacing.lg, gap: spacing.md },
  topRule: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: colors.accent },
  date: { ...typography.overline, fontWeight: '700', color: colors.textSecondary },
  title: { ...typography.title, fontSize: 30, letterSpacing: 1.5, color: colors.textPrimary, marginTop: spacing.xs },
  titleSquare: { fontSize: 24 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  statsStory: { flexWrap: 'wrap' },
  stat: { flexGrow: 1, flexShrink: 1, flexBasis: 0, backgroundColor: colors.surface1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  statStory: { flexBasis: '45%', paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  statLabel: { ...typography.label, fontSize: 9, color: colors.textTertiary },
  statValue: { ...typography.numeric, fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginTop: 2 },
  gold: { color: colors.accent },
  block: { gap: spacing.sm },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  prText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  prName: { fontWeight: '700', color: colors.accent },
  exRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingBottom: spacing.sm },
  exName: { ...typography.bodyStrong, color: colors.textPrimary },
  exDetail: { ...typography.numericSmall, color: colors.textSecondary, marginTop: 2 },
  blockSquare: { gap: spacing.xs },
  exLine: { ...typography.numericSmall, color: colors.textSecondary },
  exLineName: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  more: { ...typography.caption, color: colors.textTertiary },
  footer: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  mark: { ...typography.label, fontSize: 14, fontWeight: '900', letterSpacing: 3, color: colors.accent },
  markSub: { ...typography.overline, fontSize: 8, color: colors.textTertiary },
});
