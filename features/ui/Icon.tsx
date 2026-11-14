/**
 * The one icon set (Phase 5): Material Community Icons from `@expo/vector-icons`.
 * The font ships inside the app (no download), looks the same on iOS and Android,
 * and native tabs can use it too. Screens name icons by meaning (`ICONS.calendar`),
 * so the set can be swapped in one place.
 */
import React from 'react';
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors, radii, touchTarget } from '../../theme';

export type GlyphName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Every icon the app uses, by meaning. */
export const ICONS = {
  calendar: 'calendar-month-outline',
  settings: 'cog-outline',
  open: 'chevron-up',
  minimise: 'chevron-down',
  back: 'chevron-left',
  forward: 'chevron-right',
  dropdown: 'menu-down',
  close: 'close',
  check: 'check-bold',
  more: 'dots-horizontal',
  moveUp: 'arrow-up',
  moveDown: 'arrow-down',
  next: 'arrow-right',
  minus: 'minus',
  plus: 'plus',
  play: 'play',
  pause: 'pause',
  increase: 'trending-up',
  share: 'share-variant',
  hide: 'eye-off-outline',
  show: 'eye-outline',
  trophy: 'trophy',
  timer: 'timer-outline',
  workout: 'dumbbell',
  history: 'history',
  progress: 'chart-line',
  exercises: 'format-list-bulleted',
  edit: 'pencil-outline',
  delete: 'delete-outline',
  restore: 'backup-restore',
  star: 'star-outline',
  privacy: 'shield-lock-outline',
  info: 'information-outline',
  bolt: 'lightning-bolt',
  spreadsheet: 'file-delimited-outline',
} as const satisfies Record<string, GlyphName>;

export type IconKey = keyof typeof ICONS;

/** Font to preload at startup so icons never flash in. */
export const iconFont = MaterialCommunityIcons.font;

export function Icon({ name, size = 22, color = colors.textSecondary }: { name: IconKey; size?: number; color?: string }) {
  // Decorative: the surrounding control carries the accessibility label.
  return (
    <MaterialCommunityIcons
      name={ICONS[name]}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

export interface IconButtonProps {
  icon: IconKey;
  /** Required: icon-only buttons must say what they do (VoiceOver / TalkBack). */
  label: string;
  onPress: () => void;
  hint?: string;
  size?: number;
  color?: string;
  disabled?: boolean;
  /** `filled` draws V1's round chip behind the icon (header buttons). */
  variant?: 'plain' | 'filled';
  style?: StyleProp<ViewStyle>;
}

/** An icon-only button with a ≥ 44 pt touch target and an accessibility label. */
export function IconButton({ icon, label, onPress, hint, size = 22, color, disabled, variant = 'plain', style }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={variant === 'filled' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        variant === 'filled' && styles.filled,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Icon name={icon} size={size} color={disabled ? colors.textDisabled : (color ?? colors.textSecondary)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  filled: {
    // V1's header chips were 34 × 32; hitSlop above brings the target to 44 pt.
    minWidth: 36,
    minHeight: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
});
