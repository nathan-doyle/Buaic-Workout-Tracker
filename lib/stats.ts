/**
 * Progress statistics: pure functions over rows the database layer hands in.
 * Every date is a local `YYYY-MM-DD` string; weights are kg at full precision.
 */
import { addDays, addMonths, monthOf, startOfWeek, type WeekStart } from './dates';
import { epleyE1rm } from './e1rm';
import { REP_MAX_TARGETS, type RepMaxTarget } from './prs';

// ==========================================
// WEEKS, STREAK, MONTHS
// ==========================================

export interface SessionTotal {
  localDate: string;
  setCount: number;
  volumeKg: number;
}

export interface PeriodTotals {
  workouts: number;
  sets: number;
  volumeKg: number;
}

/** Totals of the sessions from `from` to `to` (inclusive). */
export function totalsBetween(sessions: readonly SessionTotal[], from: string, to: string): PeriodTotals {
  const totals: PeriodTotals = { workouts: 0, sets: 0, volumeKg: 0 };
  for (const s of sessions) {
    if (s.localDate < from || s.localDate > to) continue;
    totals.workouts += 1;
    totals.sets += s.setCount;
    totals.volumeKg += s.volumeKg;
  }
  return totals;
}

export interface WeekComparison {
  thisWeekStart: string;
  lastWeekStart: string;
  /** This week so far (start of week to today). */
  thisWeek: PeriodTotals;
  /** All of last week. */
  lastWeek: PeriodTotals;
}

export function weekComparison(sessions: readonly SessionTotal[], today: string, weekStart: WeekStart): WeekComparison {
  const thisWeekStart = startOfWeek(today, weekStart);
  const lastWeekStart = addDays(thisWeekStart, -7);
  return {
    thisWeekStart,
    lastWeekStart,
    thisWeek: totalsBetween(sessions, thisWeekStart, today),
    lastWeek: totalsBetween(sessions, lastWeekStart, addDays(thisWeekStart, -1)),
  };
}

/**
 * Weekly streak: consecutive weeks with at least one workout, up to this week.
 * A week without a workout yet doesn't break the streak until it is over, so on
 * Monday a streak that ran to last week still counts.
 */
export function weeklyStreak(workoutDates: readonly string[], today: string, weekStart: WeekStart): number {
  const weeks = new Set(workoutDates.filter((d) => d <= today).map((d) => startOfWeek(d, weekStart)));
  let week = startOfWeek(today, weekStart);
  if (!weeks.has(week)) week = addDays(week, -7);
  let streak = 0;
  while (weeks.has(week)) {
    streak += 1;
    week = addDays(week, -7);
  }
  return streak;
}

/** Totals of one calendar month (`YYYY-MM`). */
export function monthTotals(sessions: readonly SessionTotal[], month: string): PeriodTotals {
  const totals: PeriodTotals = { workouts: 0, sets: 0, volumeKg: 0 };
  for (const s of sessions) {
    if (monthOf(s.localDate) !== month) continue;
    totals.workouts += 1;
    totals.sets += s.setCount;
    totals.volumeKg += s.volumeKg;
  }
  return totals;
}

/** Signed change from `before` to `now` as a whole percentage, or null when there was nothing before. */
export function percentChange(now: number, before: number): number | null {
  if (!(before > 0)) return null;
  return Math.round(((now - before) / before) * 100);
}

// ==========================================
// EXERCISE CHARTS
// ==========================================

export interface ExerciseSetRow {
  sessionId: number;
  localDate: string;
  weight: number;
  reps: number;
  setType: string;
}

export interface SessionPoint {
  sessionId: number;
  localDate: string;
  /** Best Epley e1RM of the session (1–12 reps, weight > 0), or null. */
  e1rm: number | null;
  /** Heaviest weight of the session, or null when every set was bodyweight. */
  topWeight: number | null;
  /** kg × reps of the session's working sets (warm-ups excluded). */
  volumeKg: number;
}

/** One point per session, in the order the rows come (oldest first). Warm-ups are ignored. */
export function exerciseSessionPoints(rows: readonly ExerciseSetRow[]): SessionPoint[] {
  const points: SessionPoint[] = [];
  let current: SessionPoint | null = null;
  for (const row of rows) {
    if (row.setType === 'warmup') continue;
    if (!current || current.sessionId !== row.sessionId) {
      current = { sessionId: row.sessionId, localDate: row.localDate, e1rm: null, topWeight: null, volumeKg: 0 };
      points.push(current);
    }
    const e1rm = epleyE1rm(row.weight, row.reps);
    if (e1rm !== null && (current.e1rm === null || e1rm > current.e1rm)) current.e1rm = e1rm;
    if (row.weight > 0 && (current.topWeight === null || row.weight > current.topWeight)) current.topWeight = row.weight;
    current.volumeKg += row.weight * row.reps;
  }
  return points;
}

