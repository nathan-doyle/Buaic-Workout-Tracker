/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: components/RestTimer.js
 * Purpose: Native background-proof rest timer. Uses epoch-based global timestamps
 *          to prevent JS clock freeze, handles AppState background/foreground synchronization,
 *          and schedules exact native alarms on Android and local push notifications on iOS.
 */

import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';

export default function RestTimer({ initialSeconds = 90, onClose }) {
  // ==========================================
  // STATE & REFS (EPOCH TIMESTAMP TRACKING)
  // ==========================================
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isPaused, setIsPaused] = useState(false);

  // Target system epoch time (in ms) when rest concludes
  const targetEndTimeRef = useRef(Date.now() + initialSeconds * 1000);
  const remainingOnPauseRef = useRef(initialSeconds);
  const isFinishedRef = useRef(false);
  const notificationIdRef = useRef(null);

  // ==========================================
  // TIMER TICK LOOP & APP STATE LISTENER
  // ==========================================
  useEffect(() => {
    scheduleStandbyNotification(initialSeconds);

    // Synchronize timer against system clock the instant the app returns to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && !isPaused && !isFinishedRef.current) {
        syncTimer();
      }
    });

    // Check clock every 500ms to update active UI countdown
    const interval = setInterval(() => {
      if (!isPaused && !isFinishedRef.current) {
        syncTimer();
      }
    }, 500);

    return () => {
      clearInterval(interval);
      cancelStandbyNotification();
      subscription.remove();
    };
  }, [isPaused]);

  /**
   * Compares the target timestamp against Date.now() to keep time accurate across app states.
   */
  const syncTimer = () => {
    const now = Date.now();
    const remaining = Math.ceil((targetEndTimeRef.current - now) / 1000);

    if (remaining <= 0) {
      setSecondsLeft(0);
      if (!isFinishedRef.current) {
        isFinishedRef.current = true;
        cancelStandbyNotification();
        triggerRestOverEffects();
      }
    } else {
      setSecondsLeft(remaining);
    }
  };

  // ==========================================
  // NATIVE STANDBY NOTIFICATION SCHEDULING
  // ==========================================
  /**
   * Schedules an exact system alarm on Android and a standard local notification on iOS.
   */
  const scheduleStandbyNotification = async (secs) => {
    await cancelStandbyNotification();
    if (secs <= 0) return;

    try {
      // Build cross-platform trigger configuration
      const triggerConfig = {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.floor(secs)),
        repeats: false,
        // Android specific: bind to high-priority channel and enforce hardware alarm
        ...(Platform.OS === 'android' ? { channelId: 'rest-timer', exact: true } : {}),
      };

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'BUAIC Rest Over! 🔔',
          body: 'Time for your next set.',
          sound: 'default',
          ...(Platform.OS === 'android'
            ? {
                priority: Notifications.AndroidNotificationPriority.MAX,
                categoryIdentifier: 'alarm',
                vibrate: [0, 500, 250, 500],
              }
            : {}),
        },
        trigger: triggerConfig,
      });
      notificationIdRef.current = id;
    } catch (err) {
      console.log('Notification scheduling error:', err);
    }
  };

  /**
   * Cleans up scheduled notification objects from the native system queue.
   */
  const cancelStandbyNotification = async () => {
    if (notificationIdRef.current) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      } catch (e) {}
      notificationIdRef.current = null;
    }
  };

  /**
   * Triggers audio chime and haptic feedback when the countdown hits zero.
   */
  const triggerRestOverEffects = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
        { shouldPlay: true }
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      console.log('Audio playback error:', e);
    }
  };

  // ==========================================
  // USER CONTROLS (PAUSE, RESUME, ADJUST)
  // ==========================================
  const togglePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!isPaused) {
      // Pausing: Store remaining time and cancel pending background notification
      const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
      remainingOnPauseRef.current = remaining;
      setSecondsLeft(remaining);
      setIsPaused(true);
      cancelStandbyNotification();
    } else {
      // Resuming: Calculate future target timestamp and reschedule notification
      if (remainingOnPauseRef.current <= 0) return;
      isFinishedRef.current = false;
      targetEndTimeRef.current = Date.now() + remainingOnPauseRef.current * 1000;
      setIsPaused(false);
      scheduleStandbyNotification(remainingOnPauseRef.current);
    }
  };

  const adjustTime = (amount) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isPaused) {
      const newRem = Math.max(0, remainingOnPauseRef.current + amount);
      remainingOnPauseRef.current = newRem;
      setSecondsLeft(newRem);
      if (newRem === 0 && !isFinishedRef.current) {
        isFinishedRef.current = true;
        triggerRestOverEffects();
      }
    } else {
      const currentRemaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
      const newRemaining = currentRemaining + amount;

      // Handle reducing timer past zero without scheduling invalid negative alarms
      if (newRemaining <= 0) {
        targetEndTimeRef.current = Date.now();
        setSecondsLeft(0);
        cancelStandbyNotification();
        if (!isFinishedRef.current) {
          isFinishedRef.current = true;
          triggerRestOverEffects();
        }
      } else {
        isFinishedRef.current = false;
        targetEndTimeRef.current = Date.now() + newRemaining * 1000;
        setSecondsLeft(newRemaining);
        scheduleStandbyNotification(newRemaining);
      }
    }
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const isDone = secondsLeft === 0;

  return (
    <View style={[styles.timerContainer, isDone && styles.timerDoneContainer]}>
      {/* Timer Label & Current Time Display */}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.timerLabel}>REST TIMER</Text>
          <Text style={[styles.timeDisplay, isDone && styles.timeDisplayDone]}>
            {isDone ? 'REST OVER!' : formatTime(secondsLeft)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            cancelStandbyNotification();
            onClose();
          }}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Adjust & Play/Pause Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustTime(-30)}>
          <Text style={styles.adjustText}>-30s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playPauseBtn, isDone && styles.playPauseDone]}
          onPress={togglePause}
          disabled={isDone}
        >
          <Text style={styles.playPauseText}>{isPaused ? 'START' : 'PAUSE'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustTime(30)}>
          <Text style={styles.adjustText}>+30s</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timerContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    elevation: 8,
  },
  timerDoneContainer: {
    backgroundColor: '#D4AF37',
    borderColor: '#FFF',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timerLabel: {
    color: '#888',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  timeDisplay: {
    color: '#D4AF37',
    fontSize: 26,
    fontWeight: '900',
  },
  timeDisplayDone: {
    color: '#000',
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  adjustBtn: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  adjustText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  playPauseBtn: {
    flex: 1,
    backgroundColor: '#D4AF37',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  playPauseDone: {
    backgroundColor: '#000',
  },
  playPauseText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
  },
});