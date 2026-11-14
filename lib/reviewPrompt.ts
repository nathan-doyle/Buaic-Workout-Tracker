/**
 * When to ask for an App Store / Play review (Phase 5 brief): after the 5th
 * completed workout, at most once per app version, and only right after a
 * successful finish.
 */
export const REVIEW_AFTER_WORKOUTS = 5;

export interface ReviewPromptInput {
  /** Completed workouts in the database, including the one just finished. */
  completedWorkouts: number;
  /** Installed app version; null if unknown (then never ask: it couldn't be tracked). */
  appVersion: string | null;
  /** Version the prompt was last requested for (settings). */
  promptedVersion: string | null;
  /** True only for the finish that just succeeded. */
  justFinished: boolean;
}

export function shouldRequestReview(input: ReviewPromptInput): boolean {
  if (!input.justFinished) return false;
  if (!input.appVersion) return false;
  if (input.completedWorkouts < REVIEW_AFTER_WORKOUTS) return false;
  return input.promptedVersion !== input.appVersion;
}
