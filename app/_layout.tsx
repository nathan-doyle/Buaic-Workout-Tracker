/**
 * Root layout: providers and the root stack. The tab shell lives in `(tabs)`.
 */
import React from 'react';
import * as Notifications from 'expo-notifications';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkoutProvider } from '../features/workout/WorkoutProvider';
import { colors } from '../theme';

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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <WorkoutProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </WorkoutProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
