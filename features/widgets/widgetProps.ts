/**
 * What the home-screen widget receives: the content from `lib/widgetSnapshot.ts`
 * plus the brand palette. The widget layout runs in an isolated runtime that can't
 * import anything (not even `theme/`), so the colours travel with the data.
 */
import type { WidgetContent } from '../../lib/widgetSnapshot';
import { colors } from '../../theme';

/** Must match the `widgets[].name` of the expo-widgets plugin in app.json. */
export const WIDGET_NAME = 'BuaicWidget';

export interface WidgetPalette {
  /** The BUAIC wordmark, letter-spaced with thin spaces (widgets can't set letter spacing). */
  brand: string;
  cBackground: string;
  cSurface: string;
  cAccent: string;
  cOnAccent: string;
  cText: string;
  cMuted: string;
  /** Day marks without a workout. */
  cIdle: string;
}

export type BuaicWidgetProps = WidgetContent & WidgetPalette;

export const WIDGET_PALETTE: WidgetPalette = {
  brand: 'B U A I C',
  cBackground: colors.background,
  cSurface: colors.surface2,
  cAccent: colors.accent,
  cOnAccent: colors.onAccent,
  cText: colors.textPrimary,
  cMuted: colors.textSecondary,
  cIdle: colors.surface3,
};

export function toWidgetProps(content: WidgetContent): BuaicWidgetProps {
  return { ...content, ...WIDGET_PALETTE };
}

/** Shown only if the widget is drawn before the app has pushed any data. */
export const PLACEHOLDER_PROPS: BuaicWidgetProps = toWidgetProps({
  weekLabel: 'THIS WEEK',
  workouts: 0,
  workoutsUnit: 'workouts',
  weekDetail: 'Open Buaic to update',
  dayLetters: 'MTWTFSS',
  trainedDays: '0000000',
  streak: 0,
  streakLabel: '',
  action: 'routines',
  nextLabel: 'BUAIC',
  nextName: 'Open Buaic',
  nextDetail: '',
  actionLabel: 'OPEN',
  url: 'buaic://widget',
  accessibilityLabel: 'Buaic. Open the app to update this widget.',
  asOf: '',
});
