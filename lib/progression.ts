/**
 * Progression hint (double progression), explainable and never applied silently.
 *
 * - Last time = the working sets of the exercise's last workout (warm-ups ignored).
 * - With a rep range: if every working set reached the top of the range, add one
 *   increment and aim for the bottom of the range; otherwise keep the weight and aim
 *   for one more rep than the weakest set (capped at the top of the range).
 * - Without a range: keep the weight and aim for one more rep.
 * - Bodyweight (weight 0): never adds weight, only reps.
 */

export interface PastWorkingSet {
  weight: number;
  reps: number;
  setType: string;
}

export interface ProgressionHint {
  /** kg, full precision (0 = bodyweight). */
  weightKg: number;
  reps: number;
  /** Shown on the chip after the weight, e.g. "6–8" or "9". */
  repsLabel: string;
  increase: boolean;
  /** One-sentence explanation. */
  reason: string;
}

export function progressionHint(
  previous: readonly PastWorkingSet[],
  range: { repMin: number | null; repMax: number | null },
  incrementKg: number
): ProgressionHint | null {
  const working = previous.filter((s) => s.setType !== 'warmup' && s.reps > 0);
  if (working.length === 0) return null;
  const top = Math.max(...working.map((s) => s.weight));
  const atTop = working.filter((s) => s.weight === top);
  const weakest = Math.min(...atTop.map((s) => s.reps));
  const { repMin, repMax } = range;
  const hasRange = repMax !== null && repMax > 0;

  if (hasRange && top > 0 && working.every((s) => s.reps >= repMax!) && incrementKg > 0) {
    const low = repMin !== null && repMin > 0 && repMin <= repMax! ? repMin : repMax!;
    return {
      weightKg: top + incrementKg,
      reps: low,
      repsLabel: low === repMax ? String(low) : `${low}–${repMax}`,
      increase: true,
      reason: `Every set reached ${repMax} reps last time, so add weight and work back up the range.`,
    };
  }
  // Bodyweight can only progress in reps, past the top of the range too.
  const reps = hasRange && top > 0 ? Math.max(weakest, Math.min(weakest + 1, repMax!)) : weakest + 1;
  return {
    weightKg: top,
    reps,
    repsLabel: String(reps),
    increase: false,
    reason: hasRange
      ? `Not every set reached ${repMax} reps last time: same weight, aim for one more rep.`
      : 'Same weight as last time, aim for one more rep.',
  };
}
