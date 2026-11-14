/**
 * Completed workouts: the History list, one session in detail, editing and deleting
 * a past session, and the PR timeline.
 *
 * Every function here only reads or changes sessions with `status = 'completed'`.
 * A workout in progress (its row, its ticked sets, its `draft_json`) is never
 * touched: edits and deletes of it are refused.
 *
 * PRs and bests are never stored; they are derived from completed `set_logs`
 * (`workouts.ts` → `getExerciseBests`, `prTimeline` below). Editing or deleting
 * sets therefore can't leave a stale record behind.
 */
import { daysBetween, isLocalDateString } from '../lib/dates';
import { addToBests, detectPrs, emptyBests, type ExerciseBests, type PrKind } from '../lib/prs';
import { SET_TYPES, type SetType } from '../lib/workoutDraft';
import { type DbAdapter, transaction } from './adapter';

// ==========================================
// HISTORY LIST
// ==========================================

export interface SessionListItem {
  id: number;
  name: string;
  routineId: number | null;
  localDate: string | null;
  startedAt: string | null;
  endedAt: string | null;
  dateCompleted: string;
  notes: string | null;
  setCount: number;
  /** kg × reps over every set; 0 for a session without sets. */
  volumeKg: number;
  /** Exercise names in session order, comma-separated. */
  exerciseNames: string;
}

export interface HistoryFilter {
  routineId?: number | null;
  exerciseId?: number | null;
}

/** Completed sessions, newest first, optionally only one routine's or those with one exercise. */
export function listSessions(db: DbAdapter, filter: HistoryFilter = {}): SessionListItem[] {
  const routineId = filter.routineId ?? null;
  const exerciseId = filter.exerciseId ?? null;
  const sessions = db.all<Omit<SessionListItem, 'exerciseNames'>>(
    `SELECT s.id, s.split_name AS name, s.routine_id AS routineId, s.local_date AS localDate,
            s.started_at AS startedAt, s.ended_at AS endedAt, s.date_completed AS dateCompleted, s.notes,
            (SELECT COUNT(*) FROM set_logs l WHERE l.session_id = s.id) AS setCount,
            COALESCE((SELECT SUM(l.weight * l.reps) FROM set_logs l WHERE l.session_id = s.id), 0) AS volumeKg
     FROM workout_sessions s
     WHERE s.status = 'completed'
       AND (? IS NULL OR s.routine_id = ?)
       AND (? IS NULL OR EXISTS (SELECT 1 FROM set_logs l WHERE l.session_id = s.id AND l.exercise_id = ?))
     ORDER BY s.date_completed DESC, s.id DESC`,
    [routineId, routineId, exerciseId, exerciseId]
  );
  // Exercise names in session order (built here: SQLite's GROUP_CONCAT order isn't guaranteed).
  const names = new Map<number, string[]>();
  for (const row of db.all<{ sessionId: number; name: string }>(
    `SELECT l.session_id AS sessionId, e.name FROM set_logs l
     JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
     JOIN exercises e ON e.id = l.exercise_id
     LEFT JOIN session_exercises se ON se.session_id = l.session_id AND se.exercise_id = l.exercise_id
     GROUP BY l.session_id, e.id
     ORDER BY l.session_id, COALESCE(MIN(se.position), 1000000), MIN(l.id)`
  )) {
    names.set(row.sessionId, [...(names.get(row.sessionId) ?? []), row.name]);
  }
  return sessions.map((s) => ({ ...s, exerciseNames: (names.get(s.id) ?? []).join(', ') }));
}

/**
 * How long a workout took, in whole seconds, or null when unknown (V1 workouts
 * only stored the finish time, so start = end).
 */
export function sessionDurationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const seconds = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Routines that have completed sessions (for the History filter), by name. */
export function routinesWithSessions(db: DbAdapter): { id: number; name: string }[] {
  return db.all<{ id: number; name: string }>(
    `SELECT DISTINCT r.id, r.name FROM routines r
     JOIN workout_sessions s ON s.routine_id = r.id AND s.status = 'completed'
     ORDER BY LOWER(r.name), r.id`
  );
}

/** Exercises with completed sets (for the History filter), by name. */
export function exercisesWithSets(db: DbAdapter): { id: number; name: string; variation: string }[] {
  return db.all<{ id: number; name: string; variation: string }>(
    `SELECT DISTINCT e.id, e.name, e.variation FROM exercises e
     JOIN set_logs l ON l.exercise_id = e.id
     JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
     ORDER BY LOWER(e.name), LOWER(e.variation)`
  );
}

// ==========================================
// ONE SESSION
// ==========================================

export interface SessionSet {
  id: number;
  setNumber: number;
  weight: number;
  reps: number;
  setType: SetType;
  rpe: number | null;
}

export interface SessionExerciseDetail {
  exerciseId: number;
  name: string;
  variation: string;
  muscle: string;
  equipment: string | null;
  notes: string | null;
  sets: SessionSet[];
}

