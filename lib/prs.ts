/**
 * Personal records against an exercise's all-time bests.
 *
 * Kinds: heaviest weight, best estimated 1RM (Epley, 1–12 reps only) and rep maxes
 * for 1, 3, 5, 8 and 10 reps. A rep max for N is the heaviest weight lifted for at
 * least N reps (100 × 6 also counts as a 5-rep max of 100).
 *
 * A set only counts as a PR when it beats an earlier value of the same kind: the
 * first time an exercise (or a rep count) is logged sets the baseline and is not a
 * PR. That is what stops V1's false "NEW PR" badges. Weight 0 (bodyweight) is never
 * a PR. See V2_PROGRESS.md → Decisions (Phase 3).
 */
import { epleyE1rm, type WeightReps } from './e1rm';

export const REP_MAX_TARGETS = [1, 3, 5, 8, 10] as const;
export type RepMaxTarget = (typeof REP_MAX_TARGETS)[number];

export interface ExerciseBests {
  maxWeight: number | null;
  bestE1rm: number | null;
  /** Heaviest weight for at least N reps. */
  repMax: Record<RepMaxTarget, number | null>;
}

export type PrKind = { kind: 'weight' } | { kind: 'e1rm' } | { kind: 'reps'; reps: RepMaxTarget };

/** Tolerance for comparing stored doubles (kg converted from lb). */
const EPSILON = 1e-6;

export function emptyBests(): ExerciseBests {
  return { maxWeight: null, bestE1rm: null, repMax: { 1: null, 3: null, 5: null, 8: null, 10: null } };
}

const higher = (value: number, best: number | null) => best === null || value > best + EPSILON;

/** The bests after also counting `set`. */
export function addToBests(bests: ExerciseBests, set: WeightReps): ExerciseBests {
  if (!Number.isFinite(set.weight) || set.weight <= 0 || set.reps < 1) return bests;
  const next: ExerciseBests = { ...bests, repMax: { ...bests.repMax } };
  if (higher(set.weight, next.maxWeight)) next.maxWeight = set.weight;
  const e1rm = epleyE1rm(set.weight, set.reps);
  if (e1rm !== null && higher(e1rm, next.bestE1rm)) next.bestE1rm = e1rm;
  for (const n of REP_MAX_TARGETS) {
    if (set.reps >= n && higher(set.weight, next.repMax[n])) next.repMax[n] = set.weight;
  }
  return next;
}

export function bestsFromSets(sets: readonly WeightReps[]): ExerciseBests {
  return sets.reduce(addToBests, emptyBests());
}

/** The records `set` breaks (empty if none). Only beats of an existing value count. */
export function detectPrs(bests: ExerciseBests, set: WeightReps): PrKind[] {
  if (!Number.isFinite(set.weight) || set.weight <= 0 || set.reps < 1) return [];
  const prs: PrKind[] = [];
  if (bests.maxWeight !== null && set.weight > bests.maxWeight + EPSILON) prs.push({ kind: 'weight' });
  const e1rm = epleyE1rm(set.weight, set.reps);
  if (e1rm !== null && bests.bestE1rm !== null && e1rm > bests.bestE1rm + EPSILON) prs.push({ kind: 'e1rm' });
  for (const n of REP_MAX_TARGETS) {
    const best = bests.repMax[n];
    if (set.reps >= n && best !== null && set.weight > best + EPSILON) prs.push({ kind: 'reps', reps: n });
  }
  return prs;
}

/**
 * One short label for a set's records, most significant first: "Heaviest", then
 * "Best e1RM", then the largest rep max ("5-rep max").
 */
export function prLabel(prs: readonly PrKind[]): string | null {
  if (prs.length === 0) return null;
  if (prs.some((p) => p.kind === 'weight')) return 'Heaviest';
  if (prs.some((p) => p.kind === 'e1rm')) return 'Best e1RM';
  const reps = Math.max(...prs.map((p) => (p.kind === 'reps' ? p.reps : 0)));
  return `${reps}-rep max`;
}