export const CHART_RANGES = ['1M', '3M', '1Y', 'ALL'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

/** First day a range includes, or null for all time. */
export function rangeStart(range: ChartRange, today: string): string | null {
  switch (range) {
    case '1M':
      return addMonths(today, -1);
    case '3M':
      return addMonths(today, -3);
    case '1Y':
      return addMonths(today, -12);
    default:
      return null;
  }
}

export function pointsInRange<T extends { localDate: string }>(points: readonly T[], range: ChartRange, today: string): T[] {
  const from = rangeStart(range, today);
  return from === null ? [...points] : points.filter((p) => p.localDate >= from && p.localDate <= today);
}

export interface RepMaxRow {
  /** The rep target (1, 3, 5, 8, 10). */
  target: RepMaxTarget;
  /** Heaviest weight lifted for at least `target` reps, or null if never. */
  weight: number | null;
  /** Reps of that set (≥ target). */
  reps: number | null;
  /** When it was first lifted. */
  localDate: string | null;
}

/** The rep-max table: for each target, the heaviest set with at least that many reps (warm-ups and bodyweight excluded). */
export function repMaxTable(rows: readonly ExerciseSetRow[]): RepMaxRow[] {
  return REP_MAX_TARGETS.map((target) => {
    let best: ExerciseSetRow | null = null;
    for (const row of rows) {
      if (row.setType === 'warmup' || row.weight <= 0 || row.reps < target) continue;
      if (best === null || row.weight > best.weight + 1e-6) best = row;
    }
    return { target, weight: best?.weight ?? null, reps: best?.reps ?? null, localDate: best?.localDate ?? null };
  });
}

// ==========================================
// COVERAGE
// ==========================================

export interface CoverageSetRow {
  primaryMuscle: string;
  secondaryMuscles: readonly string[];
}

/** A secondary muscle counts as half a set. */
export const SECONDARY_SET_WEIGHT = 0.5;

/** Weekly working sets per muscle: primary = 1, each secondary = 0.5. */
export function muscleSetCounts(rows: readonly CoverageSetRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.primaryMuscle] = (counts[row.primaryMuscle] ?? 0) + 1;
    for (const m of row.secondaryMuscles) {
      if (m === row.primaryMuscle) continue;
      counts[m] = (counts[m] ?? 0) + SECONDARY_SET_WEIGHT;
    }
  }
  return counts;
}

/** Intensity bands for weekly sets: 0 · 1–4 · 5–9 · 10–20 · 20+. */
export const COVERAGE_BANDS = ['0', '1–4', '5–9', '10–20', '20+'] as const;
export type CoverageLevel = 0 | 1 | 2 | 3 | 4;

export function coverageLevel(sets: number): CoverageLevel {
  if (!(sets > 0)) return 0;
  if (sets < 5) return 1;
  if (sets < 10) return 2;
  if (sets <= 20) return 3;
  return 4;
}

export type CoverageMode = 'rolling' | 'week';

/** The days coverage counts: the last 7 days including today, or this calendar week so far. */
export function coverageWindow(mode: CoverageMode, today: string, weekStart: WeekStart): { from: string; to: string } {
  return { from: mode === 'rolling' ? addDays(today, -6) : startOfWeek(today, weekStart), to: today };
}

/** Parses `exercises.secondary_muscles` (a JSON array); anything else is no muscles. */
export function parseMuscleList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((m): m is string => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

// ==========================================
// BIG 3, NEXT ROUTINE
// ==========================================

/** The three competition lifts by name → the variations that are that lift ('' = none given, as V1 stored it). */
const BIG3_VARIATIONS: Record<string, readonly string[]> = {
  'bench press': ['', 'barbell'],
  squat: ['', 'barbell', 'back', 'high bar', 'low bar'],
  deadlift: ['', 'barbell', 'conventional', 'sumo'],
};
/** Whole names people give the same lifts (custom exercises), with no variation or "Barbell". */
const BIG3_NAMES = new Set([
  'barbell bench press', 'flat bench press', 'back squat', 'barbell squat', 'barbell back squat',
  'conventional deadlift', 'sumo deadlift', 'barbell deadlift',
]);

/**
 * Big 3 = barbell bench press, barbell back squat, deadlift (conventional or sumo), matched by
 * exercise name and variation. Phase 8: V1's rule (the name *contains* "bench press", "squat"
 * or "deadlift") also caught Romanian Deadlift, Front/Hack/Goblet/Split Squat, Incline and
 * Close-Grip Bench Press and the Smith Machine and Dumbbell versions.
 */
export function isBig3(name: string, variation: string): boolean {
  const n = name.trim().toLowerCase();
  const v = (variation ?? '').trim().toLowerCase();
  const variations = BIG3_VARIATIONS[n];
  if (variations) return variations.includes(v);
  return BIG3_NAMES.has(n) && (v === '' || v === 'barbell');
}

/**
 * "Start next workout": the routine after the one last trained (in routine
 * order, wrapping round), or the first routine if none of them was trained.
 */
export function nextRoutineId(orderedRoutineIds: readonly number[], lastRoutineId: number | null): number | null {
  if (orderedRoutineIds.length === 0) return null;
  const index = lastRoutineId === null ? -1 : orderedRoutineIds.indexOf(lastRoutineId);
  return orderedRoutineIds[(index + 1) % orderedRoutineIds.length];
}

/** A workout's length: "48 min", "1 h 05 min"; under a minute counts as 1 min. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
