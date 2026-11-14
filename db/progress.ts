/**
 * Queries behind the Progress tab, the exercise detail screen, coverage and the
 * calendar. Completed sessions only; the maths lives in `lib/stats.ts`.
 */
import { type CoverageSetRow, type ExerciseSetRow, isBig3, parseMuscleList, type SessionTotal } from '../lib/stats';
import { prLabel } from '../lib/prs';
import type { DbAdapter } from './adapter';
import { prTimeline } from './history';

/** Per completed session: local date, set count and volume (all sets, as History shows them). */
export function getSessionTotals(db: DbAdapter): (SessionTotal & { id: number })[] {
  return db.all<SessionTotal & { id: number }>(
    `SELECT s.id, s.local_date AS localDate, COUNT(l.id) AS setCount, COALESCE(SUM(l.weight * l.reps), 0) AS volumeKg
     FROM workout_sessions s
     LEFT JOIN set_logs l ON l.session_id = s.id
     WHERE s.status = 'completed' AND s.local_date IS NOT NULL
     GROUP BY s.id
     ORDER BY s.local_date, s.date_completed, s.id`
  );
}

/** An exercise's completed sets, oldest first, with their session. */
export function getExerciseSetRows(
  db: DbAdapter,
  exerciseId: number
): (ExerciseSetRow & { setId: number; setNumber: number; rpe: number | null; sessionName: string })[] {
  return db.all(
    `SELECT l.id AS setId, l.session_id AS sessionId, s.local_date AS localDate, s.split_name AS sessionName,
            l.set_number AS setNumber, l.weight, l.reps, l.set_type AS setType, l.rpe
     FROM set_logs l
     JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
     WHERE l.exercise_id = ? AND s.local_date IS NOT NULL
     ORDER BY s.date_completed, s.id, l.set_number, l.id`,
    [exerciseId]
  );
}

export interface RecentPr {
  setId: number;
  sessionId: number;
  localDate: string | null;
  exerciseId: number;
  name: string;
  variation: string;
  weight: number;
  reps: number;
  label: string;
}

