/**
 * Routines (V1's splits, templates and the user's own) and the exercise library.
 */
import { type DbAdapter, transaction } from './adapter';
import { ensureExercise, type RoutineSource } from './queries';
import { ALL_MUSCLE_GROUPS } from './v1Constants';

export interface RoutineSummary {
  id: number;
  name: string;
  position: number;
  source: RoutineSource;
  archivedAt: string | null;
  exerciseCount: number;
  /** Exercise names in order, for the card subtitle. */
  exerciseNames: string;
}

export interface RoutineExercise {
  id: number;
  exerciseId: number;
  name: string;
  variation: string;
  muscle: string;
  position: number;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number | null;
  notes: string | null;
}

/** Routines in their order; archived ones only when asked. */
export function listRoutines(db: DbAdapter, includeArchived = false): RoutineSummary[] {
  const routines = db.all<Omit<RoutineSummary, 'exerciseCount' | 'exerciseNames'>>(
    `SELECT id, name, position, source, archived_at AS archivedAt FROM routines
     WHERE ? OR archived_at IS NULL
     ORDER BY archived_at IS NOT NULL, position, id`,
    [includeArchived ? 1 : 0]
  );
  // Names in routine order (SQLite's GROUP_CONCAT order isn't guaranteed).
  const names = new Map<number, string[]>();
  for (const row of db.all<{ routineId: number; name: string }>(
    `SELECT re.routine_id AS routineId, e.name FROM routine_exercises re
     JOIN exercises e ON e.id = re.exercise_id AND e.archived_at IS NULL
     ORDER BY re.routine_id, re.position, re.id`
  )) {
    names.set(row.routineId, [...(names.get(row.routineId) ?? []), row.name]);
  }
  return routines.map((r) => {
    const list = names.get(r.id) ?? [];
    return { ...r, exerciseCount: list.length, exerciseNames: list.join(' · ') };
  });
}

export function getRoutine(db: DbAdapter, routineId: number): { id: number; name: string; archivedAt: string | null } | null {
  return db.get('SELECT id, name, archived_at AS archivedAt FROM routines WHERE id = ?', [routineId]);
}

/** A routine's exercises in order (archived exercises are hidden). */
export function getRoutineExercises(db: DbAdapter, routineId: number): RoutineExercise[] {
  return db.all<RoutineExercise>(
    `SELECT re.id, e.id AS exerciseId, e.name, e.variation, e.primary_muscle AS muscle, re.position,
            re.target_sets AS targetSets, re.rep_min AS repMin, re.rep_max AS repMax,
            re.rest_seconds AS restSeconds, re.notes
     FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? AND e.archived_at IS NULL
     ORDER BY re.position, re.id`,
    [routineId]
  );
}

const nextRoutinePosition = (db: DbAdapter) =>
  (db.get<{ p: number | null }>('SELECT MAX(position) AS p FROM routines')?.p ?? -1) + 1;

export function createRoutine(db: DbAdapter, name: string, nowIso: string, source: RoutineSource = 'user'): number {
  return db.run('INSERT INTO routines (name, position, source, created_at) VALUES (?, ?, ?, ?)', [
    name.trim() || 'New routine',
    nextRoutinePosition(db),
    source,
    nowIso,
  ]).lastInsertRowId;
}

export function renameRoutine(db: DbAdapter, routineId: number, name: string): void {
  if (name.trim() === '') return;
  db.run('UPDATE routines SET name = ? WHERE id = ?', [name.trim(), routineId]);
}

export interface RoutineExerciseInput {
  exerciseId: number;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number | null;
  notes?: string | null;
}

/** Replaces a routine's exercise list (in the given order) in one transaction. */
export function setRoutineExercises(db: DbAdapter, routineId: number, items: RoutineExerciseInput[]): void {
  transaction(db, () => writeRoutineExercises(db, routineId, items));
}