export interface SessionDetail {
  id: number;
  name: string;
  routineId: number | null;
  localDate: string | null;
  tzOffsetMinutes: number | null;
  startedAt: string | null;
  endedAt: string | null;
  dateCompleted: string;
  notes: string | null;
  exercises: SessionExerciseDetail[];
}

/** A completed session with its exercises (in order) and sets; null if missing or still in progress. */
export function getSessionDetail(db: DbAdapter, sessionId: number): SessionDetail | null {
  const session = db.get<Omit<SessionDetail, 'exercises'>>(
    `SELECT id, split_name AS name, routine_id AS routineId, local_date AS localDate,
            tz_offset_minutes AS tzOffsetMinutes, started_at AS startedAt, ended_at AS endedAt,
            date_completed AS dateCompleted, notes
     FROM workout_sessions WHERE id = ? AND status = 'completed'`,
    [sessionId]
  );
  if (!session) return null;
  const rows = db.all<SessionSet & Omit<SessionExerciseDetail, 'sets'>>(
    `SELECT l.id, l.set_number AS setNumber, l.weight, l.reps, l.set_type AS setType, l.rpe,
            e.id AS exerciseId, e.name, e.variation, e.primary_muscle AS muscle, e.equipment, se.notes
     FROM set_logs l
     JOIN exercises e ON e.id = l.exercise_id
     LEFT JOIN session_exercises se ON se.session_id = l.session_id AND se.exercise_id = l.exercise_id
     WHERE l.session_id = ?
     ORDER BY COALESCE(se.position, 1000000), e.primary_muscle, e.name, l.set_number, l.id`,
    [sessionId]
  );
  const exercises: SessionExerciseDetail[] = [];
  for (const row of rows) {
    let exercise = exercises.find((e) => e.exerciseId === row.exerciseId);
    if (!exercise) {
      exercise = {
        exerciseId: row.exerciseId,
        name: row.name,
        variation: row.variation,
        muscle: row.muscle,
        equipment: row.equipment,
        notes: row.notes,
        sets: [],
      };
      exercises.push(exercise);
    }
    exercise.sets.push({
      id: row.id,
      setNumber: row.setNumber,
      weight: row.weight,
      reps: row.reps,
      setType: row.setType,
      rpe: row.rpe,
    });
  }
  return { ...session, exercises };
}

// ==========================================
// EDITING A PAST SESSION
// ==========================================

export interface SessionEditSet {
  /** The existing set's id; omitted for a set added while editing. */
  id?: number;
  weight: number;
  reps: number;
  setType: SetType;
  rpe: number | null;
}

export interface SessionEdit {
  name: string;
  notes: string;
  localDate: string;
  /** Exercises in order. An exercise with no sets left is removed from the session. */
  exercises: { exerciseId: number; notes: string; sets: SessionEditSet[] }[];
}

export class SessionEditError extends Error {}

function validateSet(set: SessionEditSet): void {
  if (!Number.isFinite(set.weight) || set.weight < 0) throw new SessionEditError('Weights must be 0 or more.');
  if (!Number.isInteger(set.reps) || set.reps < 1) throw new SessionEditError('Every set needs at least 1 rep.');
  if (!(SET_TYPES as readonly string[]).includes(set.setType)) throw new SessionEditError(`Unknown set type ${set.setType}.`);
  if (set.rpe !== null && !(set.rpe >= 1 && set.rpe <= 10)) throw new SessionEditError('RPE must be between 1 and 10.');
}

/** An ISO instant moved by whole days (keeps the time of day). */
function shiftIso(iso: string | null, days: number): string | null {
  if (!iso || days === 0) return iso;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms + days * 86_400_000).toISOString() : iso;
}

/**
 * Saves the edited session in one transaction: its name, notes, date and sets
 * (updated in place, added or deleted; set numbers follow the given order).
 * Moving the date shifts the start, end and finish times by the same number of
 * days, so the session sorts where its new date says. Throws, changing nothing,
 * if the session isn't completed, an id isn't one of its sets, a value is
 * invalid, or no set would be left (delete the session instead).
 */
