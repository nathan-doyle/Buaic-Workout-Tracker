/**
 * Estimated one-rep max (Epley).
 *
 * Epley is only a reasonable estimate at low reps, so sets above 12 reps get no
 * estimate at all instead of an inflated one. A single is its own 1RM.
 */

export const EPLEY_MAX_REPS = 12;

/**
 * Epley e1RM: `weight × (1 + reps / 30)`; `weight` itself for 1 rep.
 * Returns null when there is no meaningful estimate: weight ≤ 0 (e.g. bodyweight
 * logged as 0), reps outside 1–12, non-integer reps or non-finite weight.
 */
export function epleyE1rm(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > EPLEY_MAX_REPS) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export interface WeightReps {
  weight: number;
  reps: number;
}

/**
 * The set with the highest e1RM, or null if no set has an estimate.
 * On a tie the earlier set wins.
 */
export function bestE1rmSet<T extends WeightReps>(
  sets: readonly T[]
): { set: T; e1rm: number } | null {
  let best: { set: T; e1rm: number } | null = null;
  for (const set of sets) {
    const e1rm = epleyE1rm(set.weight, set.reps);
    if (e1rm !== null && (best === null || e1rm > best.e1rm)) {
      best = { set, e1rm };
    }
  }
  return best;
}
