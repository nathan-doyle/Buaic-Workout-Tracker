/**
 * The store review prompt (Phase 5). A successful finish arms it; when the user
 * closes the workout summary, it asks once if the rules allow (lib/reviewPrompt):
 * 5+ completed workouts, not yet asked for this app version.
 *
 * The dialog itself comes from the App Store / Google Play (and needs a connection);
 * Buaic sends nothing. If the store can't show it, nothing happens.
 */
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';

import { getDb } from '../../db/database';
import { countCompletedWorkouts } from '../../db/workouts';
import { shouldRequestReview } from '../../lib/reviewPrompt';
import { settingsStore } from '../settings/settingsStore';

let armed = false;

export const appVersion = (): string | null => Constants.expoConfig?.version ?? null;

/** Call right after a workout was finished and saved. */
export function armReviewPrompt(): void {
  armed = true;
}

/** Call when the post-workout summary closes. Never throws. */
export async function maybeRequestReview(): Promise<void> {
  if (!armed) return;
  armed = false;
  try {
    const version = appVersion();
    const ask = shouldRequestReview({
      completedWorkouts: countCompletedWorkouts(getDb()),
      appVersion: version,
      promptedVersion: settingsStore.getSnapshot().reviewPromptedVersion,
      justFinished: true,
    });
    if (!ask || !version || !(await StoreReview.isAvailableAsync())) return;
    settingsStore.set('reviewPromptedVersion', version);
    await StoreReview.requestReview();
  } catch (error) {
    console.log('Review prompt skipped:', error);
  }
}

/**
 * Settings → "Rate Buaic". Opens the store page's review form when app.json has a
 * store URL (`ios.appStoreUrl` / `android.playStoreUrl`); on iOS without one, falls
 * back to the system review prompt. Android builds are sideloaded (no Play listing),
 * so the row is hidden there unless a Play URL is configured.
 */
export function canRateApp(): boolean {
  return Platform.OS === 'ios' || StoreReview.storeUrl() !== null;
}

export async function rateApp(): Promise<void> {
  const url = StoreReview.storeUrl();
  if (url) {
    await Linking.openURL(Platform.OS === 'ios' ? `${url}${url.includes('?') ? '&' : '?'}action=write-review` : url);
    return;
  }
  if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
}
