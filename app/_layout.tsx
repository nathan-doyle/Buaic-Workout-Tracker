/**
 * Root layout: providers and the root stack. The tab shell lives in `(tabs)`; the
 * active workout, routines, exercise picker and settings are stack screens above it.
 */
import React from 'react';
import * as Notifications from 'expo-notifications';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseGate } from '../features/startup/DatabaseGate';
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

const withHeader = (title: string) => ({
  headerShown: true,
  title,
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.accent,
  headerTitleStyle: { color: colors.textPrimary },
  headerShadowVisible: false,
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme}>
          {/* Opens and migrates the database first; shows "Your data is safe" if that fails. */}
          <DatabaseGate>
            <WorkoutProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="workout" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
                <Stack.Screen name="exercise-picker" options={withHeader('Exercises')} />
                <Stack.Screen name="routines" options={withHeader('Routines')} />
                <Stack.Screen name="routine/[id]" options={withHeader('Routine')} />
                <Stack.Screen name="library" options={withHeader('Exercise library')} />
                <Stack.Screen name="settings" options={withHeader('Settings')} />
              </Stack>
            </WorkoutProvider>
          </DatabaseGate>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
