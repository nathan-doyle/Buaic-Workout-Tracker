/**
 * Root layout: providers and the root stack. The tab shell lives in `(tabs)`; the
 * active workout, routines, exercise picker and settings are stack screens above it.
 */
import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RestLiveActivity } from '../features/rest/RestLiveActivity';
import { DatabaseGate } from '../features/startup/DatabaseGate';
import { iconFont } from '../features/ui/Icon';
import { WidgetSync } from '../features/widgets/widgetSync';
import { WorkoutKeepAwake } from '../features/workout/WorkoutKeepAwake';
import { WorkoutProvider } from '../features/workout/WorkoutProvider';
import { colors } from '../theme';

// A deep link opened on a cold start (the widget, the Live Activity) lands on top of
// the tabs, so Back from it returns to the app instead of leaving it.
export const unstable_settings = { anchor: '(tabs)' };

// Keep the splash up until the icon font (bundled in the app, loaded from disk) is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

// The only notification is the rest-over alarm. In the foreground the on-screen timer already
// plays the chime and buzzes, so the system notification is suppressed to avoid a double alert.
// (SDK 58 shows foreground notifications by default; this handler overrides that.)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Dark navigation theme in brand colours, so no navigator ever paints a light background.
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.textPrimary,
    border: colors.border,
  },
};

const withHeader = (title: string) => ({
  headerShown: true,
  title,
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.accent,
  headerTitleStyle: { color: colors.textPrimary },
  headerShadowVisible: false,
  // iOS: chevron only. Its default label is the previous screen's title, which for the
  // tab shell was the route group's name, "(tabs)". (Android already shows only an arrow.)
  headerBackButtonDisplayMode: 'minimal' as const,
});

export default function RootLayout() {
  const [fontLoaded, fontError] = useFonts(iconFont);
  // Reduce Motion: screens appear without sliding.
  const reduceMotion = useReducedMotion();
  const ready = fontLoaded || fontError !== null;

  useEffect(() => {
    if (fontError) console.log('Icon font failed to load:', fontError);
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontError]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme}>
          {/* Opens and migrates the database first; shows "Your data is safe" if that fails. */}
          <DatabaseGate>
            <WorkoutProvider>
              <WorkoutKeepAwake />
              {/* Phase 7: home-screen widget data and the iOS rest Live Activity. */}
              <WidgetSync />
              <RestLiveActivity />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                  animation: reduceMotion ? 'none' : 'default',
                }}
              >
                {/* Named so iOS never shows the route group "(tabs)" (e.g. in the long-press back menu). */}
                <Stack.Screen name="(tabs)" options={{ title: 'Buaic' }} />
                <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: reduceMotion ? 'none' : 'fade' }} />
                <Stack.Screen
                  name="workout"
                  options={{ animation: reduceMotion ? 'none' : 'slide_from_bottom', gestureEnabled: false }}
                />
                <Stack.Screen name="exercise-picker" options={withHeader('Exercises')} />
                <Stack.Screen name="routines" options={withHeader('Routines')} />
                <Stack.Screen name="routine/[id]" options={withHeader('Routine')} />
                <Stack.Screen name="library" options={withHeader('Exercise library')} />
                <Stack.Screen name="settings" options={withHeader('Settings')} />
                <Stack.Screen name="exercise/[id]" options={withHeader('Exercise')} />
                <Stack.Screen name="session/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="calendar" options={withHeader('Calendar')} />
                <Stack.Screen name="widget" options={{ animation: 'none', gestureEnabled: false }} />
              </Stack>
            </WorkoutProvider>
          </DatabaseGate>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
