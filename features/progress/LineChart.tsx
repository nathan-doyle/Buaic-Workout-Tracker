/**
 * A small line chart drawn with react-native-svg (no chart library; see
 * V2_PROGRESS.md → Decisions). Points are placed by date, so gaps between
 * sessions show as gaps in time. Tap anywhere to read the nearest point.
 */
import React, { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { daysBetween, formatLocalDate } from '../../lib/dates';
import { colors, spacing, typography } from '../../theme';

export interface ChartPoint {
  localDate: string;
  value: number;
}

const HEIGHT = 168;
const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

export default function LineChart({
  points,
  formatValue,
  title,
  emptyText = 'Nothing to chart in this range yet.',
}: {
  points: ChartPoint[];
  formatValue: (v: number) => string;
  /** Spoken name of the chart (accessibility). */
  title: string;
  emptyText?: string;
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const geometry = useMemo(() => {
    if (points.length === 0 || width === 0) return null;
    const first = points[0].localDate;
    const days = daysBetween(first, points[points.length - 1].localDate);
    // All on one day (e.g. two workouts today): spread by order instead of stacking at one x.
    const byIndex = days === 0;
    const span = Math.max(1, days);
    let min = Math.min(...points.map((p) => p.value));
    let max = Math.max(...points.map((p) => p.value));
    if (max - min < 1e-9) {
      min -= 1;
      max += 1;
    } else {
      const pad = (max - min) * 0.1;
      min -= pad;
      max += pad;
    }
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (p: ChartPoint, i: number) =>
      points.length === 1
        ? PAD.left + plotW / 2
        : PAD.left + (byIndex ? i / (points.length - 1) : daysBetween(first, p.localDate) / span) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;
    const xy = points.map((p, i) => ({ x: x(p, i), y: y(p.value) }));
    const d = xy.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const ticks = [max, (min + max) / 2, min].map((v) => ({ v, y: y(v) }));
    return { xy, d, ticks, plotW };
  }, [points, width]);

  const latest = points[points.length - 1];
  const best = points.reduce<ChartPoint | null>((b, p) => (b === null || p.value > b.value ? p : b), null);
  const shown = selected !== null && points[selected] ? points[selected] : null;
  const date = (d: string) => formatLocalDate(d, undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const pick = (locationX: number) => {
    if (!geometry) return;
    let nearest = 0;
    geometry.xy.forEach((pt, i) => {
      if (Math.abs(pt.x - locationX) < Math.abs(geometry.xy[nearest].x - locationX)) nearest = i;
    });
    setSelected(nearest);
  };

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height: HEIGHT }]}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.readout} numberOfLines={1}>
        {shown ? `${date(shown.localDate)} · ${formatValue(shown.value)}` : `Latest ${formatValue(latest.value)} · Best ${formatValue(best!.value)}`}
      </Text>
      <Pressable
        onLayout={onLayout}
        onPress={(e) => pick(e.nativeEvent.locationX)}
        accessibilityRole="image"
        accessibilityLabel={`${title}: ${points.length} ${points.length === 1 ? 'session' : 'sessions'}, latest ${formatValue(latest.value)} on ${date(latest.localDate)}, best ${formatValue(best!.value)}.`}
        accessibilityHint="Tap to read the nearest point"
      >
        <Svg width="100%" height={HEIGHT}>
          {geometry?.ticks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={PAD.left} x2={PAD.left + geometry.plotW} y1={t.y} y2={t.y} stroke={colors.border} strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={t.y + 4} fontSize={10} fill={colors.textTertiary} textAnchor="end">
                {formatValue(t.v).replace(/ (kg|lb)$/, '')}
              </SvgText>
            </React.Fragment>
          ))}
          {geometry && (
            <>
              <Path d={geometry.d} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {geometry.xy.length <= 60 &&
                geometry.xy.map((pt, i) => <Circle key={i} cx={pt.x} cy={pt.y} r={selected === i ? 5 : 3} fill={selected === i ? colors.textPrimary : colors.accent} />)}
              {selected !== null && geometry.xy[selected] && geometry.xy.length > 60 && (
                <Circle cx={geometry.xy[selected].x} cy={geometry.xy[selected].y} r={5} fill={colors.textPrimary} />
              )}
              <SvgText x={PAD.left} y={HEIGHT - 6} fontSize={10} fill={colors.textTertiary} textAnchor="start">
                {formatLocalDate(points[0].localDate, undefined, { day: 'numeric', month: 'short' })}
              </SvgText>
              {points.length > 1 && (
                <SvgText x={PAD.left + geometry.plotW} y={HEIGHT - 6} fontSize={10} fill={colors.textTertiary} textAnchor="end">
                  {formatLocalDate(latest.localDate, undefined, { day: 'numeric', month: 'short' })}
                </SvgText>
              )}
            </>
          )}
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { ...typography.numericSmall, color: colors.textSecondary, marginBottom: spacing.xs },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...typography.caption, color: colors.textTertiary },
});
