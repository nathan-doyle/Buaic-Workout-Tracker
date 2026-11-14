/**
 * Queries for the V1 screens, on the V2 schema. Each takes a `DbAdapter`, so Jest
 * runs them on node:sqlite. The app calls them through `database.ts`.
 *
 * Phase 2 keeps V1's screens: a "split" is the routine with that name, exercises
 * are canonical (one row per exercise), weights are kg at full precision and dates
 * use `local_date`. Phases 3–4 replace these with routine/session queries.
 */
import { addDays, localDateString } from '../lib/dates';
import { type DbAdapter, transaction } from './adapter';
import { FALLBACK_SPLITS, MUSCLE_SPLIT_MAP, V1_SPLITS } from './v1Constants';

// ==========================================
// TYPES (row shapes the V1 screens read)
// ==========================================

/** An exercise as the Workout tab shows it inside a split. */
export interface ExerciseRow {
  id: number;
  name: string;
  variation: string;
  target_muscle: string;
  split_category: string;
}

/** A completed set handed to `saveWorkoutSession` (weight in kg, full precision). */
export interface SetLogInput {
  exerciseId: number;
  setNumber: number;
  weight: number;
  reps: number;
}

export interface PastSet {
  set_number: number;
  weight: number;
  reps: number;
}

export interface TopSetRow {
  exercise_id: number;
  name: string;
  variation: string;
  /** The split (session name) the top set was logged in. */
  split_category: string;
  target_muscle: string;
  weight: number;
  reps: number;
  /** Local date (`YYYY-MM-DD`) of the session. */
  date: string | null;
}

export type CoverageStatus = 'red' | 'grey' | 'gold';

export interface MuscleCoverage {
  status: CoverageStatus;
  hasExercise: boolean;
  setsThisWeek: number;
}

export interface HistorySet {
  exercise_name: string;
  variation: string;
  target_muscle: string;
  set_number: number;
  weight: number;
  reps: number;
}

export interface HistorySession {
  session_id: number;
  split_name: string;
  date_completed: string;
  local_date: string | null;
  notes: string | null;
  total_sets: number;
  /** NULL for a session without sets. */
  total_volume: number | null;
  sets: HistorySet[];
}

export interface CalendarDay {
  hasWorkout: boolean;
  hasPR: boolean;
}

export type RoutineSource = 'v1_split' | 'template' | 'user';

/** The time context of a write: the instant and the device's UTC offset then. */
export interface Clock {
  now: Date;
  tzOffsetMinutes: number;
}

// ==========================================
// SPLITS (= routines) AND EXERCISES
// ==========================================

/** The active routine named `split`, or null. */
export function findSplitRoutine(db: DbAdapter, split: string): number | null {
  return (
    db.get<{ id: number }>(
      'SELECT id FROM routines WHERE name = ? AND archived_at IS NULL ORDER BY position, id LIMIT 1',
      [split]
    )?.id ?? null
  );
}

/** A split's exercises in routine order (V1: by muscle, then name). */
export function getExercisesBySplit(db: DbAdapter, split: string): ExerciseRow[] {
  return db.all<ExerciseRow>(
    `SELECT e.id, e.name, e.variation, e.primary_muscle AS target_muscle, r.name AS split_category
     FROM routine_exercises re
     JOIN routines r ON r.id = re.routine_id
     JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? AND e.archived_at IS NULL
     ORDER BY re.position, re.id`,
    [findSplitRoutine(db, split) ?? -1]
  );
}

/**
 * The exercise with this identity (case-insensitive name + variation), created if
 * missing and un-archived if it was removed. Returns its id.
 */
