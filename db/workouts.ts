/**
 * The active workout in SQLite (crash safety).
 *
 * A workout is a `workout_sessions` row with `status = 'in_progress'` from the
 * moment it starts. Ticked sets go to `set_logs` immediately; the rest of the
 * on-screen state is the session's `draft_json`. Finishing rewrites the session's
 * sets from the final draft in one transaction and marks it completed; discarding
 * deletes it. Every statistic reads completed sessions only, so an unfinished
 * workout never shows in History, Top Sets, PRs or "last time".
 */
import { localDateString } from '../lib/dates';
import { bestsFromSets, type ExerciseBests } from '../lib/prs';
import type { LoggedSet, SetType } from '../lib/workoutDraft';
import { type DbAdapter, transaction } from './adapter';
import type { Clock } from './queries';

export interface InProgressWorkout {
  id: number;
  name: string;
  routineId: number | null;
  startedAt: string;
  draftJson: string | null;
}

/** Creates the in-progress session. `local_date` is the day it started. */
export function startWorkout(
  db: DbAdapter,
  start: { name: string; routineId: number | null; draftJson: string },
  clock: Clock
): number {
  const iso = clock.now.toISOString();
  return db.run(
    `INSERT INTO workout_sessions
       (split_name, date_completed, notes, routine_id, status, started_at, local_date, tz_offset_minutes, draft_json)
     VALUES (?, ?, '', ?, 'in_progress', ?, ?, ?, ?)`,
    [
      start.name,
      iso,
      start.routineId,
      iso,
      localDateString(clock.now, clock.tzOffsetMinutes),
      clock.tzOffsetMinutes,
      start.draftJson,
    ]
  ).lastInsertRowId;
}

/** The unfinished workout, if any (the newest, should there ever be more than one). */
export function getInProgressWorkout(db: DbAdapter): InProgressWorkout | null {
  return (
    db.get<InProgressWorkout>(
      `SELECT id, split_name AS name, routine_id AS routineId, started_at AS startedAt, draft_json AS draftJson
       FROM workout_sessions WHERE status = 'in_progress' ORDER BY id DESC LIMIT 1`
    ) ?? null
  );
}

export function saveWorkoutDraft(db: DbAdapter, sessionId: number, draftJson: string): void {
  db.run(`UPDATE workout_sessions SET draft_json = ? WHERE id = ? AND status = 'in_progress'`, [
    draftJson,
    sessionId,
  ]);
}

export function renameWorkout(db: DbAdapter, sessionId: number, name: string): void {
  db.run(`UPDATE workout_sessions SET split_name = ? WHERE id = ?`, [name, sessionId]);
}

/** Writes one ticked set (and the exercise's place in the session). Returns its id. */
export function logSet(db: DbAdapter, sessionId: number, set: LoggedSet, exercisePosition: number): number {
  return transaction(db, () => {
    db.run(
      `INSERT INTO session_exercises (session_id, exercise_id, position) VALUES (?, ?, ?)
       ON CONFLICT (session_id, exercise_id) DO UPDATE SET position = excluded.position`,
      [sessionId, set.exerciseId, exercisePosition]
    );
    return db.run(
      `INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps, set_type, rpe, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, set.exerciseId, set.setNumber, set.weight, set.reps, set.setType, set.rpe, set.completedAt]
    ).lastInsertRowId;
  });
}

/** Updates a ticked set after its values were edited. */
export function updateLoggedSet(db: DbAdapter, setId: number, set: LoggedSet): void {
  db.run(`UPDATE set_logs SET set_number = ?, weight = ?, reps = ?, set_type = ?, rpe = ? WHERE id = ?`, [
    set.setNumber,
    set.weight,
    set.reps,
    set.setType,
    set.rpe,
    setId,
  ]);
}

/** Removes a set that was unticked or deleted. Only sets of an unfinished workout. */
export function deleteLoggedSet(db: DbAdapter, setId: number): void {
  db.run(
    `DELETE FROM set_logs WHERE id = ?
       AND session_id IN (SELECT id FROM workout_sessions WHERE status = 'in_progress')`,
    [setId]
  );
}

export interface FinishInput {
  name: string;
  /** Exercises in screen order with their notes; exercises without ticked sets are dropped. */
  exercises: { exerciseId: number; notes: string }[];
  sets: LoggedSet[];
}

/**
 * Completes the workout: its sets become exactly `sets`, in one transaction.
 * Throws (and changes nothing) if there are no sets or it isn't in progress.
 */
export function finishWorkout(db: DbAdapter, sessionId: number, input: FinishInput, clock: Clock): void {
  if (input.sets.length === 0) throw new Error('A workout needs at least one completed set.');
  const iso = clock.now.toISOString();
  transaction(db, () => {
    const session = db.get<{ status: string }>('SELECT status FROM workout_sessions WHERE id = ?', [sessionId]);
    if (session?.status !== 'in_progress') throw new Error(`Workout ${sessionId} is not in progress.`);

    db.run('DELETE FROM set_logs WHERE session_id = ?', [sessionId]);
    db.run('DELETE FROM session_exercises WHERE session_id = ?', [sessionId]);
    const withSets = new Set(input.sets.map((s) => s.exerciseId));
    input.exercises
      .filter((e) => withSets.has(e.exerciseId))
      .forEach((e, position) => {
        db.run('INSERT INTO session_exercises (session_id, exercise_id, position, notes) VALUES (?, ?, ?, ?)', [
          sessionId,
          e.exerciseId,
          position,
          e.notes.trim() === '' ? null : e.notes.trim(),
        ]);
      });
    for (const s of input.sets) {
      db.run(
        `INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps, set_type, rpe, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, s.exerciseId, s.setNumber, s.weight, s.reps, s.setType, s.rpe, s.completedAt]
      );
    }
    db.run(
      `UPDATE workout_sessions
       SET status = 'completed', split_name = ?, ended_at = ?, date_completed = ?, draft_json = NULL
       WHERE id = ?`,
      [input.name, iso, iso, sessionId]
    );
  });
}

