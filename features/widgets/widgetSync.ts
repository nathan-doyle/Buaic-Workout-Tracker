/**
 * Keeps the home-screen widget current (Phase 7). The widget never reads the
 * database: the app builds its content and pushes it
 * - when the app starts and whenever it comes back to the foreground (a new week
 *   or day is picked up there),
 * - when a workout starts, is renamed, finished or discarded (`WidgetSync` below),
 * - when the unit or week start changes, after a JSON import or a restore,
 * - after a history edit or delete and any routine change (`requestWidgetUpdate()`
 *   at those call sites),
 * - and once more when the app goes to the background, as a catch-all.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getDb } from '../../db/database';
import { buildWidgetTimelineFromDb } from '../../db/widget';
import { todayLocalDate } from '../../lib/dates';
import { useDataRevision } from '../backup/dataRevision';
import { settingsStore, useSettings } from '../settings/settingsStore';
import { useActiveWorkoutState } from '../workout/activeWorkout';
import { publishWidget } from './BuaicWidget';

const DEBOUNCE_MS = 250;
let pending: ReturnType<typeof setTimeout> | null = null;

/** Local midnight of a `YYYY-MM-DD` day (when an iOS timeline entry takes over). */
function localMidnight(localDate: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Builds the content from the database and hands it to the widget now. */
export function updateWidgetNow(): void {
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  try {
    const { unit, weekStart } = settingsStore.getSnapshot();
    const entries = buildWidgetTimelineFromDb(getDb(), { today: todayLocalDate(), weekStart, unit });
    publishWidget(entries.map((e, i) => ({ date: i === 0 ? new Date() : localMidnight(e.localDate), content: e.content })));
  } catch (error) {
    console.log('Widget update failed:', error);
  }
}

/** Data changed: update the widget shortly (several changes in a row cost one update). */
export function requestWidgetUpdate(): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(updateWidgetNow, DEBOUNCE_MS);
}

/** Mounted once inside the database gate (root layout). Renders nothing. */
export function WidgetSync(): null {
  const { unit, weekStart } = useSettings();
  const { session } = useActiveWorkoutState();
  const revision = useDataRevision();
  const sessionKey = session ? `${session.id}:${session.name}` : '';

  // First mount (app start), then whenever one of these changes.
  useEffect(() => {
    requestWidgetUpdate();
  }, [unit, weekStart, sessionKey, revision]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') requestWidgetUpdate();
      // No debounce: timers may not run once the app is in the background.
      else if (next === 'background') updateWidgetNow();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