export function ensureExercise(
  db: DbAdapter,
  exercise: { name: string; variation: string; muscle: string; isCustom: boolean },
  nowIso: string
): number {
  const existing = db.get<{ id: number; archived_at: string | null }>(
    'SELECT id, archived_at FROM exercises WHERE LOWER(name) = LOWER(?) AND LOWER(variation) = LOWER(?)',
    [exercise.name, exercise.variation]
  );
  if (existing) {
    if (existing.archived_at !== null) {
      db.run('UPDATE exercises SET archived_at = NULL, primary_muscle = ? WHERE id = ?', [
        exercise.muscle,
        existing.id,
      ]);
    }
    return existing.id;
  }
  return db.run(
    `INSERT INTO exercises (name, variation, primary_muscle, is_custom, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [exercise.name, exercise.variation, exercise.muscle, exercise.isCustom ? 1 : 0, nowIso]
  ).lastInsertRowId;
}

/** The routine for `split`, created (in V1 menu order) if missing. */
export function ensureSplitRoutine(db: DbAdapter, split: string, source: RoutineSource, nowIso: string): number {
  const existing = findSplitRoutine(db, split);
  if (existing !== null) return existing;
  const menuIndex = (V1_SPLITS as readonly string[]).indexOf(split);
  const position =
    menuIndex >= 0
      ? menuIndex
      : (db.get<{ p: number | null }>('SELECT MAX(position) AS p FROM routines')?.p ?? -1) + 1;
  return db.run('INSERT INTO routines (name, position, source, created_at) VALUES (?, ?, ?, ?)', [
    split,
    position,
    source,
    nowIso,
  ]).lastInsertRowId;
}

/**
 * Adds an exercise to a routine where V1 would have shown it (sorted by muscle,
 * then name). Does nothing if it is already there.
 */
export function addExerciseToRoutine(db: DbAdapter, routineId: number, exerciseId: number): void {
  const items = db.all<{ exercise_id: number; position: number; muscle: string; name: string }>(
    `SELECT re.exercise_id, re.position, e.primary_muscle AS muscle, e.name
     FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? ORDER BY re.position, re.id`,
    [routineId]
  );
  if (items.some((item) => item.exercise_id === exerciseId)) return;
  const added = db.get<{ muscle: string; name: string }>(
    'SELECT primary_muscle AS muscle, name FROM exercises WHERE id = ?',
    [exerciseId]
  );
  if (!added) throw new Error(`No exercise ${exerciseId}`);

  const sortsAfter = (item: { muscle: string; name: string }) =>
    item.muscle > added.muscle || (item.muscle === added.muscle && item.name > added.name);
  const next = items.find(sortsAfter);
  let position: number;
  if (next) {
    position = next.position;
    db.run('UPDATE routine_exercises SET position = position + 1 WHERE routine_id = ? AND position >= ?', [
      routineId,
      position,
    ]);
  } else {
    position = items.length > 0 ? items[items.length - 1].position + 1 : 0;
  }
  db.run('INSERT INTO routine_exercises (routine_id, exercise_id, position) VALUES (?, ?, ?)', [
    routineId,
    exerciseId,
    position,
  ]);
}

/**
 * V1's "add exercise": one library exercise, added to every split its muscle maps to.
 * Runs inside the caller's transaction.
 */
export function addExerciseToSplits(
  db: DbAdapter,
  exercise: { name: string; variation: string; muscle: string; isCustom: boolean },
  routineSource: RoutineSource,
  nowIso: string
): number {
  const exerciseId = ensureExercise(db, exercise, nowIso);
  for (const split of MUSCLE_SPLIT_MAP[exercise.muscle] ?? FALLBACK_SPLITS) {
    addExerciseToRoutine(db, ensureSplitRoutine(db, split, routineSource, nowIso), exerciseId);
  }
  return exerciseId;
}

/** V1's "Add Exercise" modal. */
export function addUniversalExercise(
  db: DbAdapter,
  name: string,
  variation: string | null | undefined,
  muscle: string,
  now: Date
): number {
  return transaction(db, () =>
    addExerciseToSplits(db, { name, variation: variation || '', muscle, isCustom: true }, 'user', now.toISOString())
  );
}

/**
 * V1's ✕ on an exercise: takes it out of every split. V2 archives it instead of
 * deleting it, so its logged sets stay in History.
 */
export function removeExercise(db: DbAdapter, exerciseId: number, now: Date): void {
  transaction(db, () => {
    db.run('UPDATE exercises SET archived_at = ? WHERE id = ? AND archived_at IS NULL', [now.toISOString(), exerciseId]);
    db.run('DELETE FROM routine_exercises WHERE exercise_id = ?', [exerciseId]);
  });
}

// ==========================================
// SESSIONS
// ==========================================

/** Saves a finished workout and its sets in one transaction. Returns the session id. */
export function saveWorkoutSession(
  db: DbAdapter,
  splitName: string,
  notes: string | null | undefined,
  sets: SetLogInput[],
  clock: Clock
): number {
  const iso = clock.now.toISOString();
  const localDate = localDateString(clock.now, clock.tzOffsetMinutes);
  return transaction(db, () => {
    const sessionId = db.run(
      `INSERT INTO workout_sessions
         (split_name, date_completed, notes, routine_id, status, started_at, ended_at, local_date, tz_offset_minutes)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      [splitName, iso, notes || '', findSplitRoutine(db, splitName), iso, iso, localDate, clock.tzOffsetMinutes]
    ).lastInsertRowId;

    const order: number[] = [];
    for (const set of sets) if (!order.includes(set.exerciseId)) order.push(set.exerciseId);
    order.forEach((exerciseId, position) => {
      db.run('INSERT INTO session_exercises (session_id, exercise_id, position) VALUES (?, ?, ?)', [
        sessionId,
        exerciseId,
        position,
      ]);
    });
    for (const set of sets) {
      db.run(
        `INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps, set_type, completed_at)
         VALUES (?, ?, ?, ?, ?, 'working', ?)`,
        [sessionId, set.exerciseId, set.setNumber, set.weight, set.reps, iso]
      );
    }
    return sessionId;
  });
}

