/**
 * Design tokens. New code takes colours, spacing, radii and type from here;
 * no raw hex values in components. (V1 StyleSheets are left as they are until
 * their screens are replaced.)
 *
 * Text colours meet WCAG AA (4.5:1) on the surfaces listed for them; see
 * theme/__tests__/tokens.test.ts.
 */
import type { TextStyle } from 'react-native';

export const colors = {
  /** App background (brand). */
  background: '#0F0F0F',
  /** Surface levels, lowest to highest elevation. */
  surface1: '#151515',
  surface2: '#1C1C1C',
  surface3: '#262626',
  border: '#333333',
  borderStrong: '#444444',

  /** Brand gold accent. */
  accent: '#D4AF37',
  /** Text and icons on an accent fill. */
  onAccent: '#000000',

  /** Text levels. */
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#949494',
  /** Disabled text and placeholders (exempt from contrast minimums). */
  textDisabled: '#5C5C5C',

  success: '#4CAF50',
  danger: '#FF5A5F',
  /** Fills behind success / danger text or icons. */
  successSurface: '#132A16',
  dangerSurface: '#3A1214',

  /** Modal scrim. */
  overlay: 'rgba(0, 0, 0, 0.85)',
} as const;

export type ColorToken = keyof typeof colors;

/** 4-point spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

/** Minimum touch target (iOS HIG 44 pt). */
export const touchTarget = 44;

/**
 * Caps for Dynamic Type / font scale (`maxFontSizeMultiplier`). Body text scales freely;
 * dense rows (set tables, calendar cells, the tab row, the rest bar) and fixed-size
 * controls stop growing where they would overflow.
 */
export const maxFontScale = {
  dense: 1.3,
  control: 1.5,
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * Type scale. System font (SF Pro on iOS, Roboto on Android); headings keep V1's
 * heavy, letter-spaced style. `numeric*` styles use tabular figures so timers,
 * weights and reps don't jitter.
 */
export const typography = {
  wordmark: { fontSize: 24, fontWeight: '900', letterSpacing: 3 },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  heading: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  bodyStrong: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  caption: { fontSize: 12, fontWeight: '400' },
  overline: { fontSize: 10, fontWeight: '400', letterSpacing: 2 },
  numericLarge: { fontSize: 40, fontWeight: '900', fontVariant: tabular },
  numeric: { fontSize: 15, fontWeight: '700', fontVariant: tabular },
  numericSmall: { fontSize: 12, fontWeight: '600', fontVariant: tabular },
} as const satisfies Record<string, TextStyle>;

export type TypographyToken = keyof typeof typography;