/** Deletes an unfinished workout and its sets. */
export function discardWorkout(db: DbAdapter, sessionId: number): void {
  db.run(`DELETE FROM workout_sessions WHERE id = ? AND status = 'in_progress'`, [sessionId]);
}

// ==========================================
// "PREVIOUS" AND ALL-TIME BESTS
// ==========================================

export interface PreviousSet {
  setNumber: number;
  weight: number;
  reps: number;
  setType: SetType;
}

/** The exercise's sets in its most recent completed session, by set number. */
export function getPreviousSets(db: DbAdapter, exerciseId: number): PreviousSet[] {
  const latest = db.get<{ id: number }>(
    `SELECT s.id FROM workout_sessions s
     WHERE s.status = 'completed' AND EXISTS (SELECT 1 FROM set_logs l WHERE l.session_id = s.id AND l.exercise_id = ?)
     ORDER BY s.date_completed DESC, s.id DESC LIMIT 1`,
    [exerciseId]
  );
  if (!latest) return [];
  return db.all<PreviousSet>(
    `SELECT set_number AS setNumber, weight, reps, set_type AS setType FROM set_logs
     WHERE session_id = ? AND exercise_id = ? ORDER BY set_number, id`,
    [latest.id, exerciseId]
  );
}

/** All-time bests from completed workouts (warm-ups excluded). */
export function getExerciseBests(db: DbAdapter, exerciseId: number): ExerciseBests {
  const sets = db.all<{ weight: number; reps: number }>(
    `SELECT DISTINCT l.weight, l.reps FROM set_logs l
     JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
     WHERE l.exercise_id = ? AND l.set_type != 'warmup' AND l.weight > 0 AND l.reps > 0`,
    [exerciseId]
  );
  return bestsFromSets(sets);
}

/** The most recent completed workout, for "Repeat last workout". */
export function getLastCompletedWorkout(
  db: DbAdapter
): { id: number; name: string; routineId: number | null; localDate: string | null } | null {
  return (
    db.get<{ id: number; name: string; routineId: number | null; localDate: string | null }>(
      `SELECT id, split_name AS name, routine_id AS routineId, local_date AS localDate
       FROM workout_sessions WHERE status = 'completed'
       ORDER BY date_completed DESC, id DESC LIMIT 1`
    ) ?? null
  );
}

export interface SessionExerciseInfo {
  exerciseId: number;
  name: string;
  variation: string;
  muscle: string;
  setCount: number;
}

/** A completed workout's exercises in their order, with how many sets each had. */
export function getSessionExercises(db: DbAdapter, sessionId: number): SessionExerciseInfo[] {
  return db.all<SessionExerciseInfo>(
    `SELECT e.id AS exerciseId, e.name, e.variation, e.primary_muscle AS muscle, COUNT(l.id) AS setCount
     FROM set_logs l
     JOIN exercises e ON e.id = l.exercise_id
     LEFT JOIN session_exercises se ON se.session_id = l.session_id AND se.exercise_id = l.exercise_id
     WHERE l.session_id = ?
     GROUP BY e.id
     ORDER BY COALESCE(MIN(se.position), 1000000), MIN(l.id)`,
    [sessionId]
  );
}