/** Deletes a session; its sets and exercise rows cascade. */
export function deleteWorkoutSession(db: DbAdapter, sessionId: number): void {
  db.run('DELETE FROM workout_sessions WHERE id = ?', [sessionId]);
}

/**
 * The best set (V1's Epley at any rep count) of the most recent completed session
 * that logged this exercise, in any split.
 */
export function getLastExercisePerformance(db: DbAdapter, exerciseId: number): PastSet | null {
  const latest = db.get<{ session_id: number }>(
    `SELECT l.session_id FROM set_logs l
     JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
     WHERE l.exercise_id = ? ORDER BY l.id DESC LIMIT 1`,
    [exerciseId]
  );
  if (!latest) return null;
  const sets = db.all<PastSet>(
    'SELECT set_number, weight, reps FROM set_logs WHERE exercise_id = ? AND session_id = ? ORDER BY id',
    [exerciseId, latest.session_id]
  );
  if (sets.length === 0) return null;
  const v1Estimate = (s: PastSet) => (s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30));
  let best = sets[0];
  for (const set of sets) if (v1Estimate(set) > v1Estimate(best)) best = set;
  return best;
}

// ==========================================
// TOP SETS, COVERAGE, HISTORY, CALENDAR
// ==========================================

/** Heaviest set per exercise (V1's Top Sets tab). */
export function getTopSets(db: DbAdapter): TopSetRow[] {
  return db.all<TopSetRow>(
    `SELECT e.id AS exercise_id, e.name, e.variation, s.split_name AS split_category,
            e.primary_muscle AS target_muscle, MAX(l.weight) AS weight, l.reps, s.local_date AS date
     FROM set_logs l
     JOIN exercises e ON e.id = l.exercise_id
     JOIN workout_sessions s ON s.id = l.session_id
     WHERE l.weight > 0 AND s.status = 'completed'
     GROUP BY e.id
     ORDER BY weight DESC`
  );
}

/**
 * Coverage per muscle over the last 7 local days including `today`:
 * red = in no active routine (V1: in no split), grey = none logged, gold = 1+ sets.
 */