/** The newest PR sets (one per exercise per session, its most significant record), newest first. */
export function getRecentPrs(db: DbAdapter, limit: number): RecentPr[] {
  const seen = new Set<string>();
  const out: RecentPr[] = [];
  const events = prTimeline(db);
  for (let i = events.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const e = events[i];
    const key = `${e.sessionId}:${e.exerciseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, label: prLabel(e.prs) ?? 'PR' });
  }
  return out;
}

/** Working sets (warm-ups excluded) from `from` to `to`, with each exercise's muscles. */
export function getCoverageSets(
  db: DbAdapter,
  from: string,
  to: string
): (CoverageSetRow & { sessionId: number; localDate: string; exerciseId: number; name: string; variation: string; weight: number; reps: number })[] {
  return db
    .all<{
      sessionId: number;
      localDate: string;
      exerciseId: number;
      name: string;
      variation: string;
      weight: number;
      reps: number;
      primaryMuscle: string;
      secondary: string | null;
    }>(
      `SELECT l.session_id AS sessionId, s.local_date AS localDate, e.id AS exerciseId, e.name, e.variation,
              l.weight, l.reps, e.primary_muscle AS primaryMuscle, e.secondary_muscles AS secondary
       FROM set_logs l
       JOIN workout_sessions s ON s.id = l.session_id AND s.status = 'completed'
       JOIN exercises e ON e.id = l.exercise_id
       WHERE l.set_type != 'warmup' AND s.local_date >= ? AND s.local_date <= ?
       ORDER BY s.date_completed, s.id, l.set_number, l.id`,
      [from, to]
    )
    .map(({ secondary, ...row }) => ({ ...row, secondaryMuscles: parseMuscleList(secondary) }));
}

/** Primary muscles of the exercises in active routines (coverage's "no exercise yet" hint is the rest). */
export function getRoutineMuscles(db: DbAdapter): Set<string> {
  return new Set(
    db
      .all<{ muscle: string }>(
        `SELECT DISTINCT e.primary_muscle AS muscle FROM routine_exercises re
         JOIN routines r ON r.id = re.routine_id AND r.archived_at IS NULL
         JOIN exercises e ON e.id = re.exercise_id AND e.archived_at IS NULL`
      )
      .map((r) => r.muscle)
  );
}

export interface MuscleExercise {
  id: number;
  name: string;
  variation: string;
  /** True if this is the exercise's primary muscle (else it trains it as a secondary). */
  primary: boolean;
  inRoutine: boolean;
}

/** Active exercises that train `muscle`: primary ones first, then secondary; routine ones first within each. */
export function getExercisesForMuscle(db: DbAdapter, muscle: string): MuscleExercise[] {
  const inRoutines = new Set(
    db
      .all<{ id: number }>(
        `SELECT DISTINCT re.exercise_id AS id FROM routine_exercises re
         JOIN routines r ON r.id = re.routine_id AND r.archived_at IS NULL`
      )
      .map((r) => r.id)
  );
  return db
    .all<{ id: number; name: string; variation: string; primaryMuscle: string; secondary: string | null }>(
      `SELECT id, name, variation, primary_muscle AS primaryMuscle, secondary_muscles AS secondary
       FROM exercises WHERE archived_at IS NULL ORDER BY LOWER(name), LOWER(variation)`
    )
    .map((e) => ({
      id: e.id,
      name: e.name,
      variation: e.variation,
      primary: e.primaryMuscle === muscle,
      secondary: parseMuscleList(e.secondary).includes(muscle),
      inRoutine: inRoutines.has(e.id),
    }))
    .filter((e) => e.primary || e.secondary)
    .sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.inRoutine) - Number(a.inRoutine))
    .map(({ secondary: _secondary, ...e }) => e);
}

export interface CalendarDayInfo {
  /** Completed sessions that day, in order. */
  sessions: { id: number; name: string; setCount: number; volumeKg: number }[];
  /** Any exercise set a PR that day. */
  hasPr: boolean;
  /** A Big 3 lift (bench press, squat, deadlift) set a PR that day. */
  hasBig3Pr: boolean;
}

/** Calendar data by local date: the day's sessions and PR marks (PRs as the timeline judges them). */
export function getCalendarDays(db: DbAdapter): Record<string, CalendarDayInfo> {
  const days: Record<string, CalendarDayInfo> = {};
  const sessions = db.all<{ id: number; name: string; localDate: string; setCount: number; volumeKg: number }>(
    `SELECT s.id, s.split_name AS name, s.local_date AS localDate, COUNT(l.id) AS setCount,
            COALESCE(SUM(l.weight * l.reps), 0) AS volumeKg
     FROM workout_sessions s LEFT JOIN set_logs l ON l.session_id = s.id
     WHERE s.status = 'completed' AND s.local_date IS NOT NULL
     GROUP BY s.id ORDER BY s.date_completed, s.id`
  );
  for (const { localDate, ...s } of sessions) {
    (days[localDate] ??= { sessions: [], hasPr: false, hasBig3Pr: false }).sessions.push(s);
  }
  for (const e of prTimeline(db)) {
    const day = e.localDate ? days[e.localDate] : undefined;
    if (!day) continue;
    day.hasPr = true;
    if (isBig3(e.name, e.variation)) day.hasBig3Pr = true;
  }
  return days;
}

/** Active routines in their order (for "Start next workout") and the routine of the last completed workout that had one. */
export function getNextRoutineInputs(db: DbAdapter): { routineIds: number[]; lastRoutineId: number | null } {
  const routineIds = db
    .all<{ id: number }>('SELECT id FROM routines WHERE archived_at IS NULL ORDER BY position, id')
    .map((r) => r.id);
  const last = db.get<{ routineId: number }>(
    `SELECT routine_id AS routineId FROM workout_sessions
     WHERE status = 'completed' AND routine_id IS NOT NULL
     ORDER BY date_completed DESC, id DESC LIMIT 1`
  );
  return { routineIds, lastRoutineId: last?.routineId ?? null };
}
