/**
 * Front and back body maps drawn with react-native-svg. Each muscle region is
 * drawn once for the left half and mirrored, so both sides always match. Regions
 * are tappable; the screen also lists every muscle as text (accessibility).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import type { CoverageLevel } from '../../lib/stats';
import { LEVEL_OPACITY, REGIONS, SILHOUETTE, type Side } from './bodyMapRegions';
import { colors, spacing, typography } from '../../theme';

export interface BodyMapProps {
  levels: Record<string, CoverageLevel>;
  /** Muscles with no exercise in an active routine (V1's red hint). */
  missing: ReadonlySet<string>;
  selected: string | null;
  onSelect: (muscle: string) => void;
  /** Press and hold a muscle (the new-exercise sheet: add/remove a secondary muscle). */
  onLongSelect?: (muscle: string) => void;
}

function Figure({ side, levels, missing, selected, onSelect, onLongSelect }: BodyMapProps & { side: Side }) {
  const regions = REGIONS[side];
  const half = (mirror: boolean) => (
    <G transform={mirror ? 'translate(200,0) scale(-1,1)' : undefined}>
      <Path d={SILHOUETTE} fill={colors.surface2} stroke={colors.borderStrong} strokeWidth={1} strokeLinejoin="round" />
      {regions.map((r) => {
        const level = levels[r.muscle] ?? 0;
        const isMissing = level === 0 && missing.has(r.muscle);
        const isSelected = selected === r.muscle;
        return (
          <Path
            key={r.muscle}
            d={r.d}
            // Phase 5 design pass: idle muscles a step lighter than the body so every region reads.
            fill={level === 0 ? colors.border : colors.accent}
            fillOpacity={level === 0 ? 1 : LEVEL_OPACITY[level]}
            stroke={isSelected ? colors.textPrimary : isMissing ? colors.danger : colors.background}
            strokeWidth={isSelected ? 2 : isMissing ? 1.5 : 1}
            strokeDasharray={isMissing && !isSelected ? '3,2' : undefined}
            strokeLinejoin="round"
            onPress={() => onSelect(r.muscle)}
            onLongPress={onLongSelect ? () => onLongSelect(r.muscle) : undefined}
            delayLongPress={onLongSelect ? 400 : undefined}
          />
        );
      })}
    </G>
  );
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{side === 'front' ? 'FRONT' : 'BACK'}</Text>
      <View style={styles.canvas}>
        <Svg viewBox="0 0 200 420" width="100%" height="100%">
          <Circle cx={100} cy={30} r={17} fill={colors.surface2} stroke={colors.borderStrong} strokeWidth={1} />
          {half(false)}
          {half(true)}
        </Svg>
      </View>
    </View>
  );
}

export default function BodyMap(props: BodyMapProps) {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Figure side="front" {...props} />
      <Figure side="back" {...props} />
    </View>
  );
}


const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  figure: { flex: 1, alignItems: 'center' },
  canvas: { width: '100%', aspectRatio: 200 / 420 },
  figureLabel: { ...typography.label, color: colors.textTertiary, marginBottom: spacing.xs },
});