export function getMuscleCoverage(
  db: DbAdapter,
  muscles: readonly string[],
  today: string
): Record<string, MuscleCoverage> {
  const existing = new Set(
    db
      .all<{ muscle: string }>(
        `SELECT DISTINCT e.primary_muscle AS muscle FROM routine_exercises re
         JOIN routines r ON r.id = re.routine_id AND r.archived_at IS NULL
         JOIN exercises e ON e.id = re.exercise_id AND e.archived_at IS NULL`
      )
      .map((r) => r.muscle)
  );
  const recent = new Map(
    db
      .all<{ muscle: string; n: number }>(
        `SELECT e.primary_muscle AS muscle, COUNT(l.id) AS n
         FROM set_logs l
         JOIN exercises e ON e.id = l.exercise_id
         JOIN workout_sessions s ON s.id = l.session_id
         WHERE s.status = 'completed' AND s.local_date >= ? AND s.local_date <= ?
         GROUP BY e.primary_muscle`,
        [addDays(today, -6), today]
      )
      .map((r) => [r.muscle, r.n] as const)
  );
  const result: Record<string, MuscleCoverage> = {};
  for (const muscle of muscles) {
    const hasExercise = existing.has(muscle);
    const setsThisWeek = recent.get(muscle) ?? 0;
    result[muscle] = {
      status: !hasExercise ? 'red' : setsThisWeek > 0 ? 'gold' : 'grey',
      hasExercise,
      setsThisWeek,
    };
  }
  return result;
}

/** Completed sessions, newest first, each with its sets (V1's History tab). */
export function getWorkoutHistory(db: DbAdapter): HistorySession[] {
  const sessions = db.all<Omit<HistorySession, 'sets'>>(
    `SELECT s.id AS session_id, s.split_name, s.date_completed, s.local_date, s.notes,
            COUNT(l.id) AS total_sets, SUM(l.weight * l.reps) AS total_volume
     FROM workout_sessions s
     LEFT JOIN set_logs l ON l.session_id = s.id
     WHERE s.status = 'completed'
     GROUP BY s.id
     ORDER BY s.date_completed DESC, s.id DESC`
  );
  return sessions.map((session) => ({
    ...session,
    sets: db.all<HistorySet>(
      `SELECT e.name AS exercise_name, e.variation, e.primary_muscle AS target_muscle,
              l.set_number, l.weight, l.reps
       FROM set_logs l
       JOIN exercises e ON e.id = l.exercise_id
       LEFT JOIN session_exercises se ON se.session_id = l.session_id AND se.exercise_id = l.exercise_id
       WHERE l.session_id = ?
       ORDER BY COALESCE(se.position, 1000000), e.primary_muscle, e.name, l.set_number, l.id`,
      [session.session_id]
    ),
  }));
}

/**
 * Workout days by local date, with V1's "Big 3" mark: a day holding the heaviest
 * set ever logged of an exercise whose name contains bench press, squat or deadlift.
 */
export function getCalendarActivity(db: DbAdapter): Record<string, CalendarDay> {
  const days = db.all<{ d: string }>(
    `SELECT DISTINCT local_date AS d FROM workout_sessions
     WHERE status = 'completed' AND local_date IS NOT NULL`
  );
  const prDays = new Set(
    db
      .all<{ d: string }>(
        `SELECT DISTINCT s.local_date AS d
         FROM set_logs l
         JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
         JOIN exercises e ON e.id = l.exercise_id
         WHERE (LOWER(e.name) LIKE '%bench press%' OR LOWER(e.name) LIKE '%squat%' OR LOWER(e.name) LIKE '%deadlift%')
           AND l.weight > 0
           AND l.weight = (SELECT MAX(l2.weight) FROM set_logs l2
                           JOIN workout_sessions s2 ON s2.id = l2.session_id AND s2.status = 'completed'
                           WHERE l2.exercise_id = l.exercise_id)`
      )
      .map((r) => r.d)
  );
  const map: Record<string, CalendarDay> = {};
  for (const { d } of days) map[d] = { hasWorkout: true, hasPR: prDays.has(d) };
  return map;
}
