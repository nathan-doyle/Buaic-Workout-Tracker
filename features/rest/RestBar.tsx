/**
 * Compact rest-timer bar. It sits in the layout flow (never floating over inputs):
 * at the bottom of the active workout, and above the content on the tabs.
 * Tap the time for presets; −15 / +15, pause and skip.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { REST_PRESETS } from '../../db/settings';
import { formatClock, remainingSeconds, restProgress } from '../../lib/restTimer';
import { colors, maxFontScale, radii, spacing, typography } from '../../theme';
import { haptics } from '../ui/haptics';
import { Icon, type IconKey } from '../ui/Icon';
import { restTimer, useRestTimer } from './restTimer';

const tap = haptics.step;

export default function RestBar({ onPress }: { onPress?: () => void }) {
  const { timer, now } = useRestTimer();
  const [showPresets, setShowPresets] = useState(false);
  if (timer.status === 'idle') return null;

  const done = timer.status === 'done';
  const seconds = remainingSeconds(timer, now);
  const progress = restProgress(timer, now);

  return (
    <View style={[styles.bar, done && styles.barDone]}>
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      {showPresets && !done ? (
        <View style={styles.row}>
          {REST_PRESETS.map((p) => (
            <Btn
              key={p}
              label={formatClock(p)}
              a11y={`Restart rest at ${formatClock(p)}`}
              onPress={() => {
                tap();
                restTimer.start(p, timer.label);
                setShowPresets(false);
              }}
            />
          ))}
          <Btn icon="close" a11y="Close presets" onPress={() => setShowPresets(false)} />
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            style={styles.timeBox}
            onPress={() => (onPress ? onPress() : setShowPresets(true))}
            onLongPress={() => setShowPresets(true)}
            accessibilityRole="button"
            accessibilityLabel={done ? 'Rest over' : `Rest, ${seconds} seconds left. Tap for presets.`}
          >
            <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={maxFontScale.dense}>
              {done ? 'REST OVER' : timer.status === 'paused' ? 'PAUSED' : `REST${timer.label ? ` · ${timer.label}` : ''}`}
            </Text>
            <Text style={[styles.time, done && styles.timeDone]} maxFontSizeMultiplier={maxFontScale.dense}>{done ? 'GO' : formatClock(seconds)}</Text>
          </Pressable>
          {!done && (
            <>
              <Btn label="−15" a11y="Remove 15 seconds" onPress={() => (tap(), restTimer.adjust(-15))} />
              <Btn label="+15" a11y="Add 15 seconds" onPress={() => (tap(), restTimer.adjust(15))} />
              <Btn
                icon={timer.status === 'paused' ? 'play' : 'pause'}
                a11y={timer.status === 'paused' ? 'Resume rest' : 'Pause rest'}
                onPress={() => (tap(), restTimer.togglePause())}
              />
            </>
          )}
          <Btn {...(done ? { icon: 'close' as const } : { label: 'Skip' })} a11y={done ? 'Dismiss' : 'Skip rest'} onPress={() => (tap(), restTimer.skip())} />
        </View>
      )}
    </View>
  );
}

function Btn({ label, icon, a11y, onPress }: { label?: string; icon?: IconKey; a11y: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
    >
      {icon ? (
        <Icon name={icon} size={22} color={colors.textPrimary} />
      ) : (
        <Text style={styles.btnText} maxFontSizeMultiplier={maxFontScale.dense}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface2,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  barDone: { borderColor: colors.accent },
  progress: { position: 'absolute', left: 0, top: 0, height: 2, backgroundColor: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeBox: { flex: 1, minHeight: 44, justifyContent: 'center' },
  label: { ...typography.label, color: colors.textSecondary },
  time: { ...typography.numeric, fontSize: 22, color: colors.textPrimary },
  timeDone: { color: colors.accent },
  btn: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.6 },
  btnText: { ...typography.bodyStrong, color: colors.textPrimary },
});