export function saveSessionEdit(db: DbAdapter, sessionId: number, edit: SessionEdit): void {
  const name = edit.name.trim();
  if (name === '') throw new SessionEditError('The workout needs a name.');
  if (!isLocalDateString(edit.localDate)) throw new SessionEditError(`Not a date: ${edit.localDate}`);
  const exercises = edit.exercises.filter((e) => e.sets.length > 0);
  if (exercises.length === 0) throw new SessionEditError('A workout needs at least one set. Delete the workout instead.');
  if (new Set(exercises.map((e) => e.exerciseId)).size !== exercises.length) {
    throw new SessionEditError('An exercise can only appear once in a workout.');
  }
  exercises.forEach((e) => e.sets.forEach(validateSet));

  transaction(db, () => {
    const session = db.get<{
      status: string;
      local_date: string | null;
      started_at: string | null;
      ended_at: string | null;
      date_completed: string;
    }>('SELECT status, local_date, started_at, ended_at, date_completed FROM workout_sessions WHERE id = ?', [sessionId]);
    if (!session) throw new SessionEditError(`Workout ${sessionId} doesn't exist.`);
    if (session.status !== 'completed') throw new SessionEditError('A workout in progress can only be changed from the workout screen.');

    const existing = db.all<{ id: number; completed_at: string | null }>(
      'SELECT id, completed_at FROM set_logs WHERE session_id = ?',
      [sessionId]
    );
    const existingIds = new Set(existing.map((s) => s.id));
    const keptIds = new Set<number>();
    for (const e of exercises) {
      for (const s of e.sets) {
        if (s.id === undefined) continue;
        if (!existingIds.has(s.id) || keptIds.has(s.id)) throw new SessionEditError(`Set ${s.id} isn't part of this workout.`);
        keptIds.add(s.id);
      }
    }

    const days = session.local_date ? daysBetween(session.local_date, edit.localDate) : 0;
    const dateCompleted = shiftIso(session.date_completed, days) ?? session.date_completed;
    const completedAtForNew = shiftIso(session.ended_at, days) ?? dateCompleted;

    for (const s of existing) {
      if (!keptIds.has(s.id)) db.run('DELETE FROM set_logs WHERE id = ?', [s.id]);
    }
    db.run('DELETE FROM session_exercises WHERE session_id = ?', [sessionId]);
    exercises.forEach((e, position) => {
      const notes = e.notes.trim();
      db.run('INSERT INTO session_exercises (session_id, exercise_id, position, notes) VALUES (?, ?, ?, ?)', [
        sessionId,
        e.exerciseId,
        position,
        notes === '' ? null : notes,
      ]);
      e.sets.forEach((s, index) => {
        if (s.id !== undefined) {
          db.run(
            `UPDATE set_logs SET exercise_id = ?, set_number = ?, weight = ?, reps = ?, set_type = ?, rpe = ?,
                    completed_at = ? WHERE id = ?`,
            [
              e.exerciseId,
              index + 1,
              s.weight,
              s.reps,
              s.setType,
              s.rpe,
              shiftIso(existing.find((x) => x.id === s.id)?.completed_at ?? null, days),
              s.id,
            ]
          );
        } else {
          db.run(
            `INSERT INTO set_logs (session_id, exercise_id, set_number, weight, reps, set_type, rpe, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [sessionId, e.exerciseId, index + 1, s.weight, s.reps, s.setType, s.rpe, completedAtForNew]
          );
        }
      });
    });
    const notes = edit.notes.trim();
    db.run(
      `UPDATE workout_sessions SET split_name = ?, notes = ?, local_date = ?, started_at = ?, ended_at = ?, date_completed = ?
       WHERE id = ? AND status = 'completed'`,
      [
        name,
        notes,
        edit.localDate,
        shiftIso(session.started_at, days),
        shiftIso(session.ended_at, days),
        dateCompleted,
        sessionId,
      ]
    );
  });
}

/** Deletes a completed session (its sets and exercise rows cascade). Returns false if it isn't a completed session. */
export function deleteCompletedSession(db: DbAdapter, sessionId: number): boolean {
  return db.run(`DELETE FROM workout_sessions WHERE id = ? AND status = 'completed'`, [sessionId]).changes > 0;
}

// ==========================================
// PR TIMELINE
// ==========================================

export interface PrEvent {
  setId: number;
  sessionId: number;
  localDate: string | null;
  exerciseId: number;
  name: string;
  variation: string;
  weight: number;
  reps: number;
  prs: PrKind[];
}

/**
 * Every PR in history: completed sets replayed in the order they happened (finish
 * time, then set order), each compared with the bests before it, exactly as the
 * workout screen judges a new set. Warm-ups and bodyweight (0) sets never count;
 * the first time an exercise is logged is never a PR. Pass `exerciseId` for one
 * exercise only.
 */
export function prTimeline(db: DbAdapter, exerciseId?: number): PrEvent[] {
  const sets = db.all<Omit<PrEvent, 'prs'>>(
    `SELECT l.id AS setId, l.session_id AS sessionId, s.local_date AS localDate, l.exercise_id AS exerciseId,
            e.name, e.variation, l.weight, l.reps
     FROM set_logs l
     JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
     JOIN exercises e ON e.id = l.exercise_id
     WHERE l.set_type != 'warmup' AND (? IS NULL OR l.exercise_id = ?)
     ORDER BY s.date_completed, s.id, l.set_number, l.id`,
    [exerciseId ?? null, exerciseId ?? null]
  );
  const bests = new Map<number, ExerciseBests>();
  const events: PrEvent[] = [];
  for (const set of sets) {
    const before = bests.get(set.exerciseId) ?? emptyBests();
    const prs = detectPrs(before, set);
    if (prs.length > 0) events.push({ ...set, prs });
    bests.set(set.exerciseId, addToBests(before, set));
  }
  return events;
}
