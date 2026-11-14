/**
 * The app's one rest timer (an external store over `lib/restTimer`). It keeps
 * V1's epoch-based design, schedules the "rest over" notification for when the app
 * is in the background, and plays the bundled chime / vibrates in the foreground
 * (each can be turned off in Settings).
 *
 * Notification permission is asked in context: the first time a rest starts, with a
 * short explanation first. Never at launch.
 */
import { useSyncExternalStore } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';

import * as RT from '../../lib/restTimer';
import { settingsStore } from '../settings/settingsStore';

// Bundled chime so the rest-over sound works offline and on iOS.
const REST_OVER_SOUND = require('../../assets/sounds/rest-over.wav');

export interface RestSnapshot {
  timer: RT.RestTimerState;
  /** Clock of the last update, so screens re-render every half second while running. */
  now: number;
}

let snapshot: RestSnapshot = { timer: RT.IDLE, now: Date.now() };
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let notificationId: string | null = null;
let player: AudioPlayer | null = null;

function emit(timer: RT.RestTimerState) {
  const previous = snapshot.timer;
  snapshot = { timer, now: Date.now() };
  if (previous.status === 'running' && timer.status === 'done') restOver();
  if (timer.status === 'running' && interval === null) {
    interval = setInterval(() => emit(RT.tick(snapshot.timer, Date.now())), 500);
  } else if (timer.status !== 'running' && interval !== null) {
    clearInterval(interval);
    interval = null;
  }
  listeners.forEach((l) => l());
}

function restOver() {
  void cancelNotification();
  const { restSound, restVibrate } = settingsStore.getSnapshot();
  if (restVibrate) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  if (!restSound) return;
  try {
    if (!player) player = createAudioPlayer(REST_OVER_SOUND);
    else void player.seekTo(0);
    player.play();
  } catch (error) {
    console.log('Audio playback error:', error);
  }
}

async function cancelNotification() {
  const id = notificationId;
  notificationId = null;
  if (id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already delivered or gone.
    }
  }
}

async function scheduleNotification() {
  await cancelNotification();
  const timer = snapshot.timer;
  if (timer.status !== 'running') return;
  const seconds = Math.ceil((timer.endsAt - Date.now()) / 1000);
  if (seconds < 1) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    // The state may have changed while we waited.
    if (snapshot.timer !== timer) return;
    notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest over',
        body: timer.label ? `Time for your next set of ${timer.label}.` : 'Time for your next set.',
        sound: settingsStore.getSnapshot().restSound ? 'default' : undefined,
        ...(Platform.OS === 'android'
          ? { priority: Notifications.AndroidNotificationPriority.MAX, vibrate: [0, 500, 250, 500] }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
      },
    });
    // Cancelled or changed while scheduling: don't leave a stale alert behind.
    if (snapshot.timer !== timer) await cancelNotification();
  } catch (error) {
    console.log('Notification scheduling error:', error);
  }
}

/** The first time a rest starts: explain, then ask for notification permission. */
async function askPermissionInContext() {
  const settings = settingsStore.getSnapshot();
  if (settings.notificationsPrompted) return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'undetermined' || !current.canAskAgain) {
      settingsStore.set('notificationsPrompted', true);
      return;
    }
  } catch {
    return;
  }
  settingsStore.set('notificationsPrompted', true);
  Alert.alert(
    'Rest alerts',
    'Buaic can tell you when your rest is over, even with the phone locked or another app open. Notifications are only used for this.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Allow',
        onPress: async () => {
          try {
            await Notifications.requestPermissionsAsync({
              ios: { allowAlert: true, allowSound: true, allowBadge: false },
            });
          } catch (error) {
            console.log('Notification permission request error:', error);
          }
          void scheduleNotification();
        },
      },
    ]
  );
}

AppState.addEventListener('change', (next) => {
  if (next === 'active') emit(RT.tick(snapshot.timer, Date.now()));
});

export const restTimer = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  start(seconds: number, label = '') {
    emit(RT.startRest(seconds, Date.now(), label));
    void askPermissionInContext();
    void scheduleNotification();
  },
  adjust(deltaSeconds: number) {
    emit(RT.adjustRest(snapshot.timer, deltaSeconds, Date.now()));
    void scheduleNotification();
  },
  togglePause() {
    const t = snapshot.timer;
    emit(t.status === 'paused' ? RT.resumeRest(t, Date.now()) : RT.pauseRest(t, Date.now()));
    void scheduleNotification();
  },
  /** Ends the rest without the alert. */
  skip() {
    emit(RT.IDLE);
    void cancelNotification();
  },
  /** Workout finished or discarded: stop and remove every pending rest alert. */
  stopAll() {
    emit(RT.IDLE);
    notificationId = null;
    Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  },
};

export function useRestTimer(): RestSnapshot {
  return useSyncExternalStore(restTimer.subscribe, restTimer.getSnapshot);
}
