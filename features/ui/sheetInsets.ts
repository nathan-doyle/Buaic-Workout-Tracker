/**
 * Bottom inset for a bottom sheet drawn in a `Modal` (Phase 8, iOS review).
 *
 * iOS: a Modal covers the whole window, but a sheet opened from a tab screen reads that
 * tab's SafeAreaProvider (expo-router wraps each iOS native tab in one), whose bottom
 * inset includes the tab bar, which the Modal covers. The window's own inset is the
 * right one; the app is portrait-only, so the launch value stays valid.
 * Android: unchanged (no per-tab provider; the root insets are the window's).
 */
import { Platform } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

export function useSheetBottomInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'ios') return insets.bottom;
  return initialWindowMetrics?.insets.bottom ?? insets.bottom;
}