/** `setRoutineExercises` without its own transaction (for callers that already hold one). */
export function writeRoutineExercises(db: DbAdapter, routineId: number, items: RoutineExerciseInput[]): void {
  {
    // Archived exercises are hidden from the editor but stay in the routine.
    const hidden = db.all<{ exercise_id: number }>(
      `SELECT re.exercise_id FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
       WHERE re.routine_id = ? AND e.archived_at IS NOT NULL`,
      [routineId]
    );
    db.run(
      `DELETE FROM routine_exercises WHERE routine_id = ?
         AND exercise_id NOT IN (SELECT id FROM exercises WHERE archived_at IS NOT NULL)`,
      [routineId]
    );
    const seen = new Set(hidden.map((h) => h.exercise_id));
    let position = hidden.length;
    for (const item of items) {
      if (seen.has(item.exerciseId)) continue;
      seen.add(item.exerciseId);
      db.run(
        `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          routineId,
          item.exerciseId,
          position++,
          Math.max(1, Math.min(20, Math.round(item.targetSets))),
          item.repMin,
          item.repMax,
          item.restSeconds,
          item.notes ?? null,
        ]
      );
    }
  }
}

/** Copies a routine (name + " (copy)") right after the original. Returns the new id. */
export function duplicateRoutine(db: DbAdapter, routineId: number, nowIso: string): number {
  return transaction(db, () => {
    const source = db.get<{ name: string; position: number }>('SELECT name, position FROM routines WHERE id = ?', [
      routineId,
    ]);
    if (!source) throw new Error(`No routine ${routineId}`);
    db.run('UPDATE routines SET position = position + 1 WHERE position > ?', [source.position]);
    const id = db.run("INSERT INTO routines (name, position, source, created_at) VALUES (?, ?, 'user', ?)", [
      `${source.name} (copy)`,
      source.position + 1,
      nowIso,
    ]).lastInsertRowId;
    db.run(
      `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, superset_group, notes)
       SELECT ?, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, superset_group, notes
       FROM routine_exercises WHERE routine_id = ? ORDER BY position, id`,
      [id, routineId]
    );
    return id;
  });
}

export function setRoutineArchived(db: DbAdapter, routineId: number, archived: boolean, nowIso: string): void {
  db.run('UPDATE routines SET archived_at = ? WHERE id = ?', [archived ? nowIso : null, routineId]);
  if (!archived) db.run('UPDATE routines SET position = ? WHERE id = ?', [nextRoutinePosition(db), routineId]);
}

/** Saves the order of the active routines. */
export function reorderRoutines(db: DbAdapter, orderedIds: number[]): void {
  transaction(db, () => {
    orderedIds.forEach((id, position) => db.run('UPDATE routines SET position = ? WHERE id = ?', [position, id]));
  });
}

// ==========================================
// EXERCISE LIBRARY
// ==========================================

export interface LibraryExercise {
  id: number;
  name: string;
  variation: string;
  muscle: string;
  secondaryMuscles: string;
  equipment: string | null;
  isCustom: number;
  archivedAt: string | null;
  setCount: number;
}

export function listExercises(db: DbAdapter, includeArchived = false): LibraryExercise[] {
  return db.all<LibraryExercise>(
    `SELECT e.id, e.name, e.variation, e.primary_muscle AS muscle, e.secondary_muscles AS secondaryMuscles,
            e.equipment, e.is_custom AS isCustom, e.archived_at AS archivedAt,
            (SELECT COUNT(*) FROM set_logs l WHERE l.exercise_id = e.id) AS setCount
     FROM exercises e
     WHERE ? OR e.archived_at IS NULL
     ORDER BY LOWER(e.name), LOWER(e.variation)`,
    [includeArchived ? 1 : 0]
  );
}

export function getExercise(db: DbAdapter, id: number): LibraryExercise | null {
  return listExercises(db, true).find((e) => e.id === id) ?? null;
}

/** A custom exercise in the library (or the existing one with that name + variation, un-archived). */
/** Secondary muscles as stored: known muscle groups only, no duplicates, never the main muscle. */
export function cleanSecondaryMuscles(secondary: readonly string[], primary: string): string[] {
  return [...new Set(secondary)].filter((m) => m !== primary && ALL_MUSCLE_GROUPS.includes(m));
}

export function createCustomExercise(
  db: DbAdapter,
  input: { name: string; variation: string; muscle: string; secondary?: readonly string[]; equipment?: string | null },
  nowIso: string
): number {
  return transaction(db, () => {
    const id = ensureExercise(db, { ...input, isCustom: true }, nowIso);
    if (input.equipment) db.run('UPDATE exercises SET equipment = COALESCE(equipment, ?) WHERE id = ?', [input.equipment, id]);
    // Secondary muscles fill an exercise that has none yet (a new one, or an existing one
    // without any); muscles an exercise already has are never replaced from here.
    const row = db.get<{ primary: string }>('SELECT primary_muscle AS "primary" FROM exercises WHERE id = ?', [id]);
    const secondary = cleanSecondaryMuscles(input.secondary ?? [], row?.primary ?? input.muscle);
    if (secondary.length > 0) {
      db.run(`UPDATE exercises SET secondary_muscles = ? WHERE id = ? AND secondary_muscles = '[]'`, [
        JSON.stringify(secondary),
        id,
      ]);
    }
    return id;
  });
}

/** Archiving hides an exercise from pickers and routines; its history stays. */
export function setExerciseArchived(db: DbAdapter, id: number, archived: boolean, nowIso: string): void {
  db.run('UPDATE exercises SET archived_at = ? WHERE id = ?', [archived ? nowIso : null, id]);
}

/**
 * Deletes an exercise that has never been logged (also from routines). Returns
 * false, and deletes nothing, if it has logged sets or is in a workout in progress.
 */
export function deleteExerciseIfUnused(db: DbAdapter, id: number): boolean {
  return transaction(db, () => {
    const used =
      db.get('SELECT 1 FROM set_logs WHERE exercise_id = ? LIMIT 1', [id]) ??
      db.get('SELECT 1 FROM session_exercises WHERE exercise_id = ? LIMIT 1', [id]) ??
      db.get(
        `SELECT 1 FROM workout_sessions WHERE status = 'in_progress' AND draft_json LIKE ? LIMIT 1`,
        [`%"exerciseId":${id},%`]
      );
    if (used) return false;
    db.run('DELETE FROM routine_exercises WHERE exercise_id = ?', [id]);
    db.run('DELETE FROM exercises WHERE id = ?', [id]);
    return true;
  });
}
